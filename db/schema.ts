import {
  sqliteTable,
  text,
  integer,
  index,
  check,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const patients = sqliteTable(
  "patients",
  {
    patient_id: text().primaryKey(),
    first_name: text().notNull(),
    last_name: text().notNull(),
    date_of_birth: text().notNull(),
    sex: text().notNull(),
    phone_number: text().notNull(),
    email: text(),
    address_line_1: text().notNull(),
    address_line_2: text(),
    city: text().notNull(),
    state: text().notNull(),
    zip_code: text().notNull(),
    insurance_provider: text(),
    insurance_member_id: text(),
    preferred_language: text().notNull().default("English"),
    emergency_contact_name: text(),
    emergency_contact_phone: text(),
    created_at: text().notNull(),
    updated_at: text().notNull(),
    deleted_at: text(),
  },
  (t) => [
    index("idx_patients_last_name")
      .on(t.last_name)
      .where(sql`${t.deleted_at} IS NULL`),
    index("idx_patients_phone")
      .on(t.phone_number)
      .where(sql`${t.deleted_at} IS NULL`),
    index("idx_patients_dob")
      .on(t.date_of_birth)
      .where(sql`${t.deleted_at} IS NULL`),
    check("patient_id_uuid", sql`length(${t.patient_id}) = 36`),
    check(
      "first_name_length",
      sql`length(trim(${t.first_name})) BETWEEN 1 AND 50`,
    ),
    check(
      "last_name_length",
      sql`length(trim(${t.last_name})) BETWEEN 1 AND 50`,
    ),
    check(
      "sex_enum",
      sql`${t.sex} IN ('Male','Female','Other','Decline to Answer')`,
    ),
    check(
      "phone_format",
      sql`length(${t.phone_number})=10 AND ${t.phone_number} NOT GLOB '*[^0-9]*' AND substr(${t.phone_number},1,1) BETWEEN '2' AND '9' AND substr(${t.phone_number},4,1) BETWEEN '2' AND '9'`,
    ),
    check(
      "dob_format",
      sql`${t.date_of_birth} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${t.date_of_birth},'+0 days') IS NOT NULL AND date(${t.date_of_birth},'+0 days')=${t.date_of_birth}`,
    ),
    check(
      "street_length",
      sql`length(trim(${t.address_line_1})) BETWEEN 1 AND 200`,
    ),
    check("city_length", sql`length(trim(${t.city})) BETWEEN 1 AND 100`),
    check(
      "state_enum",
      sql`${t.state} IN ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY')`,
    ),
    check(
      "zip_format",
      sql`${t.zip_code} GLOB '[0-9][0-9][0-9][0-9][0-9]' OR ${t.zip_code} GLOB '[0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'`,
    ),
    check(
      "member_id_format",
      sql`${t.insurance_member_id} IS NULL OR (length(${t.insurance_member_id}) BETWEEN 1 AND 100 AND ${t.insurance_member_id} NOT GLOB '*[^A-Za-z0-9]*')`,
    ),
    check(
      "emergency_phone_format",
      sql`${t.emergency_contact_phone} IS NULL OR (length(${t.emergency_contact_phone})=10 AND ${t.emergency_contact_phone} NOT GLOB '*[^0-9]*')`,
    ),
    check(
      "language_length",
      sql`length(trim(${t.preferred_language})) BETWEEN 1 AND 50`,
    ),
  ],
);
export const calls = sqliteTable(
  "calls",
  {
    call_id: text().primaryKey(),
    patient_id: text().references(() => patients.patient_id),
    status: text().notNull().default("in-progress"),
    draft_json: text(),
    draft_token: text(),
    draft_patient_id: text(),
    verified_patient_id: text(),
    committed_token: text(),
    summary: text(),
    transcript: text(),
    ended_reason: text(),
    created_at: text().notNull(),
    updated_at: text().notNull(),
  },
  (t) => [
    index("idx_calls_patient").on(t.patient_id),
    index("idx_calls_updated").on(t.updated_at),
  ],
);
export const appointments = sqliteTable(
  "appointments",
  {
    appointment_id: text().primaryKey(),
    patient_id: text()
      .notNull()
      .references(() => patients.patient_id),
    slot: text().notNull(),
    call_id: text()
      .notNull()
      .references(() => calls.call_id),
    created_at: text().notNull(),
  },
  (t) => [
    uniqueIndex("idx_appointments_slot").on(t.slot),
    uniqueIndex("idx_appointments_call").on(t.call_id),
  ],
);
export const rateLimits = sqliteTable("rate_limits", {
  bucket: text().primaryKey(),
  count: integer().notNull(),
  expires_at: integer().notNull(),
});
