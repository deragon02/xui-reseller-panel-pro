import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { XuiApi } from "./xui";
import {
  canResellerUseInbound,
  canResellerUseNode,
  createClientForReseller,
  createReseller,
  createXuiNode,
  getAllClients,
  getAllInbounds,
  getAllResellers,
  getClientsForReseller,
  getInboundById,
  getRecentAuditLogs,
  getResellerAccess,
  getResellerById,
  getResellerByUserId,
  getUsersForAdmin,
  getXuiNode,
  getXuiNodes,
  markXuiNodeSync,
  normalizeSuffixCode,
  replaceResellerAccess,
  syncXuiInbounds,
  updateResellerCredit,
  writeAuditLog,
} from "./db";

const resellerInput = z.object({
  userId: z.number().int().positive(),
  displayName: z.string().trim().min(2).max(160),
  suffixCode: z.string().trim().min(2).max(24),
  creditGb: z.coerce.number().min(0).max(1_000_000),
  maxTrafficGb: z.coerce.number().min(0).max(1_000_000),
  maxDays: z.coerce.number().int().min(1).max(3650),
  maxIpLimit: z.coerce.number().int().min(1).max(100),
});

const clientInput = z.object({
  nodeId: z.number().int().positive(),
  inboundId: z.number().int().positive(),
  baseName: z.string().trim().min(2).max(80),
  trafficGb: z.coerce.number().positive().max(1_000_000),
  ipLimit: z.coerce.number().int().min(1).max(100),
  durationDays: z.coerce.number().int().min(1).max(3650),
  notes: z.string().trim().max(500).optional(),
});

const nodeInput = z.object({ name: z.string().trim().min(2).max(120), baseUrl: z.string().url(), apiToken: z.string().trim().min(10).max(2000) });
const accessInput = z.object({ resellerId: z.number().int().positive(), nodeIds: z.array(z.number().int().positive()).max(100), inboundIds: z.array(z.number().int().positive()).max(500) });

