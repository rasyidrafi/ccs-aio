import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { config } from "./config";
import { hashApiKey } from "./pricing";

interface ApiKeyEntry {
  raw: string;
  hash: string;
  name: string;
}

export async function resolveApiKeys(): Promise<ApiKeyEntry[]> {
  const entries: ApiKeyEntry[] = [];
  const configFiles = new Set<string>();

  try {
    const dir = config.cliproxyConfigDir;
    const files = await readdir(dir, { withFileTypes: true });
    for (const f of files) {
      if (f.isFile() && /^config(?:-\d+)?\.ya?ml$/i.test(f.name)) {
        configFiles.add(path.join(dir, f.name));
      }
    }
  } catch {
    // ignore
  }

  const seen = new Set<string>();
  for (const filePath of configFiles) {
    try {
      const text = await readFile(filePath, "utf8");
      const parsed = YAML.parse(text) as { "api-keys"?: unknown } | null;
      const apiKeys = Array.isArray(parsed?.["api-keys"])
        ? parsed!["api-keys"]
        : [];
      for (const entry of apiKeys) {
        if (typeof entry !== "string") continue;
        const h = hashApiKey(entry);
        if (seen.has(h)) continue;
        seen.add(h);
        const sepIdx = entry.indexOf("-sk-");
        const name = sepIdx > 0 ? entry.slice(0, sepIdx).trim() : "";
        entries.push({
          raw: entry,
          hash: h,
          name: name || entry.slice(0, 12) + "...",
        });
      }
    } catch {
      // skip unreadable files
    }
  }

  return entries;
}

export async function findApiKeyByName(
  nameOrHash: string
): Promise<ApiKeyEntry | null> {
  const keys = await resolveApiKeys();
  const lower = nameOrHash.toLowerCase();
  return (
    keys.find(
      (k) =>
        k.hash === nameOrHash ||
        k.name.toLowerCase() === lower ||
        k.raw === nameOrHash
    ) ?? null
  );
}

export async function getAllApiKeyEntries(): Promise<ApiKeyEntry[]> {
  return resolveApiKeys();
}
