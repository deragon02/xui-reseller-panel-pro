import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  const raw = process.env.XUI_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("XUI_TOKEN_ENCRYPTION_KEY is required before storing XUI credentials");
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string) {
  const [version, ivEncoded, tagEncoded, dataEncoded] = payload.split(":");
  if (version !== "v1" || !ivEncoded || !tagEncoded || !dataEncoded) throw new Error("Invalid encrypted secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataEncoded, "base64url")), decipher.final()]).toString("utf8");
}
