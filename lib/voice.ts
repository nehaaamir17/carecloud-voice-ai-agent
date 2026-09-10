import { z } from "zod";
import { PatientService } from "./patients";
import {
  patientSchema,
  phoneSchema,
  dobSchema,
  uuidSchema,
  type PatientInput,
} from "./validation";
import { AppError, errorDetails } from "./errors";
type Call = {
  call_id: string;
  patient_id: string | null;
  status: string;
  draft_json: string | null;
  draft_token: string | null;
  draft_patient_id: string | null;
  verified_patient_id: string | null;
  committed_token: string | null;
  updated_at: string;
};
const callIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
export function readback(p: PatientInput) {
  return (
    Object.entries(p)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`)
      .join(". ") + ". Is all of that correct, and may I save it?"
  );
}
export class VoiceService {
  readonly patients: PatientService;
  constructor(
    readonly db: D1Database,
    readonly logDemographics = false,
  ) {
    this.patients = new PatientService(db);
  }
  async ensure(callId: string) {
    callIdSchema.parse(callId);
    const now = new Date().toISOString();
    await this.db
      .prepare(
        "INSERT INTO calls (call_id,status,created_at,updated_at) VALUES (?,'in-progress',?,?) ON CONFLICT(call_id) DO NOTHING",
      )
      .bind(callId, now, now)
      .run();
    return this.session(callId);
  }
  async session(callId: string) {
    const c = await this.db
      .prepare("SELECT * FROM calls WHERE call_id = ?")
      .bind(callId)
      .first<Call>();
    if (!c)
      throw new AppError(404, "CALL_NOT_FOUND", "Call session not found.");
    return c;
  }
  async lookup(callId: string, args: unknown) {
    const input = z
      .object({
        phone_number: phoneSchema,
        date_of_birth: dobSchema.optional(),
      })
      .strict()
      .parse(args);
    await this.ensure(callId);
    await this.db
      .prepare("UPDATE calls SET verified_patient_id = NULL WHERE call_id = ?")
      .bind(callId)
      .run();
    const matches = await this.patients.list(
      new URLSearchParams({ phone_number: input.phone_number }),
    );
    if (!matches.length) return { found: false };
    if (!input.date_of_birth)
      return {
        found: true,
        verification_required: true,
        message:
          "A record may already exist. Ask for date of birth before discussing or updating it.",
      };
    const verified = matches.filter(
      (p) => p.date_of_birth === input.date_of_birth,
    );
    if (verified.length !== 1)
      return {
        found: true,
        verified: false,
        message:
          "Unable to identify one matching record. Clarify the phone number and date of birth. Do not disclose existing details.",
      };
    const p = verified[0];
    await this.db
      .prepare("UPDATE calls SET verified_patient_id = ? WHERE call_id = ?")
      .bind(p.patient_id, callId)
      .run();
    return {
      found: true,
      verified: true,
      patient: p,
      message: `It looks like we already have a record for ${p.first_name} ${p.last_name}. Would you like to update your information instead?`,
    };
  }
  async prepare(callId: string, args: unknown) {
    const input = z
      .object({
        patient: patientSchema,
        patient_id: uuidSchema.optional(),
        optional_fields_offered: z.literal(true),
        update_requested: z.boolean().optional(),
      })
      .strict()
      .parse(args);
    const c = await this.ensure(callId);
    if (c.patient_id)
      throw new AppError(
        409,
        "ALREADY_REGISTERED",
        "Registration was already saved during this call. Start a new call to make another change.",
      );
    if (c.status === "ended" || c.status === "abandoned")
      throw new AppError(
        409,
        "CALL_ENDED",
        "This call has ended. Start a new call.",
      );
    if (input.patient_id) {
      if (!input.update_requested || c.verified_patient_id !== input.patient_id)
        throw new AppError(
          403,
          "VERIFY_BEFORE_UPDATE",
          "Look up the existing patient using phone and date of birth, then ask permission to update.",
        );
      await this.patients.get(input.patient_id);
    }
    const baseUpdatedAt = input.patient_id
      ? (await this.patients.get(input.patient_id)).updated_at
      : null;
    const token = crypto.randomUUID(),
      now = new Date().toISOString();
    const id = input.patient_id ?? crypto.randomUUID();
    await this.db
      .prepare(
        "UPDATE calls SET draft_json = ?, draft_token = ?, draft_patient_id = ?, status = 'awaiting-confirmation', updated_at = ? WHERE call_id = ? AND patient_id IS NULL",
      )
      .bind(
        JSON.stringify({
          patient: input.patient,
          update: !!input.patient_id,
          baseUpdatedAt,
        }),
        token,
        id,
        now,
        callId,
      )
      .run();
    return {
      confirmation_token: token,
      patient: input.patient,
      read_back: readback(input.patient),
      instruction:
        "Read EVERY field back in the caller's language, then WAIT for an explicit yes. Corrections require a new prepare_registration call and read-back. Do not save yet.",
    };
  }
  async commit(callId: string, args: unknown) {
    const input = z
      .object({
        confirmation_token: uuidSchema,
        caller_confirmed: z.literal(true),
      })
      .strict()
      .parse(args);
    const c = await this.session(callId);
    if (c.committed_token === input.confirmation_token && c.patient_id)
      return {
        saved: true,
        patient: await this.patients.get(c.patient_id),
        replayed: true,
      };
    if (
      !c.draft_json ||
      c.draft_token !== input.confirmation_token ||
      c.status !== "awaiting-confirmation"
    )
      throw new AppError(
        409,
        "STALE_CONFIRMATION",
        "Prepare and read back the latest information before saving.",
      );
    if (Date.now() - Date.parse(c.updated_at) > 30 * 60 * 1000)
      throw new AppError(
        409,
        "CONFIRMATION_EXPIRED",
        "Please prepare the information and confirm it again.",
      );
    const draft = JSON.parse(c.draft_json);
    const p = patientSchema.parse(draft.patient);
    const id = c.draft_patient_id!;
    const now = new Date().toISOString();
    // D1 batch is transactional. The guard insert forces rollback if a concurrent
    // reset/correction changed the token after it was read. A duplicate primary key
    // aborts that batch, so a stale or concurrent confirmation cannot persist data.
    const guard = this.db
      .prepare(
        "INSERT INTO calls (call_id,status,created_at,updated_at) SELECT call_id,'guard',?,? FROM calls WHERE call_id = ? AND (draft_token IS NULL OR draft_token != ? OR status != 'awaiting-confirmation' OR patient_id IS NOT NULL OR (? = 1 AND NOT EXISTS (SELECT 1 FROM patients WHERE patient_id = ? AND deleted_at IS NULL AND updated_at = ?)))",
      )
      .bind(
        now,
        now,
        callId,
        input.confirmation_token,
        draft.update ? 1 : 0,
        id,
        draft.baseUpdatedAt ?? "",
      );
    const patientWrite = draft.update
      ? this.patients.updateStatement(p, id, now)
      : this.patients.insertStatement(p, id, now);
    const finish = this.db
      .prepare(
        "UPDATE calls SET patient_id = ?, committed_token = ?, draft_json = NULL, draft_token = NULL, status = 'registered', updated_at = ? WHERE call_id = ? AND draft_token = ?",
      )
      .bind(
        id,
        input.confirmation_token,
        now,
        callId,
        input.confirmation_token,
      );
    try {
      const results = await this.db.batch([guard, patientWrite, finish]);
      if (!results[1].meta.changes)
        throw new AppError(
          404,
          "PATIENT_NOT_FOUND",
          "The record is no longer available.",
        );
    } catch (e) {
      const latest = await this.session(callId);
      if (
        latest.committed_token === input.confirmation_token &&
        latest.patient_id
      )
        return {
          saved: true,
          patient: await this.patients.get(latest.patient_id),
          replayed: true,
        };
      if (latest.draft_token !== input.confirmation_token)
        throw new AppError(
          409,
          "STALE_CONFIRMATION",
          "Information changed. Read it back and confirm again.",
        );
      if (draft.update) {
        const current = await this.patients.get(id);
        if (current.updated_at !== draft.baseUpdatedAt)
          throw new AppError(
            409,
            "RECORD_CHANGED",
            "The record changed during this call. Look up the latest record, prepare it and confirm again.",
          );
      }
      throw e;
    }
    console.log(
      JSON.stringify({
        event: "voice_registration_saved",
        call_id: callId,
        patient_id: id,
        operation: draft.update ? "update" : "create",
        ...(this.logDemographics ? { payload: p } : { fields: Object.keys(p) }),
      }),
    );
    return {
      saved: true,
      patient: await this.patients.get(id),
      message: `You're all set, ${p.first_name}. Your registration has been saved.`,
    };
  }
  async reset(callId: string, args: unknown) {
    z.object({}).strict().parse(args);
    await this.ensure(callId);
    const c = await this.session(callId);
    if (c.patient_id)
      return {
        reset: false,
        message:
          "Your confirmed registration is already saved. A restart cannot erase a saved record; call again to update it.",
      };
    await this.db
      .prepare(
        "UPDATE calls SET draft_json = NULL, draft_token = NULL, draft_patient_id = NULL, verified_patient_id = NULL, status = 'in-progress', updated_at = ? WHERE call_id = ? AND patient_id IS NULL",
      )
      .bind(new Date().toISOString(), callId)
      .run();
    return {
      reset: true,
      message:
        "The unsaved draft is cleared. Begin again with the caller's name.",
    };
  }
  async slots() {
    const taken = await this.db
      .prepare("SELECT slot FROM appointments WHERE slot > ?")
      .bind(new Date().toISOString())
      .all<{ slot: string }>();
    const result: string[] = [];
    for (let n = 1; n <= 7; n++) {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() + n);
      if ([0, 6].includes(day.getUTCDay())) continue;
      for (const hour of [15, 17, 19]) {
        day.setUTCHours(hour, 0, 0, 0);
        const s = day.toISOString();
        if (!taken.results.some((t) => t.slot === s)) result.push(s);
      }
    }
    return {
      mock: true,
      time_zone: "UTC",
      slots: result.slice(0, 6),
      message:
        "Demo appointments only; no real clinical appointment is created. Read the time zone explicitly.",
    };
  }
  async book(callId: string, args: unknown) {
    const input = z
      .object({
        slot: z.string().datetime(),
        caller_confirmed: z.literal(true),
      })
      .strict()
      .parse(args);
    const c = await this.session(callId);
    if (!c.patient_id)
      throw new AppError(
        409,
        "REGISTER_FIRST",
        "Complete registration before scheduling.",
      );
    const old = await this.db
      .prepare("SELECT * FROM appointments WHERE call_id = ?")
      .bind(callId)
      .first();
    if (old) return { mock: true, appointment: old, replayed: true };
    if (!(await this.slots()).slots.includes(input.slot))
      throw new AppError(
        409,
        "SLOT_UNAVAILABLE",
        "That slot is unavailable. Offer a fresh slot.",
      );
    const id = crypto.randomUUID();
    try {
      await this.db
        .prepare(
          "INSERT INTO appointments (appointment_id,patient_id,slot,call_id,created_at) VALUES (?,?,?,?,?)",
        )
        .bind(id, c.patient_id, input.slot, callId, new Date().toISOString())
        .run();
    } catch {
      throw new AppError(
        409,
        "SLOT_UNAVAILABLE",
        "That slot was just taken. Offer a fresh slot.",
      );
    }
    return {
      mock: true,
      appointment_id: id,
      slot: input.slot,
      message: "Demo appointment saved. This is not a real clinical booking.",
    };
  }
  async tool(callId: string, name: string, args: unknown) {
    switch (name) {
      case "lookup_patient":
        return this.lookup(callId, args);
      case "prepare_registration":
        return this.prepare(callId, args);
      case "confirm_registration":
        return this.commit(callId, args);
      case "restart_registration":
        return this.reset(callId, args);
      case "available_appointments":
        return this.slots();
      case "book_appointment":
        return this.book(callId, args);
      default:
        throw new AppError(400, "UNKNOWN_TOOL", "Unknown voice tool.");
    }
  }
  async webhook(body: unknown) {
    const root = z
      .object({
        message: z
          .object({
            type: z.string(),
            call: z.object({ id: callIdSchema }).passthrough(),
          })
          .passthrough(),
      })
      .passthrough()
      .parse(body);
    const m = root.message as Record<string, any>;
    const callId = m.call.id as string;
    await this.ensure(callId);
    if (m.type === "tool-calls") {
      const list = z
        .array(
          z
            .object({
              id: z.string().min(1).max(200),
              function: z
                .object({ name: z.string(), arguments: z.unknown() })
                .optional(),
              name: z.string().optional(),
              arguments: z.unknown().optional(),
            })
            .passthrough(),
        )
        .min(1)
        .max(10)
        .parse(m.toolCallList);
      const results = [];
      for (const t of list) {
        try {
          const name = t.function?.name ?? t.name;
          let args = t.function?.arguments ?? t.arguments ?? {};
          if (typeof args === "string") {
            try {
              args = JSON.parse(args);
            } catch {
              throw new AppError(
                400,
                "INVALID_ARGUMENTS",
                "Tool arguments must be JSON.",
              );
            }
          }
          const data = await this.tool(callId, name ?? "", args);
          results.push({
            toolCallId: t.id,
            result: JSON.stringify({ data, error: null }),
          });
        } catch (e) {
          const d = errorDetails(e);
          console.error(
            JSON.stringify({
              event: "voice_tool_failed",
              call_id: callId,
              code: d.code,
            }),
          );
          results.push({
            toolCallId: t.id,
            result: JSON.stringify({
              data: null,
              error: d,
              instruction:
                d.status >= 500
                  ? "Tell the caller saving failed. Do not say registration succeeded. Offer one retry; retain the draft."
                  : "Ask only for the invalid field, correct it, and prepare a fresh read-back.",
            }),
          });
        }
      }
      return { results };
    }
    if (m.type === "end-of-call-report") {
      const transcript =
        typeof m.artifact?.transcript === "string"
          ? m.artifact.transcript
          : typeof m.transcript === "string"
            ? m.transcript
            : "";
      const summary =
        typeof m.analysis?.summary === "string" ? m.analysis.summary : "";
      await this.db
        .prepare(
          "UPDATE calls SET status = CASE WHEN patient_id IS NULL THEN 'abandoned' ELSE 'completed' END, transcript = ?, summary = ?, ended_reason = ?, draft_json = NULL, draft_token = NULL, updated_at = ? WHERE call_id = ?",
        )
        .bind(
          transcript.slice(0, 100000),
          summary.slice(0, 10000),
          String(m.endedReason ?? "unknown").slice(0, 200),
          new Date().toISOString(),
          callId,
        )
        .run();
      console.log(
        JSON.stringify({
          event: "call_ended",
          call_id: callId,
          transcript: transcript.slice(0, 100000),
          summary,
        }),
      );
    }
    return { data: { received: true }, error: null };
  }
}
