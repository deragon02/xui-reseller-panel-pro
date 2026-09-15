import axios, { AxiosInstance } from "axios";
import { decryptSecret } from "./crypto";
import type { XuiNode } from "../drizzle/schema";

export type XuiInboundRecord = {
  id: number;
  remark: string;
  protocol?: string;
  port?: number;
  settings?: unknown;
  streamSettings?: unknown;
};

export type XuiClientPayload = {
  id: string;
  email: string;
  totalGB: number;
  expiryTime: number;
  limitIp: number;
  enable?: boolean;
};

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") throw new Error("XUI node URL must use HTTPS in production");
  return url.toString().replace(/\/$/, "");
}

export class XuiApi {
  private client: AxiosInstance;

  constructor(node: XuiNode) {
    const baseURL = normalizeBaseUrl(node.baseUrl);
    const token = decryptSecret(node.apiTokenEncrypted);
    this.client = axios.create({
      baseURL,
      timeout: 12_000,
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      validateStatus: status => status >= 200 && status < 500,
    });
  }

  private unwrap<T>(response: { status: number; data: any }, operation: string): T {
    if (response.status >= 400 || response.data?.success === false) {
      throw new Error(`3x-ui ${operation} failed (${response.status})`);
    }
    return (response.data?.obj ?? response.data?.data ?? response.data) as T;
  }

  async testConnection() {
    const response = await this.client.get("/panel/api/inbounds/list");
    this.unwrap(response, "connection test");
    return true;
  }

  async listInbounds(): Promise<XuiInboundRecord[]> {
    const response = await this.client.get("/panel/api/inbounds/list");
    const result = this.unwrap<any>(response, "inbound list");
    const rows = Array.isArray(result) ? result : result?.inbounds ?? [];
    return rows.map((row: any) => ({
      id: Number(row.id),
      remark: String(row.remark ?? `Inbound ${row.id}`),
      protocol: row.protocol ? String(row.protocol) : undefined,
      port: row.port ? Number(row.port) : undefined,
      settings: row.settings,
      streamSettings: row.streamSettings,
    })).filter((row: XuiInboundRecord) => Number.isFinite(row.id));
  }

  async addClient(inboundId: number, payload: XuiClientPayload) {
    const response = await this.client.post("/panel/api/inbounds/addClient", {
      id: inboundId,
      settings: JSON.stringify({ clients: [{ ...payload }] }),
    });
    return this.unwrap<any>(response, "client creation");
  }

  async deleteClient(clientId: string) {
    const response = await this.client.post(`/panel/api/inbounds/delClient/${encodeURIComponent(clientId)}`);
    return this.unwrap<any>(response, "client deletion");
  }
}
