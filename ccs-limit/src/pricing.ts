const apiKeyHashCache = new Map<string, string>();
const MAX_API_KEY_HASH_CACHE_ENTRIES = 4_096;

export function hashApiKey(apiKey: string): string {
  const cached = apiKeyHashCache.get(apiKey);
  if (cached) return cached;

  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(apiKey);
  const hash = hasher.digest("hex").slice(0, 8);
  if (apiKeyHashCache.size >= MAX_API_KEY_HASH_CACHE_ENTRIES) {
    apiKeyHashCache.clear();
  }
  apiKeyHashCache.set(apiKey, hash);
  return hash;
}

export function providerKeyFromApiKey(apiKey: string): string {
  return `api-key:${hashApiKey(apiKey)}`;
}
