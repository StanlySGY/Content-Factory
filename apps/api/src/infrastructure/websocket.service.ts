import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "node:http";
import type { Logger } from "pino";

interface WSClient {
  ws: WebSocket;
  taskId?: string;
  userId?: string;
}

interface TaskProgressMessage {
  type: "task_progress";
  taskId: string;
  stageId: string;
  status: "pending" | "running" | "completed" | "failed";
  progress?: number;
  message?: string;
  timestamp: string;
}

interface TaskCompletedMessage {
  type: "task_completed";
  taskId: string;
  result: any;
  timestamp: string;
}

export type WebSocketMessage = TaskProgressMessage | TaskCompletedMessage;

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, WSClient>;
  private taskRooms: Map<string, Set<string>>; // taskId -> Set<clientId>
  private logger: Logger;

  constructor(httpServer: HttpServer, logger: Logger) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: "/ws"
    });
    this.clients = new Map();
    this.taskRooms = new Map();
    this.logger = logger.child({ service: "websocket" });

    this.wss.on("connection", (ws, req) => {
      const clientId = this.generateClientId();
      const client: WSClient = { ws };

      this.clients.set(clientId, client);
      this.logger.info({ clientId }, "WebSocket client connected");

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(clientId, message);
        } catch (err) {
          this.logger.error({ clientId, err }, "Failed to parse WebSocket message");
        }
      });

      ws.on("close", () => {
        this.handleDisconnect(clientId);
      });

      ws.on("error", (err) => {
        this.logger.error({ clientId, err }, "WebSocket error");
      });

      // 发送连接确认
      this.sendToClient(clientId, {
        type: "connected",
        clientId,
        timestamp: new Date().toISOString(),
      });
    });

    this.logger.info("WebSocket service initialized");
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private handleClientMessage(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case "subscribe_task":
        this.subscribeToTask(clientId, message.taskId);
        break;

      case "unsubscribe_task":
        this.unsubscribeFromTask(clientId, message.taskId);
        break;

      case "ping":
        this.sendToClient(clientId, { type: "pong", timestamp: new Date().toISOString() });
        break;

      default:
        this.logger.warn({ clientId, type: message.type }, "Unknown message type");
    }
  }

  private subscribeToTask(clientId: string, taskId: string) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.taskId = taskId;

    if (!this.taskRooms.has(taskId)) {
      this.taskRooms.set(taskId, new Set());
    }
    this.taskRooms.get(taskId)!.add(clientId);

    this.logger.info({ clientId, taskId }, "Client subscribed to task");
    this.sendToClient(clientId, {
      type: "subscribed",
      taskId,
      timestamp: new Date().toISOString(),
    });
  }

  private unsubscribeFromTask(clientId: string, taskId: string) {
    const room = this.taskRooms.get(taskId);
    if (room) {
      room.delete(clientId);
      if (room.size === 0) {
        this.taskRooms.delete(taskId);
      }
    }

    const client = this.clients.get(clientId);
    if (client) {
      client.taskId = undefined;
    }

    this.logger.info({ clientId, taskId }, "Client unsubscribed from task");
  }

  private handleDisconnect(clientId: string) {
    const client = this.clients.get(clientId);
    if (client?.taskId) {
      this.unsubscribeFromTask(clientId, client.taskId);
    }

    this.clients.delete(clientId);
    this.logger.info({ clientId }, "WebSocket client disconnected");
  }

  private sendToClient(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      client.ws.send(JSON.stringify(message));
    } catch (err) {
      this.logger.error({ clientId, err }, "Failed to send message to client");
    }
  }

  // 公共方法：向任务房间广播消息
  public broadcastToTask(taskId: string, message: WebSocketMessage) {
    const room = this.taskRooms.get(taskId);
    if (!room || room.size === 0) {
      return;
    }

    const payload = JSON.stringify(message);
    let sent = 0;

    room.forEach((clientId) => {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(payload);
          sent++;
        } catch (err) {
          this.logger.error({ clientId, taskId, err }, "Failed to broadcast to client");
        }
      }
    });

    this.logger.debug({ taskId, clients: sent }, "Broadcasted to task room");
  }

  // 任务进度更新
  public notifyTaskProgress(
    taskId: string,
    stageId: string,
    status: "pending" | "running" | "completed" | "failed",
    progress?: number,
    message?: string
  ) {
    this.broadcastToTask(taskId, {
      type: "task_progress",
      taskId,
      stageId,
      status,
      progress,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  // 任务完成通知
  public notifyTaskCompleted(taskId: string, result: any) {
    this.broadcastToTask(taskId, {
      type: "task_completed",
      taskId,
      result,
      timestamp: new Date().toISOString(),
    });
  }

  // 关闭服务
  public close() {
    this.wss.close(() => {
      this.logger.info("WebSocket service closed");
    });
  }

  // 获取统计信息
  public getStats() {
    return {
      totalClients: this.clients.size,
      totalRooms: this.taskRooms.size,
      rooms: Array.from(this.taskRooms.entries()).map(([taskId, clients]) => ({
        taskId,
        clientCount: clients.size,
      })),
    };
  }
}
