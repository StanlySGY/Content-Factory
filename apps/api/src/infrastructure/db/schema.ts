// Drizzle schema（类型化查询镜像；DB 真相以 db/migrations 为权威）
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { RequirementData } from "@cf/shared";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contentTasks = pgTable(
  "content_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    contentType: varchar("content_type", { length: 64 }).notNull(),
    priority: varchar("priority", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    ownerId: uuid("owner_id"),
    requirementData: jsonb("requirement_data").$type<RequirementData>().notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_content_tasks_project_status_updated").on(
      t.projectId,
      t.status,
      t.updatedAt,
    ),
    index("idx_content_tasks_owner_status").on(t.ownerId, t.status),
  ],
);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  actorId: uuid("actor_id"),
  subjectType: varchar("subject_type", { length: 80 }).notNull(),
  subjectId: uuid("subject_id").notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  beforeData: jsonb("before_data"),
  afterData: jsonb("after_data"),
  metadata: jsonb("metadata").notNull().default({}),
  sequenceNo: bigint("sequence_no", { mode: "number" }).notNull(),
  prevHash: varchar("prev_hash", { length: 128 }),
  entryHash: varchar("entry_hash", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContentTaskRow = typeof contentTasks.$inferSelect;
