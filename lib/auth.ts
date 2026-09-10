import { AppError } from "./errors";
export type AppEnv = {
  DB: D1Database;
  ADMIN_API_KEY?: string;
  VAPI_WEBHOOK_SECRET?: string;
  VAPI_PHONE_NUMBER?: string;
  VAPI_ASSISTANT_ID?: string;
  VAPI_PUBLIC_KEY?: string;
  LOG_DEMOGRAPHICS?: string;
};
const bytes = (s: string) => new TextEncoder().encode(s);
export async function equalSecret(a: string, b: string) {
  const x = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(a))),
    y = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(b)));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function requireKey(key?: string) {
  if (!key || key.length < 32)
    throw new AppError(
      503,
      "NOT_CONFIGURED",
      "Service access is not configured.",
    );
  return key;
}
async function signature(value: string, key: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    bytes(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, bytes(value)))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function sessionCookie(key: string, secure: boolean) {
  const value = String(Math.floor(Date.now() / 1000) + 8 * 3600);
  return `carecloud_session=${value}.${await signature(value, requireKey(key))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure ? "; Secure" : ""}`;
}
export async function authenticate(
  request: Request,
  env: AppEnv,
  webhook = false,
) {
  const key = requireKey(webhook ? env.VAPI_WEBHOOK_SECRET : env.ADMIN_API_KEY);
  const bearer =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    (webhook ? request.headers.get("x-vapi-secret") : null);
  if (bearer && (await equalSecret(bearer, key))) return;
  if (!webhook) {
    const cookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("carecloud_session="))
      ?.slice(18);
    if (cookie) {
      const [expires, sig] = cookie.split(".");
      if (
        /^\d+$/.test(expires) &&
        Number(expires) > Date.now() / 1000 &&
        Number(expires) < Date.now() / 1000 + 28860 &&
        sig &&
        (await equalSecret(sig, await signature(expires, key)))
      ) {
        if (
          !["GET", "HEAD"].includes(request.method) &&
          request.headers.get("origin") !== new URL(request.url).origin
        )
          throw new AppError(
            403,
            "INVALID_ORIGIN",
            "Reload the dashboard and try again.",
          );
        return;
      }
    }
  }
  throw new AppError(
    401,
    "UNAUTHORIZED",
    "A valid reviewer access key is required.",
  );
}
export async function throttle(
  request: Request,
  db: D1Database,
  scope: string,
  limit = 120,
) {
  const now = Math.floor(Date.now() / 1000),
    window = Math.floor(now / 60);
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes(`${ip}:${scope}:${window}`),
  );
  const bucket = [...new Uint8Array(digest)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  const row = await db
    .prepare(
      "INSERT INTO rate_limits (bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(bucket, (window + 2) * 60)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > limit)
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Too many requests. Please retry in a minute.",
    );
  await db
    .prepare("DELETE FROM rate_limits WHERE expires_at < ?")
    .bind(now)
    .run();
}
