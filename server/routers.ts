import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createClientForReseller,
  createReseller,
  getAllClients,
  getAllResellers,
  getClientsForReseller,
  getRecentAuditLogs,
  getResellerById,
  getResellerByUserId,
  getUsersForAdmin,
  normalizeSuffixCode,
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
  baseName: z.string().trim().min(2).max(80),
  trafficGb: z.coerce.number().positive().max(1_000_000),
  ipLimit: z.coerce.number().int().min(1).max(100),
  durationDays: z.coerce.number().int().min(1).max(3650),
  notes: z.string().trim().max(500).optional(),
});

function assertActiveReseller(reseller: Awaited<ReturnType<typeof getResellerByUserId>>) {
  if (!reseller || reseller.status !== "active") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Reseller account is not active" });
  }
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
  }),
  reseller: router({
    profile: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "admin") return null;
      return assertActiveReseller(await getResellerByUserId(ctx.user.id));
    }),
    createClient: protectedProcedure.input(clientInput).mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "admin") throw new TRPCError({ code: "BAD_REQUEST", message: "Admin must create clients through an assigned reseller" });
      const reseller = assertActiveReseller(await getResellerByUserId(ctx.user.id));
      try {
        const client = await createClientForReseller({ reseller, baseName: input.baseName, trafficGb: input.trafficGb.toFixed(2), ipLimit: input.ipLimit, durationDays: input.durationDays, notes: input.notes });
        await writeAuditLog({ actorUserId: ctx.user.id, resellerId: reseller.id, action: "client.created", target: client.username, metadata: JSON.stringify({ trafficGb: input.trafficGb, durationDays: input.durationDays }) });
        return client;
      } catch (error) {
        if (String(error).includes("already exists")) throw new TRPCError({ code: "CONFLICT", message: String(error).replace("Error: ", "") });
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Client could not be created" });
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
