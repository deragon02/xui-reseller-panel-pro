import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { APP_VERSION, LATEST_RELEASE_API, RELEASE_CHANNEL, REPOSITORY_URL } from "@shared/version";

export const systemRouter = router({
  health: publicProcedure
    .input(z.object({ timestamp: z.number().min(0, "timestamp cannot be negative") }))
    .query(() => ({ ok: true })),

  version: publicProcedure.query(() => ({
    current: APP_VERSION,
    channel: RELEASE_CHANNEL,
    repository: REPOSITORY_URL,
  })),

  checkForUpdates: adminProcedure.query(async () => {
    try {
      const response = await fetch(LATEST_RELEASE_API, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "xui-reseller-panel" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return { current: APP_VERSION, latest: null, updateAvailable: false, message: "No published release found yet" };
      const release = (await response.json()) as { tag_name?: string; html_url?: string; name?: string };
      const latest = release.tag_name?.replace(/^v/, "") ?? null;
      return {
        current: APP_VERSION,
        latest,
        updateAvailable: Boolean(latest && latest !== APP_VERSION),
        releaseUrl: release.html_url ?? REPOSITORY_URL,
        releaseName: release.name ?? latest,
      };
    } catch {
      return { current: APP_VERSION, latest: null, updateAvailable: false, message: "GitHub update check unavailable" };
    }
  }),

  notifyOwner: adminProcedure
    .input(z.object({ title: z.string().min(1, "title is required"), content: z.string().min(1, "content is required") }))
    .mutation(async ({ input }) => ({ success: await notifyOwner(input) }) as const),
});
