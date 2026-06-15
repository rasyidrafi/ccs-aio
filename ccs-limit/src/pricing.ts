import { createHash } from "node:crypto";

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 8);
}

export function providerKeyFromApiKey(apiKey: string): string {
  return `api-key:${hashApiKey(apiKey)}`;
}
