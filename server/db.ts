import { and, desc, eq, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  AuditLog,
  Client,
  InsertUser,
  Reseller,
  auditLogs,
  clients,
  resellers,
  resellerInboundAccess,
  resellerNodeAccess,
  users,
  xuiInbounds,
  xuiNodes,
} from "../drizzle/schema";
import { encryptSecret } from "./crypto";
import type { XuiInboundRecord } from "./xui";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUsersForAdmin() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getResellerByUserId(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select().from(resellers).where(eq(resellers.userId, userId)).limit(1);
  return result[0];
}

export async function getResellerById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select().from(resellers).where(eq(resellers.id, id)).limit(1);
  return result[0];
}

export async function getAllResellers() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(resellers).orderBy(desc(resellers.createdAt));
}

export async function getClientsForReseller(resellerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(clients).where(eq(clients.resellerId, resellerId)).orderBy(desc(clients.createdAt));
}

export async function getAllClients() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(clients).orderBy(desc(clients.createdAt));
}

export function normalizeBaseName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function normalizeSuffixCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
}

export function buildClientUsername(baseName: string, suffixCode: string) {
  return `${normalizeBaseName(baseName)}-${normalizeSuffixCode(suffixCode)}`;
}

export async function createReseller(data: {
  userId: number;
  displayName: string;
  suffixCode: string;
  creditGb: string;
  maxTrafficGb: string;
  maxDays: number;
  maxIpLimit: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const suffixCode = normalizeSuffixCode(data.suffixCode);
  if (suffixCode.length < 2) throw new Error("Suffix code must contain at least 2 letters or numbers");
  const result = await db.insert(resellers).values({
    userId: data.userId,
    displayName: data.displayName.trim().slice(0, 160),
    suffixCode,
    creditGb: data.creditGb,
    maxTrafficGb: data.maxTrafficGb,
    maxDays: data.maxDays,
    maxIpLimit: data.maxIpLimit,
  });
  return getResellerById(Number(result[0].insertId));
}

export async function updateResellerCredit(id: number, creditGb: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(resellers).set({ creditGb }).where(eq(resellers.id, id));
  return getResellerById(id);
}

export async function createClientForReseller(data: {
  reseller: Reseller;
  nodeId?: number;
  inboundId?: number;
  externalId?: string;
  baseName: string;
  trafficGb: string;
  ipLimit: number;
  durationDays: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const baseName = normalizeBaseName(data.baseName);
  const username = buildClientUsername(baseName, data.reseller.suffixCode);
  if (!baseName || !username) throw new Error("Client name is invalid");
  const trafficGb = Number(data.trafficGb);
  const creditGb = Number(data.reseller.creditGb);
  const maxTrafficGb = Number(data.reseller.maxTrafficGb);
  if (!Number.isFinite(trafficGb) || trafficGb <= 0) throw new Error("Traffic must be greater than zero");
  if (maxTrafficGb > 0 && trafficGb > maxTrafficGb) throw new Error(`Traffic cannot exceed ${maxTrafficGb} GB`);
  if (trafficGb > creditGb) throw new Error("Not enough reseller credit");
  if (data.durationDays < 1 || data.durationDays > data.reseller.maxDays) throw new Error(`Duration must be between 1 and ${data.reseller.maxDays} days`);
  if (data.ipLimit < 1 || data.ipLimit > data.reseller.maxIpLimit) throw new Error(`IP limit must be between 1 and ${data.reseller.maxIpLimit}`);

  const expiresAt = new Date(Date.now() + data.durationDays * 24 * 60 * 60 * 1000);
  return db.transaction(async tx => {
    const existing = await tx.select({ id: clients.id }).from(clients).where(eq(clients.username, username)).limit(1);
    if (existing.length) throw new Error(`This client name already exists: ${username}`);
    const [creditUpdate] = await tx.update(resellers)
      .set({ creditGb: sql`${resellers.creditGb} - ${data.trafficGb}` })
      .where(and(eq(resellers.id, data.reseller.id), gte(resellers.creditGb, data.trafficGb)));
    if (!creditUpdate || Number(creditUpdate.affectedRows ?? 0) !== 1) throw new Error("Credit changed; please retry");
    const result = await tx.insert(clients).values({
      resellerId: data.reseller.id,
      nodeId: data.nodeId,
      inboundId: data.inboundId,
      baseName,
      username,
      trafficGb: data.trafficGb,
      ipLimit: data.ipLimit,
      expiresAt,
      externalId: data.externalId,
      notes: data.notes?.trim().slice(0, 500),
    });
    const inserted = await tx.select().from(clients).where(eq(clients.id, Number(result[0].insertId))).limit(1);
    return inserted[0] as Client;
  });
}

export async function writeAuditLog(data: Omit<AuditLog, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(auditLogs).values(data);
}

export async function getRecentAuditLogs(limit = 20) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

export async function getXuiNodes() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select({ id: xuiNodes.id, name: xuiNodes.name, baseUrl: xuiNodes.baseUrl, status: xuiNodes.status, lastSyncAt: xuiNodes.lastSyncAt, lastError: xuiNodes.lastError, createdAt: xuiNodes.createdAt }).from(xuiNodes).orderBy(desc(xuiNodes.createdAt));
}

export async function getXuiNode(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select().from(xuiNodes).where(eq(xuiNodes.id, id)).limit(1);
  return result[0];
}

export async function createXuiNode(data: { name: string; baseUrl: string; apiToken: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const url = new URL(data.baseUrl).toString().replace(/\/$/, "");
  const result = await db.insert(xuiNodes).values({ name: data.name.trim().slice(0, 120), baseUrl: url, apiTokenEncrypted: encryptSecret(data.apiToken.trim()) });
  return getXuiNode(Number(result[0].insertId));
}

export async function markXuiNodeSync(id: number, status: "active" | "error", lastError: string | null = null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(xuiNodes).set({ status, lastSyncAt: new Date(), lastError }).where(eq(xuiNodes.id, id));
}

export async function syncXuiInbounds(nodeId: number, records: XuiInboundRecord[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async tx => {
    for (const record of records) {
      await tx.insert(xuiInbounds).values({ nodeId, remoteId: record.id, remark: record.remark, protocol: record.protocol, port: record.port, settingsJson: record.settings ? JSON.stringify(record.settings) : null, streamSettingsJson: record.streamSettings ? JSON.stringify(record.streamSettings) : null, active: true, syncedAt: new Date() }).onDuplicateKeyUpdate({ set: { remark: record.remark, protocol: record.protocol, port: record.port, settingsJson: record.settings ? JSON.stringify(record.settings) : null, streamSettingsJson: record.streamSettings ? JSON.stringify(record.streamSettings) : null, active: true, syncedAt: new Date() } });
    }
  });
  return getInboundsForNode(nodeId);
}

export async function getInboundsForNode(nodeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(xuiInbounds).where(and(eq(xuiInbounds.nodeId, nodeId), eq(xuiInbounds.active, true))).orderBy(xuiInbounds.remark);
}

export async function getAllInbounds() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(xuiInbounds).where(eq(xuiInbounds.active, true)).orderBy(xuiInbounds.remark);
}

export async function getInboundById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select().from(xuiInbounds).where(and(eq(xuiInbounds.id, id), eq(xuiInbounds.active, true))).limit(1);
  return result[0];
}

