import { writeFileSync } from "node:fs";
import { toolDefinitions } from "../voice/assistant.mjs";
const input = toolDefinitions.find((t) => t.name === "prepare_registration")
  .parameters.properties.patient;
const patient = {
  ...input,
  properties: {
    ...input.properties,
    patient_id: { type: "string", format: "uuid", readOnly: true },
    created_at: { type: "string", format: "date-time", readOnly: true },
    updated_at: { type: "string", format: "date-time", readOnly: true },
    deleted_at: { type: ["string", "null"], readOnly: true },
  },
};
const envelope = {
  type: "object",
  required: ["data", "error"],
  properties: {
    data: {},
    error: {
      type: ["object", "null"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        fields: { type: "array", items: { type: "object" } },
        request_id: { type: "string" },
      },
    },
  },
};
const response = (description) => ({
  description,
  content: { "application/json": { schema: envelope } },
});
const responses = {
  200: response("Success"),
  400: response("Malformed request"),
  401: response("Missing or invalid bearer key"),
  404: response("Patient not found"),
  422: response("Field validation failed"),
  429: response("Rate limit exceeded"),
  500: response("Unexpected error"),
  503: response("Service unavailable"),
};
const body = (schema) => ({
  required: true,
  content: { "application/json": { schema } },
});
const id = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const doc = {
  openapi: "3.1.0",
  info: {
    title: "CareCloud Voice Intake API",
    version: "1.0.0",
    description:
      "Technical assessment; synthetic data only. Dates use MM/DD/YYYY at the API boundary and ISO dates in SQLite. All patient endpoints use a consistent data/error envelope.",
  },
  servers: [{ url: "/" }],
  security: [{ BearerAuth: [] }],
  components: {
    securitySchemes: { BearerAuth: { type: "http", scheme: "bearer" } },
    schemas: { PatientInput: input, Patient: patient, Envelope: envelope },
  },
  paths: {
    "/patients": {
      get: {
        summary: "List active patient records",
        parameters: [
          ...["last_name", "date_of_birth", "phone_number"].map((name) => ({
            name,
            in: "query",
            schema: { type: "string" },
          })),
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 500 },
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", minimum: 0 },
          },
        ],
        responses,
      },
      post: {
        summary: "Create a patient",
        requestBody: body({ $ref: "#/components/schemas/PatientInput" }),
        responses: { ...responses, 201: response("Patient created") },
      },
    },
    "/patients/{id}": {
      get: { summary: "Get a patient", parameters: [id], responses },
      put: {
        summary: "Partial update; omitted fields preserved",
        parameters: [id],
        requestBody: body({ ...input, required: [], minProperties: 1 }),
        responses,
      },
      delete: { summary: "Soft-delete a patient", parameters: [id], responses },
    },
    "/health": {
      get: {
        summary: "Health and phone configuration",
        security: [],
        responses,
      },
    },
    "/api/calls": {
      get: {
        summary: "Latest 100 calls and transcripts",
        parameters: [
          {
            name: "patient_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses,
      },
    },
    "/api/appointments": { get: { summary: "Mock appointments", responses } },
  },
};
writeFileSync("public/openapi.json", JSON.stringify(doc, null, 2) + "\n");
const sample = {
  first_name: "Jane",
  last_name: "Doe",
  date_of_birth: "03/15/1990",
  sex: "Female",
  phone_number: "2025550142",
  address_line_1: "123 Example Street",
  city: "Boston",
  state: "MA",
  zip_code: "02108",
};
const item = (name, method, path, body) => ({
  name,
  request: {
    method,
    header: body ? [{ key: "Content-Type", value: "application/json" }] : [],
    url: {
      raw: "{{base_url}}" + path,
      host: ["{{base_url}}"],
      path: path.slice(1).split("/"),
    },
    ...(body
      ? { body: { mode: "raw", raw: JSON.stringify(body, null, 2) } }
      : {}),
  },
});
const collection = {
  info: {
    name: "CareCloud Intake",
    schema:
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  auth: {
    type: "bearer",
    bearer: [{ key: "token", value: "{{api_key}}", type: "string" }],
  },
  variable: [
    { key: "base_url", value: "http://localhost:5173" },
    { key: "api_key", value: "" },
    { key: "patient_id", value: "" },
  ],
  item: [
    item("Health", "GET", "/health"),
    item("List patients", "GET", "/patients"),
    {
      ...item("Create synthetic patient", "POST", "/patients", sample),
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: [
              "pm.test('Created', () => pm.response.to.have.status(201));",
              "pm.collectionVariables.set('patient_id', pm.response.json().data.patient_id);",
            ],
          },
        },
      ],
    },
    item("Get patient", "GET", "/patients/{{patient_id}}"),
    item("Correct last name", "PUT", "/patients/{{patient_id}}", {
      last_name: "Davis",
    }),
    item("Soft-delete patient", "DELETE", "/patients/{{patient_id}}"),
    item("View call history", "GET", "/api/calls"),
  ],
};
writeFileSync(
  "public/postman.json",
  JSON.stringify(collection, null, 2) + "\n",
);
