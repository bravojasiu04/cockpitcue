// Upstash Redis REST helper.
// In development (no env vars), falls back to an in-process Map so local
// testing still works. In production (Vercel), the real Redis is used and
// data persists across serverless instances.

const R_URL = process.env.UPSTASH_REDIS_REST_URL;
const R_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_REDIS = !!(R_URL && R_TOKEN);

// Dev-only fallback (lost on cold start, fine for local testing)
const _mem = new Map<string, string>();

async function pipeline(commands: (string | number)[][]) {
  const res = await fetch(`${R_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${R_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash pipeline failed: ${res.status}`);
  return (await res.json()) as { result: unknown }[];
}

export async function kset(key: string, value: unknown, exSeconds = 7200) {
  const v = JSON.stringify(value);
  if (!USE_REDIS) { _mem.set(key, v); return; }
  await pipeline([["SET", key, v, "EX", String(exSeconds)]]);
}

export async function kget<T = unknown>(key: string): Promise<T | null> {
  if (!USE_REDIS) {
    const v = _mem.get(key);
    return v ? (JSON.parse(v) as T) : null;
  }
  const [{ result }] = await pipeline([["GET", key]]);
  return result ? (JSON.parse(result as string) as T) : null;
}

export async function kdel(...keys: string[]) {
  if (!USE_REDIS) { keys.forEach(k => _mem.delete(k)); return; }
  if (keys.length === 0) return;
  await pipeline([["DEL", ...keys]]);
}

export async function kmget(keys: string[]): Promise<(unknown | null)[]> {
  if (keys.length === 0) return [];
  if (!USE_REDIS) return keys.map(k => { const v = _mem.get(k); return v ? JSON.parse(v) : null; });
  const results = await pipeline(keys.map(k => ["GET", k]));
  return results.map(r => (r.result ? JSON.parse(r.result as string) : null));
}