export async function replaceResellerAccess(resellerId: number, nodeIds: number[], inboundIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async tx => {
    await tx.delete(resellerNodeAccess).where(eq(resellerNodeAccess.resellerId, resellerId));
    await tx.delete(resellerInboundAccess).where(eq(resellerInboundAccess.resellerId, resellerId));
    if (nodeIds.length) await tx.insert(resellerNodeAccess).values(nodeIds.map(nodeId => ({ resellerId, nodeId })));
    if (inboundIds.length) await tx.insert(resellerInboundAccess).values(inboundIds.map(inboundId => ({ resellerId, inboundId })));
  });
}

export async function getResellerAccess(resellerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [nodeAccess, inboundAccess] = await Promise.all([
    db.select().from(resellerNodeAccess).where(eq(resellerNodeAccess.resellerId, resellerId)),
    db.select().from(resellerInboundAccess).where(eq(resellerInboundAccess.resellerId, resellerId)),
  ]);
  return { nodeIds: nodeAccess.map(row => row.nodeId), inboundIds: inboundAccess.map(row => row.inboundId) };
}

export async function canResellerUseInbound(resellerId: number, inboundId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select({ id: resellerInboundAccess.id }).from(resellerInboundAccess).where(and(eq(resellerInboundAccess.resellerId, resellerId), eq(resellerInboundAccess.inboundId, inboundId))).limit(1);
  return result.length > 0;
}

export async function canResellerUseNode(resellerId: number, nodeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select({ id: resellerNodeAccess.id }).from(resellerNodeAccess).where(and(eq(resellerNodeAccess.resellerId, resellerId), eq(resellerNodeAccess.nodeId, nodeId))).limit(1);
  return result.length > 0;
}