function assertActiveReseller(reseller: Awaited<ReturnType<typeof getResellerByUserId>>) {
  if (!reseller || reseller.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "Reseller account is not active" });
  return reseller;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "admin") {
        const [resellers, clients, logs] = await Promise.all([getAllResellers(), getAllClients(), getRecentAuditLogs(8)]);
        return { role: "admin" as const, reseller: null, resellers, clients, logs };
      }
      const reseller = assertActiveReseller(await getResellerByUserId(ctx.user.id));
      const clients = await getClientsForReseller(reseller.id);
      return { role: "reseller" as const, reseller, resellers: [], clients, logs: [] };
    }),
  }),
  admin: router({
    users: adminProcedure.query(() => getUsersForAdmin()),
    resellers: adminProcedure.query(() => getAllResellers()),
    createReseller: adminProcedure.input(resellerInput).mutation(async ({ ctx, input }) => {
      const suffixCode = normalizeSuffixCode(input.suffixCode);
      try {
        const reseller = await createReseller({ ...input, suffixCode, creditGb: input.creditGb.toFixed(2), maxTrafficGb: input.maxTrafficGb.toFixed(2) });
        await writeAuditLog({ actorUserId: ctx.user.id, resellerId: reseller?.id, action: "reseller.created", target: suffixCode, metadata: JSON.stringify({ userId: input.userId }) });
        return reseller;
      } catch (error) {
        if (String(error).includes("Duplicate")) throw new TRPCError({ code: "CONFLICT", message: "User or suffix code is already assigned" });
        throw error;
      }
    }),
    updateCredit: adminProcedure.input(z.object({ resellerId: z.number().int().positive(), creditGb: z.coerce.number().min(0).max(1_000_000) })).mutation(async ({ ctx, input }) => {
      const reseller = await updateResellerCredit(input.resellerId, input.creditGb.toFixed(2));
      await writeAuditLog({ actorUserId: ctx.user.id, resellerId: input.resellerId, action: "reseller.credit_updated", target: input.creditGb.toFixed(2), metadata: null });
      return reseller;
    }),
    audit: adminProcedure.query(() => getRecentAuditLogs(50)),
    xuiNodes: adminProcedure.query(() => getXuiNodes()),
    xuiInbounds: adminProcedure.query(() => getAllInbounds()),
    resellerAccess: adminProcedure.input(z.object({ resellerId: z.number().int().positive() })).query(({ input }) => getResellerAccess(input.resellerId)),
    addXuiNode: adminProcedure.input(nodeInput).mutation(async ({ ctx, input }) => {
      let node: Awaited<ReturnType<typeof createXuiNode>> | undefined;
      try {
        node = await createXuiNode(input);
        const api = new XuiApi(node!);
        await api.testConnection();
        const inbounds = await api.listInbounds();
        await syncXuiInbounds(node!.id, inbounds);
        await markXuiNodeSync(node!.id, "active");
        await writeAuditLog({ actorUserId: ctx.user.id, resellerId: null, action: "xui.node_added", target: input.name, metadata: JSON.stringify({ nodeId: node!.id, inboundCount: inbounds.length }) });
        return { ...node, inboundCount: inbounds.length };
      } catch (error) {
        if (node?.id) await markXuiNodeSync(node.id, "error", error instanceof Error ? error.message : "Connection failed");
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "3x-ui connection failed" });
      }
    }),
    syncXuiNode: adminProcedure.input(z.object({ nodeId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const node = await getXuiNode(input.nodeId);
      if (!node) throw new TRPCError({ code: "NOT_FOUND", message: "XUI node not found" });
      try {
        const inbounds = await new XuiApi(node).listInbounds();
        const result = await syncXuiInbounds(node.id, inbounds);
        await markXuiNodeSync(node.id, "active");
        await writeAuditLog({ actorUserId: ctx.user.id, resellerId: null, action: "xui.inbounds_synced", target: node.name, metadata: JSON.stringify({ count: inbounds.length }) });
        return result;
      } catch (error) {
        await markXuiNodeSync(node.id, "error", error instanceof Error ? error.message : "Sync failed");
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Inbound sync failed" });
      }
    }),
    saveResellerAccess: adminProcedure.input(accessInput).mutation(async ({ ctx, input }) => {
      await replaceResellerAccess(input.resellerId, input.nodeIds, input.inboundIds);
      await writeAuditLog({ actorUserId: ctx.user.id, resellerId: input.resellerId, action: "reseller.xui_access_updated", target: String(input.resellerId), metadata: JSON.stringify({ nodeIds: input.nodeIds, inboundIds: input.inboundIds }) });
      return getResellerAccess(input.resellerId);
    }),
  }),
  reseller: router({
    profile: protectedProcedure.query(async ({ ctx }) => ctx.user.role === "admin" ? null : assertActiveReseller(await getResellerByUserId(ctx.user.id))),
    availableInbounds: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "admin") return [];
      const reseller = assertActiveReseller(await getResellerByUserId(ctx.user.id));
      const access = await getResellerAccess(reseller.id);
      const inbounds = await getAllInbounds();
      return inbounds.filter(inbound => access.inboundIds.includes(inbound.id) && access.nodeIds.includes(inbound.nodeId));
    }),
    createClient: protectedProcedure.input(clientInput).mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "admin") throw new TRPCError({ code: "BAD_REQUEST", message: "Admin must create clients through an assigned reseller" });
      const reseller = assertActiveReseller(await getResellerByUserId(ctx.user.id));
      const inbound = await getInboundById(input.inboundId);
      if (!inbound || inbound.nodeId !== input.nodeId || !(await canResellerUseNode(reseller.id, input.nodeId)) || !(await canResellerUseInbound(reseller.id, inbound.id))) throw new TRPCError({ code: "FORBIDDEN", message: "This node or inbound is not assigned to your reseller" });
      const node = await getXuiNode(input.nodeId);
      if (!node || node.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "XUI node is not active" });
      const username = `${input.baseName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-")}-${reseller.suffixCode}`;
      const externalId = randomUUID();
      const expiryTime = Date.now() + input.durationDays * 24 * 60 * 60 * 1000;
      try {
        await new XuiApi(node).addClient(inbound.remoteId, { id: externalId, email: username, totalGB: Math.round(input.trafficGb), expiryTime, limitIp: input.ipLimit, enable: true });
        const client = await createClientForReseller({ reseller, nodeId: node.id, inboundId: inbound.id, externalId, baseName: input.baseName, trafficGb: input.trafficGb.toFixed(2), ipLimit: input.ipLimit, durationDays: input.durationDays, notes: input.notes });
        await writeAuditLog({ actorUserId: ctx.user.id, resellerId: reseller.id, action: "client.created_in_xui", target: client.username, metadata: JSON.stringify({ nodeId: node.id, inboundId: inbound.id, externalId }) });
        return client;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "3x-ui client creation failed" });
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
