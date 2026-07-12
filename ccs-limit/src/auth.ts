import { config } from "./config";

const encoder = new TextEncoder();
const signingKey = crypto.subtle.importKey(
  "raw",
  encoder.encode(config.jwtSecret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);

function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = secret === config.jwtSecret
    ? await signingKey
    : await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64url(new Uint8Array(sig));
}

export async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const sig = await hmacSign(`${header}.${body}`, config.jwtSecret);
  return `${header}.${body}.${sig}`;
}

export async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const expectedSig = await hmacSign(`${header}.${body}`, config.jwtSecret);
  if (sig !== expectedSig) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body)));
    if (payload.exp && typeof payload.exp === "number") {
      if (Math.floor(Date.now() / 1000) > payload.exp) return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function validateCredentials(
  username: string,
  password: string
): boolean {
  return username === config.adminUsername && password === config.adminPassword;
}
