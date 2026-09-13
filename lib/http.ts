import { z } from "zod";
import {
  authenticate,
  equalSecret,
  sessionCookie,
  throttle,
  type AppEnv,
} from "./auth";
import { AppError, failure, json, readJson } from "./errors";
import { PatientService } from "./patients";
import { VoiceService } from "./voice";
export async function handleRequest(request: Request, env: AppEnv) {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url),
    path = url.pathname.replace(/\/$/, "") || "/";
  try {
    if (path === "/health" && request.method === "GET") {
      try {
        await env.DB.prepare("SELECT count(*) AS count FROM patients").first();
      } catch {
        throw new AppError(
          503,
          "DATABASE_UNAVAILABLE",
          "Database is unavailable.",
        );
      }
      return json(
        {
          status: "ok",
          database: "connected",
          voice_configured: !!(
            env.VAPI_ASSISTANT_ID &&
            env.VAPI_PHONE_NUMBER &&
            env.VAPI_WEBHOOK_SECRET
          ),
          web_call_configured: !!(env.VAPI_ASSISTANT_ID && env.VAPI_PUBLIC_KEY),
          phone_number: env.VAPI_PHONE_NUMBER || null,
        },
        200,
        { "X-Request-ID": requestId },
      );
    }
    if (path === "/api/voice-config" && request.method === "GET") {
      return json(
        {
          enabled: !!(env.VAPI_ASSISTANT_ID && env.VAPI_PUBLIC_KEY),
          assistant_id: env.VAPI_ASSISTANT_ID || null,
          public_key: env.VAPI_PUBLIC_KEY || null,
        },
        200,
        {
          "Cache-Control": "public, max-age=300",
          "X-Request-ID": requestId,
        },
      );
    }
    if (path === "/api/session") {
      if (request.method === "DELETE")
        return json({ signed_out: true }, 200, {
          "Set-Cookie":
            "carecloud_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        });
      if (request.method !== "POST")
        throw new AppError(405, "METHOD_NOT_ALLOWED", "Use POST or DELETE.");
      if (
        request.headers.get("origin") &&
        request.headers.get("origin") !== url.origin
      )
        throw new AppError(403, "INVALID_ORIGIN", "Invalid request origin.");
      await throttle(request, env.DB, "login", 10);
      const body = z
        .object({ key: z.string().min(1).max(256) })
        .strict()
        .parse(await readJson(request));
      if (!env.ADMIN_API_KEY || env.ADMIN_API_KEY.length < 32)
        throw new AppError(
          503,
          "NOT_CONFIGURED",
          "Service access is not configured.",
        );
      if (!(await equalSecret(body.key, env.ADMIN_API_KEY)))
        throw new AppError(
          401,
          "UNAUTHORIZED",
          "The access key was not accepted.",
        );
      return json({ authenticated: true }, 200, {
        "Set-Cookie": await sessionCookie(
          env.ADMIN_API_KEY,
          url.protocol === "https:",
        ),
      });
    }
    if (path === "/webhooks/vapi") {
      if (request.method !== "POST")
        throw new AppError(405, "METHOD_NOT_ALLOWED", "Use POST.");
      await authenticate(request, env, true);
      return Response.json(
        await new VoiceService(env.DB, env.LOG_DEMOGRAPHICS === "true").webhook(
          await readJson(request, 256000),
        ),
        { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    }
    const known =
      path === "/patients" ||
      /^\/patients\/[^/]+$/.test(path) ||
      ["/api/calls", "/api/overview", "/api/appointments"].includes(path);
    if (!known) throw new AppError(404, "NOT_FOUND", "Endpoint not found.");
    await authenticate(request, env);
    await throttle(request, env.DB, "api", 180);
    const patients = new PatientService(env.DB);
    if (path === "/patients") {
      if (request.method === "GET")
        return json(await patients.list(url.searchParams));
      if (request.method === "POST")
        return json(await patients.create(await readJson(request)), 201);
      throw new AppError(405, "METHOD_NOT_ALLOWED", "Use GET or POST.");
    }
    if (path.startsWith("/patients/")) {
      const id = decodeURIComponent(path.slice(10));
      if (request.method === "GET") return json(await patients.get(id));
      if (request.method === "PUT")
        return json(await patients.update(id, await readJson(request)));
      if (request.method === "DELETE") return json(await patients.remove(id));
      throw new AppError(405, "METHOD_NOT_ALLOWED", "Use GET, PUT or DELETE.");
    }
    if (request.method !== "GET")
      throw new AppError(405, "METHOD_NOT_ALLOWED", "Use GET.");
    if (path === "/api/calls") {
      const id = url.searchParams.get("patient_id");
      if (id) z.string().uuid().parse(id);
      const calls = await env.DB.prepare(
        `SELECT call_id,patient_id,status,summary,transcript,ended_reason,created_at,updated_at FROM calls ${id ? "WHERE patient_id = ?" : ""} ORDER BY updated_at DESC LIMIT 100`,
      )
        .bind(...(id ? [id] : []))
        .all();
      return json(calls.results);
    }
    if (path === "/api/appointments")
      return json(
        (
          await env.DB.prepare(
            "SELECT a.*,p.first_name,p.last_name FROM appointments a JOIN patients p ON a.patient_id=p.patient_id WHERE p.deleted_at IS NULL ORDER BY slot LIMIT 100",
          ).all()
        ).results,
      );
    const [patientCount, callCount, completed, today] = await env.DB.batch([
      env.DB.prepare(
        "SELECT count(*) AS value FROM patients WHERE deleted_at IS NULL",
      ),
      env.DB.prepare("SELECT count(*) AS value FROM calls"),
      env.DB.prepare(
        "SELECT count(*) AS value FROM calls WHERE patient_id IS NOT NULL",
      ),
      env.DB.prepare(
        "SELECT count(*) AS value FROM patients WHERE deleted_at IS NULL AND created_at >= ?",
      ).bind(new Date().toISOString().slice(0, 10)),
    ]);
    const count = (r: D1Result) =>
      Number((r.results[0] as { value: number })?.value ?? 0);
    return json({
      patients: count(patientCount),
      calls: count(callCount),
      completed_calls: count(completed),
      registered_today: count(today),
      phone_number: env.VAPI_PHONE_NUMBER || null,
      assistant_id: env.VAPI_ASSISTANT_ID || null,
      voice_configured: !!(
        env.VAPI_PHONE_NUMBER &&
        env.VAPI_ASSISTANT_ID &&
        env.VAPI_WEBHOOK_SECRET
      ),
    });
  } catch (e) {
    return failure(e, requestId);
  }
}
