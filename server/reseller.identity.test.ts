import { describe, expect, it } from "vitest";
import { buildClientUsername, normalizeBaseName, normalizeSuffixCode } from "./db";

describe("reseller client identity", () => {
  it("normalizes suffix codes into stable uppercase identifiers", () => {
    expect(normalizeSuffixCode(" ar 07 ")).toBe("AR-07");
    expect(normalizeSuffixCode("reseller_2")).toBe("RESELLER_2");
  });

  it("builds a deterministic client username from base name and reseller suffix", () => {
    expect(buildClientUsername("Sara Ali", "ar-07")).toBe("sara-ali-AR-07");
    expect(buildClientUsername("navid", "BX_9")).toBe("navid-BX_9");
  });

  it("keeps names from different resellers distinct", () => {
    expect(buildClientUsername("sara", "AR-07")).not.toBe(buildClientUsername("sara", "BX-02"));
  });
});
