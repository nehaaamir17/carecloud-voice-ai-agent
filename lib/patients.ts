import {
  patientSchema,
  patientPatchSchema,
  uuidSchema,
  phoneSchema,
  dobSchema,
  toISO,
  fromISO,
  optionalFields,
  type Patient,
  type PatientInput,
} from "./validation";
import { AppError } from "./errors";
export function serialize(row: Record<string, unknown>): Patient {
  return {
    ...row,
    date_of_birth: fromISO(String(row.date_of_birth)),
  } as Patient;
}
export function dbValues(input: PatientInput) {
  const v: Record<string, unknown> = {
    ...input,
    date_of_birth: toISO(input.date_of_birth),
  };
  for (const k of optionalFields) v[k] ??= null;
  return v;
}
export class PatientService {
  constructor(readonly db: D1Database) {}
  async list(query: URLSearchParams = new URLSearchParams()) {
    const where = ["deleted_at IS NULL"];
    const args: unknown[] = [];
    for (const key of query.keys())
      if (
        ![
          "last_name",
          "date_of_birth",
          "phone_number",
          "limit",
          "offset",
        ].includes(key)
      )
        throw new AppError(
          400,
          "INVALID_QUERY",
          `Unknown query parameter: ${key}`,
        );
    if (query.has("last_name")) {
      const name = query.get("last_name")!.trim();
      if (!name || name.length > 50)
        throw new AppError(
          422,
          "INVALID_QUERY",
          "Last name must be 1–50 characters.",
        );
      where.push("last_name = ? COLLATE NOCASE");
      args.push(name);
    }
    if (query.has("date_of_birth")) {
      where.push("date_of_birth = ?");
      args.push(toISO(dobSchema.parse(query.get("date_of_birth"))));
    }
    if (query.has("phone_number")) {
      where.push("phone_number = ?");
      args.push(phoneSchema.parse(query.get("phone_number")));
    }
    // Unpaginated listing is supported as required; pagination is opt-in.
    let pagination = "";
    if (query.has("limit") || query.has("offset")) {
      const limit = Number(query.get("limit") ?? 100),
        offset = Number(query.get("offset") ?? 0);
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 500 ||
        !Number.isInteger(offset) ||
        offset < 0
      )
        throw new AppError(
          422,
          "INVALID_QUERY",
          "Use limit 1–500 and a nonnegative offset.",
        );
      pagination = " LIMIT ? OFFSET ?";
      args.push(limit, offset);
    }
    const r = await this.db
      .prepare(
        `SELECT * FROM patients WHERE ${where.join(" AND ")} ORDER BY created_at DESC, patient_id${pagination}`,
      )
      .bind(...args)
      .all<Record<string, unknown>>();
    return r.results.map(serialize);
  }
  async get(id: string) {
    uuidSchema.parse(id);
    const row = await this.db
      .prepare(
        "SELECT * FROM patients WHERE patient_id = ? AND deleted_at IS NULL",
      )
      .bind(id)
      .first<Record<string, unknown>>();
    if (!row)
      throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
    return serialize(row);
  }
  insertStatement(
    input: PatientInput,
    id = crypto.randomUUID(),
    now = new Date().toISOString(),
  ) {
    const v = {
      ...dbValues(input),
      patient_id: id,
      created_at: now,
      updated_at: now,
    };
    const keys = Object.keys(v);
    return this.db
      .prepare(
        `INSERT INTO patients (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
      )
      .bind(...Object.values(v));
  }
  async create(body: unknown) {
    const data = patientSchema.parse(body);
    const id = crypto.randomUUID();
    await this.insertStatement(data, id).run();
    return this.get(id);
  }
  updateStatement(
    data: PatientInput,
    id: string,
    now = new Date().toISOString(),
  ) {
    const values = { ...dbValues(data), updated_at: now };
    return this.db
      .prepare(
        `UPDATE patients SET ${Object.keys(values)
          .map((k) => `${k} = ?`)
          .join(",")} WHERE patient_id = ? AND deleted_at IS NULL`,
      )
      .bind(...Object.values(values), id);
  }
  async update(id: string, body: unknown) {
    const patch = patientPatchSchema.parse(body);
    const old = await this.get(id);
    const { patient_id, created_at, updated_at, deleted_at, ...demographics } =
      old;
    void patient_id;
    void created_at;
    void updated_at;
    void deleted_at;
    const data = patientSchema.parse({ ...demographics, ...patch });
    const now = new Date().toISOString();
    const v: Record<string, unknown> = {};
    for (const k of Object.keys(patch))
      v[k] =
        k === "date_of_birth"
          ? toISO(data.date_of_birth)
          : (data[k as keyof PatientInput] ?? null);
    v.updated_at = now;
    const result = await this.db
      .prepare(
        `UPDATE patients SET ${Object.keys(v)
          .map((k) => `${k} = ?`)
          .join(",")} WHERE patient_id = ? AND deleted_at IS NULL`,
      )
      .bind(...Object.values(v), id)
      .run();
    if (!result.meta.changes)
      throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
    return this.get(id);
  }
  async remove(id: string) {
    uuidSchema.parse(id);
    const now = new Date().toISOString();
    const r = await this.db
      .prepare(
        "UPDATE patients SET deleted_at = ?, updated_at = ? WHERE patient_id = ? AND deleted_at IS NULL",
      )
      .bind(now, now, id)
      .run();
    if (!r.meta.changes)
      throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
    return { patient_id: id, deleted_at: now };
  }
}
