import { int, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar, decimal, text, index } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 160 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const resellers = mysqlTable("resellers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  displayName: varchar("displayName", { length: 160 }).notNull(),
  suffixCode: varchar("suffixCode", { length: 24 }).notNull(),
  creditGb: decimal("creditGb", { precision: 12, scale: 2 }).default("0.00").notNull(),
  maxTrafficGb: decimal("maxTrafficGb", { precision: 12, scale: 2 }).default("0.00").notNull(),
  maxDays: int("maxDays").default(30).notNull(),
  maxIpLimit: int("maxIpLimit").default(1).notNull(),
  status: mysqlEnum("status", ["active", "suspended"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  userUnique: uniqueIndex("resellers_user_unique").on(table.userId),
  suffixUnique: uniqueIndex("resellers_suffix_unique").on(table.suffixCode),
}));

export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  resellerId: int("resellerId").notNull(),
  baseName: varchar("baseName", { length: 80 }).notNull(),
  username: varchar("username", { length: 120 }).notNull(),
  trafficGb: decimal("trafficGb", { precision: 12, scale: 2 }).notNull(),
  ipLimit: int("ipLimit").default(1).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  status: mysqlEnum("status", ["active", "disabled", "expired"]).default("active").notNull(),
  externalId: varchar("externalId", { length: 160 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  usernameUnique: uniqueIndex("clients_username_unique").on(table.username),
  resellerIndex: index("clients_reseller_idx").on(table.resellerId),
}));

export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId").notNull(),
  resellerId: int("resellerId"),
  action: varchar("action", { length: 80 }).notNull(),
  target: varchar("target", { length: 160 }),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  actorIndex: index("audit_actor_idx").on(table.actorUserId),
  resellerIndex: index("audit_reseller_idx").on(table.resellerId),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Reseller = typeof resellers.$inferSelect;
export type InsertReseller = typeof resellers.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// MVP ownership model: every client belongs to exactly one reseller.
