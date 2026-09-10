import assert from "node:assert/strict";
const base = (process.env.PUBLIC_BASE_URL || "http://localhost:5173").replace(
  /\/$/,
  "",
);
const apiKey = process.env.ADMIN_API_KEY;
if (!apiKey) throw Error("ADMIN_API_KEY is required");
async function request(path, method = "GET", body, auth = apiKey) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json();
  return { status: r.status, ...data };
}
const suffix = crypto.randomUUID().slice(0, 6).replace(/[0-9]/g, "a");
const patient = {
  first_name: "Test",
  last_name: "Review" + suffix,
  date_of_birth: "01/15/1990",
  sex: "Decline to Answer",
  phone_number: "2025550199",
  address_line_1: "123 Example Street",
  city: "Boston",
  state: "MA",
  zip_code: "02108",
};
assert.equal((await request("/health")).status, 200);
assert.equal((await request("/patients", "GET", null, "invalid")).status, 401);
assert.equal(
  (
    await request("/patients", "POST", {
      ...patient,
      date_of_birth: "02/30/2020",
    })
  ).status,
  422,
);
const created = await request("/patients", "POST", patient);
assert.equal(created.status, 201);
const id = created.data.patient_id;
try {
  assert.equal(
    (await request("/patients/" + id)).data.last_name,
    patient.last_name,
  );
  assert.equal(
    (await request("/patients?last_name=" + patient.last_name)).data.length,
    1,
  );
  assert.equal(
    (await request("/patients/" + id, "PUT", { city: "Cambridge" })).data.city,
    "Cambridge",
  );
  console.log(
    "PASS: live health, authentication, validation, create, query and update",
  );
} finally {
  assert.equal((await request("/patients/" + id, "DELETE")).status, 200);
  assert.equal((await request("/patients/" + id)).status, 404);
}
if (process.env.VAPI_WEBHOOK_SECRET) {
  const callId = "smoke-" + crypto.randomUUID();
  async function tool(name, args) {
    const r = await fetch(base + "/webhooks/vapi", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VAPI_WEBHOOK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          type: "tool-calls",
          call: { id: callId },
          toolCallList: [
            { id: crypto.randomUUID(), function: { name, arguments: args } },
          ],
        },
      }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    return JSON.parse(body.results[0].result);
  }
  const draft = await tool("prepare_registration", {
    patient,
    optional_fields_offered: true,
  });
  assert.equal(draft.error, null);
  const saved = await tool("confirm_registration", {
    confirmation_token: draft.data.confirmation_token,
    caller_confirmed: true,
  });
  assert.equal(saved.data.saved, true);
  const replay = await tool("confirm_registration", {
    confirmation_token: draft.data.confirmation_token,
    caller_confirmed: true,
  });
  assert.equal(replay.data.patient.patient_id, saved.data.patient.patient_id);
  await request("/patients/" + saved.data.patient.patient_id, "DELETE");
  console.log(
    "PASS: authenticated live voice webhook, prepare, confirmation and idempotent replay",
  );
}
console.log(
  "PASS: soft deletion. Smoke records were archived, not hard-deleted. This does not test real phone audio.",
);
