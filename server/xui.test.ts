import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { encryptSecret } from "./crypto";
import { XuiApi } from "./xui";

process.env.XUI_TOKEN_ENCRYPTION_KEY = "test-only-secret-that-is-not-production";

describe("3x-ui v3.8 adapter", () => {
  it("uses /panel/api/clients/add with client and inboundIds", async () => {
    let requestPath = "";
    let requestBody = "";
    const server = createServer((request, response) => {
      requestPath = request.url ?? "";
      request.on("data", chunk => { requestBody += chunk; });
      request.on("end", () => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ success: true, obj: { id: "created" } }));
      });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");

    try {
      const api = new XuiApi({
        id: 1,
        name: "test",
        baseUrl: `http://127.0.0.1:${address.port}`,
        apiTokenEncrypted: encryptSecret("test-token"),
        status: "active",
        lastSyncAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await api.addClient(7, { id: "uuid-1", email: "sara-AR-07", totalGB: 25, expiryTime: 123, limitIp: 2, enable: true });
      expect(requestPath).toBe("/panel/api/clients/add");
      expect(JSON.parse(requestBody)).toEqual({
        client: { id: "uuid-1", email: "sara-AR-07", security: "auto", limitIp: 2, totalGB: 25, expiryTime: 123, enable: true },
        inboundIds: [7],
      });
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("uses the official lifecycle routes and returns byte traffic counters", async () => {
    const paths: string[] = [];
    const server = createServer((request, response) => {
      paths.push(request.url ?? "");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(request.url?.includes("/traffic/") ? { success: true, obj: { up: 1024, down: 2048, total: 3072 } } : { success: true, obj: {} }));
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    try {
      const api = new XuiApi({
        id: 1, name: "test", baseUrl: `http://127.0.0.1:${address.port}`,
        apiTokenEncrypted: encryptSecret("test-token"), status: "active", lastSyncAt: null,
        lastError: null, createdAt: new Date(), updatedAt: new Date(),
      });
      await api.updateClient("sara-AR-07", { id: "uuid-1", totalGB: 25, expiryTime: 123, limitIp: 2, enable: false });
      await expect(api.getClientTraffic("sara-AR-07")).resolves.toEqual({ up: 1024, down: 2048, total: 3072, lastOnline: undefined });
      await api.deleteClient("sara-AR-07");
      expect(paths).toEqual([
        "/panel/api/clients/update/sara-AR-07",
        "/panel/api/clients/traffic/sara-AR-07",
        "/panel/api/clients/del/sara-AR-07",
      ]);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
