import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import {
  InvocationSummary,
  InvocationTable,
  ServerTable,
  ToolTable,
} from "./components.js";
import {
  useMcpInvocationServers,
  useMcpInvocationTools,
  useToolInvocations,
} from "./hooks.js";

export function ToolInvocationLedgerPage() {
  const [selectedServerId, setSelectedServerId] = useState<string>();
  const [selectedToolId, setSelectedToolId] = useState<string>();
  const serversQuery = useMcpInvocationServers();
  const servers = useMemo(() => serversQuery.data ?? [], [serversQuery.data]);
  const firstServer = servers[0];
  const activeServerId = selectedServerId ?? firstServer?.id;
  const toolsQuery = useMcpInvocationTools(activeServerId);
  const tools = useMemo(() => toolsQuery.data ?? [], [toolsQuery.data]);
  const firstTool = tools[0];
  const activeToolId = selectedToolId ?? firstTool?.id;
  const invocationsQuery = useToolInvocations(activeToolId);
  const invocations = invocationsQuery.data ?? [];

  useEffect(() => {
    if (servers.length === 0) {
      setSelectedServerId(undefined);
      return;
    }

    if (firstServer && (!selectedServerId || !servers.some((server) => server.id === selectedServerId))) {
      setSelectedServerId(firstServer.id);
    }
  }, [firstServer, selectedServerId, servers]);

  useEffect(() => {
    if (tools.length === 0) {
      setSelectedToolId(undefined);
      return;
    }

    if (firstTool && (!selectedToolId || !tools.some((tool) => tool.id === selectedToolId))) {
      setSelectedToolId(firstTool.id);
    }
  }, [firstTool, selectedToolId, tools]);

  return (
    <div className="tool-invocation-ledger">
      <div className="page-head">
        <div>
          <h1>MCP 调用</h1>
          <p>只读 tool invocation ledger、caller 与快照摘要</p>
        </div>
      </div>

      {serversQuery.isError && (
        <ErrorBar message={`MCP server inventory 加载失败：${(serversQuery.error as Error).message}`} />
      )}
      {toolsQuery.isError && (
        <ErrorBar message={`MCP tool inventory 加载失败：${(toolsQuery.error as Error).message}`} />
      )}
      {invocationsQuery.isError && (
        <ErrorBar message={`MCP invocation ledger 加载失败：${(invocationsQuery.error as Error).message}`} />
      )}
      {serversQuery.isLoading && <Skeleton rows={5} />}

      {serversQuery.data && (
        <>
          <InvocationSummary invocations={invocations} servers={servers} tools={tools} />

          <div className="invocation-grid">
            <section>
              <div className="invocation-section-head">
                <h2 className="section-title">MCP servers</h2>
                <span>{servers.length} total</span>
              </div>
              <ServerTable
                onSelect={setSelectedServerId}
                selectedServerId={activeServerId}
                servers={servers}
              />

              <div className="invocation-section-head">
                <h2 className="section-title">MCP tools</h2>
                <span>{tools.length} loaded</span>
              </div>
              {activeServerId && toolsQuery.isLoading && <Skeleton rows={4} />}
              {toolsQuery.data && (
                <ToolTable
                  onSelect={setSelectedToolId}
                  selectedToolId={activeToolId}
                  tools={tools}
                />
              )}
              {!activeServerId && !toolsQuery.isLoading && (
                <EmptyState title="请选择 MCP Server" hint="选中 server 后显示 tool inventory。" />
              )}
            </section>

            <section className="invocation-detail-column">
              <div className="invocation-section-head">
                <h2 className="section-title">Invocation ledger</h2>
                <span>{activeToolId ?? "no tool"}</span>
              </div>
              {activeToolId && invocationsQuery.isLoading && <Skeleton rows={4} />}
              {invocationsQuery.data && <InvocationTable invocations={invocations} />}
              {!activeToolId && !invocationsQuery.isLoading && (
                <EmptyState title="请选择 MCP Tool" hint="选中 tool 后显示调用账本。" />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
