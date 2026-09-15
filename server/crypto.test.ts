import { describe, expect, it, beforeEach } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

describe("XUI token encryption", () => {
  beforeEach(() => {
    process.env.XUI_TOKEN_ENCRYPTION_KEY = "test-only-secret-that-is-not-production";
  });

  it("round-trips a token without storing it in plaintext", () => {
    const token = "xui-token-123456789";
    const encrypted = encryptSecret(token);
    expect(encrypted).not.toContain(token);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decryptSecret(encrypted)).toBe(token);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptSecret("secret-token");
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("a") ? "b" : "a"}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
