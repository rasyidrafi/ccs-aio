import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { hashApiKey, providerKeyFromApiKey } from "./pricing";

describe("API key hashing", () => {
  test("preserves the existing SHA-256 hash format", () => {
    const key = "example-sk-secret";
    const expected = createHash("sha256").update(key).digest("hex").slice(0, 8);
    expect(hashApiKey(key)).toBe(expected);
    expect(providerKeyFromApiKey(key)).toBe(`api-key:${expected}`);
  });

  test("returns the same cached value on repeated calls", () => {
    expect(hashApiKey("repeated-key")).toBe(hashApiKey("repeated-key"));
  });
});
