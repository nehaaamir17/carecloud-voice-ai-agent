import { readFileSync } from "node:fs";
const text = (description) => ({ type: "string", description });
const properties = {
  first_name: text("First name; 1–50 letters, hyphens or apostrophes"),
  last_name: text("Last name; 1–50 letters, hyphens or apostrophes"),
  date_of_birth: text("Valid birth date, not future; MM/DD/YYYY"),
  sex: {
    type: "string",
    enum: ["Male", "Female", "Other", "Decline to Answer"],
  },
  phone_number: text("US 10-digit number including area code"),
  email: text("Optional valid email"),
  address_line_1: text("Street address"),
  address_line_2: text("Optional apartment, suite or unit"),
  city: text("City, 1–100 characters"),
  state: text("Two-letter US state abbreviation"),
  zip_code: text("5-digit ZIP or ZIP+4; preserve leading zeros"),
  insurance_provider: text("Optional insurance company"),
  insurance_member_id: text("Optional alphanumeric member ID"),
  preferred_language: text("Default English; Spanish if preferred"),
  emergency_contact_name: text("Optional full name"),
  emergency_contact_phone: text(
    "Optional US 10-digit emergency contact number",
  ),
};
export const requiredFields = [
  "first_name",
  "last_name",
  "date_of_birth",
  "sex",
  "phone_number",
  "address_line_1",
  "city",
  "state",
  "zip_code",
];
const object = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export const toolDefinitions = [
  {
    name: "lookup_patient",
    description:
      "Look up returning patient by phone and birth date. Verify before revealing details or updating.",
    parameters: object(
      {
        phone_number: properties.phone_number,
        date_of_birth: properties.date_of_birth,
      },
      ["phone_number"],
    ),
  },
  {
    name: "prepare_registration",
    description:
      "Validate a complete draft and return every field for read-back. Does NOT save the patient. Call again after any correction.",
    parameters: object(
      {
        patient: object(properties, requiredFields),
        patient_id: text(
          "Only for a verified returning patient who agreed to update",
        ),
        update_requested: { type: "boolean" },
        optional_fields_offered: { type: "boolean", enum: [true] },
      },
      ["patient", "optional_fields_offered"],
    ),
  },
  {
    name: "confirm_registration",
    description:
      "Save the latest prepared record ONLY AFTER the caller explicitly confirms the complete read-back. Never call in the same turn as prepare_registration.",
    parameters: object(
      {
        confirmation_token: text(
          "Exact token returned by latest prepare_registration",
        ),
        caller_confirmed: { type: "boolean", enum: [true] },
      },
      ["confirmation_token", "caller_confirmed"],
    ),
  },
  {
    name: "restart_registration",
    description:
      "Clear the current call's unsaved draft when the caller asks to start over. Saved records are not deleted.",
    parameters: object({}),
  },
  {
    name: "available_appointments",
    description:
      "After registration, get actual available MOCK appointment slots. These are not real clinical bookings.",
    parameters: object({}),
  },
  {
    name: "book_appointment",
    description:
      "Book a mock slot after caller explicitly confirms its date, time and UTC zone.",
    parameters: object(
      {
        slot: text("Exact ISO timestamp from available_appointments"),
        caller_confirmed: { type: "boolean", enum: [true] },
      },
      ["slot", "caller_confirmed"],
    ),
  },
];
export function assistantConfiguration(baseUrl, credentialId) {
  const server = {
    url: baseUrl.replace(/\/$/, "") + "/webhooks/vapi",
    credentialId,
    timeoutSeconds: 20,
  };
  return {
    name: "CareCloud Intake — Alex",
    firstMessage:
      "Hi, I'm Alex, the AI registration assistant for this demo. This conversation is transcribed, so please use fictional details. I can help in English or Spanish. What are your first and last names?",
    model: {
      provider: "openai",
      model: process.env.VAPI_MODEL || "gpt-4.1",
      temperature: 0.2,
      maxTokens: 1400,
      messages: [
        {
          role: "system",
          content: readFileSync(
            new URL("./system-prompt.md", import.meta.url),
            "utf8",
          ),
        },
      ],
      tools: [
        ...toolDefinitions.map((fn) => ({
          type: "function",
          async: false,
          function: fn,
          server,
          messages: [
            {
              type: "request-failed",
              content:
                "I am sorry, I could not complete that step. Your registration may not be saved. Please try again in a moment.",
            },
          ],
        })),
        { type: "endCall" },
      ],
    },
    voice: {
      provider: "vapi",
      voiceId: "Elliot",
      version: 2,
      language: "auto",
    },
    transcriber: { provider: "deepgram", model: "nova-3", language: "multi" },
    server,
    serverMessages: ["tool-calls", "end-of-call-report", "status-update"],
    maxDurationSeconds: 1200,
    backgroundSound: "off",
    artifactPlan: { recordingEnabled: false },
    endCallMessage: "Thank you for trying CareCloud Intake. Goodbye!",
  };
}
