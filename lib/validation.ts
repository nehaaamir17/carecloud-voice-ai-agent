import { z } from "zod";
export const STATES =
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  );
const clean = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(max)
    .refine(
      (v) => !/[\u0000-\u001f\u007f<>]/.test(v),
      "Control characters and markup are not allowed",
    );
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[\p{L}'-]+$/u, "Use letters, hyphens or apostrophes only");
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s().-]/g, "").replace(/^\+?1(?=\d{10}$)/, ""))
  .pipe(
    z
      .string()
      .regex(
        /^[2-9]\d{2}[2-9]\d{6}$/,
        "Provide a valid U.S. 10-digit phone number, including area code",
      ),
  );
export const dobSchema = z
  .string()
  .regex(/^\d{2}\/\d{2}\/\d{4}$/, "Use MM/DD/YYYY")
  .superRefine((v, ctx) => {
    const [m, d, y] = v.split("/").map(Number);
    const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const date = new Date(`${iso}T00:00:00.000Z`);
    if (
      y < 1 ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== iso
    )
      ctx.addIssue({ code: "custom", message: "Provide a real calendar date" });
    else if (iso > new Date().toISOString().slice(0, 10))
      ctx.addIssue({
        code: "custom",
        message: "Date of birth cannot be in the future",
      });
  });
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? null : v), schema.nullable().optional());
export const patientSchema = z
  .object({
    first_name: nameSchema,
    last_name: nameSchema,
    date_of_birth: dobSchema,
    sex: z.enum(["Male", "Female", "Other", "Decline to Answer"]),
    phone_number: phoneSchema,
    email: optional(z.string().trim().max(254).email()),
    address_line_1: clean(200),
    address_line_2: optional(clean(100)),
    city: clean(100),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .refine(
        (v) => STATES.includes(v),
        "Use a valid two-letter U.S. state abbreviation",
      ),
    zip_code: z
      .string()
      .trim()
      .regex(/^\d{5}(-\d{4})?$/, "Use a 5-digit ZIP or ZIP+4"),
    insurance_provider: optional(clean(150)),
    insurance_member_id: optional(
      z
        .string()
        .trim()
        .max(100)
        .regex(/^[A-Za-z0-9]+$/, "Insurance member ID must be alphanumeric"),
    ),
    preferred_language: clean(50).default("English"),
    emergency_contact_name: optional(clean(100)),
    emergency_contact_phone: optional(phoneSchema),
  })
  .strict();
export const patientPatchSchema = patientSchema
  .partial()
  .strict()
  .refine(
    (v) => Object.keys(v).length > 0,
    "Provide at least one field to update",
  );
export type PatientInput = z.infer<typeof patientSchema>;
export type Patient = PatientInput & {
  patient_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
export const uuidSchema = z.string().uuid("Patient ID must be a UUID");
export function toISO(v: string) {
  const [m, d, y] = v.split("/");
  return `${y}-${m}-${d}`;
}
export function fromISO(v: string) {
  const [y, m, d] = v.split("-");
  return `${m}/${d}/${y}`;
}
export const optionalFields = [
  "email",
  "address_line_2",
  "insurance_provider",
  "insurance_member_id",
  "emergency_contact_name",
  "emergency_contact_phone",
] as const;
