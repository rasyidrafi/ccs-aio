export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 
      "Content-Type": "application/json",
      ...CORS_HEADERS
    },
  });
}

export function ok<T>(data: T): Response {
  return json({ ok: true, data });
}

export function fail(error: string, status = 400): Response {
  return json({ ok: false, error }, status);
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}
