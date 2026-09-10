import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { assistantConfiguration } from "../voice/assistant.mjs";
const key = process.env.VAPI_API_KEY,
  base = process.env.PUBLIC_BASE_URL,
  secret = process.env.VAPI_WEBHOOK_SECRET;
if (!key || !base || !secret) {
  console.error(
    "Set VAPI_API_KEY, PUBLIC_BASE_URL and VAPI_WEBHOOK_SECRET in .env, then rerun npm run vapi:provision.",
  );
  process.exit(1);
}
if (!base.startsWith("https://"))
  throw Error("PUBLIC_BASE_URL must use HTTPS.");
const stateFile = "provisioning.local.json";
const state = existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile, "utf8"))
  : {};
const save = () =>
  writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
async function request(path, method = "GET", body) {
  const r = await fetch("https://api.vapi.ai" + path, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  const result = await r.json();
  if (!r.ok) {
    const details = JSON.stringify(result)
      .replaceAll(key, "[REDACTED]")
      .replaceAll(secret, "[REDACTED]");
    console.error(`Vapi ${method} ${path}: HTTP ${r.status}. ${details}`);
    throw Error(
      "Vapi request failed; no automatic create retry was attempted.",
    );
  }
  return result;
}
// Each completed provisioning step is checkpointed. Never buy a number here;
// only request a Vapi-managed free inbound US number or reuse a supplied number.
if (!state.credentialId) {
  if (state.credentialAttempted)
    throw Error(
      "Previous credential creation had an uncertain outcome. Inspect Vapi and set credentialId in provisioning.local.json before retrying.",
    );
  state.credentialAttempted = true;
  save();
  const c = await request("/credential", "POST", {
    provider: "custom",
    name: "CareCloud webhook",
    authenticationPlan: {
      type: "bearer",
      token: secret,
      headerName: "Authorization",
      bearerPrefixEnabled: true,
    },
  });
  state.credentialId = c.id;
  save();
}
const config = assistantConfiguration(base, state.credentialId);
if (!state.assistantId) {
  if (state.assistantAttempted)
    throw Error(
      "Inspect the previous assistant creation in Vapi and set assistantId before retrying.",
    );
  state.assistantAttempted = true;
  save();
  const a = await request("/assistant", "POST", config);
  state.assistantId = a.id;
  save();
} else await request("/assistant/" + state.assistantId, "PATCH", config);
if (!state.phoneNumberId) {
  const numbers = await request("/phone-number");
  const existing = numbers.find((n) => n.assistantId === state.assistantId);
  if (existing) {
    state.phoneNumberId = existing.id;
    state.phoneNumber = existing.number;
    save();
  } else {
    if (state.phoneAttempted)
      throw Error(
        "Inspect the previous phone-number request in Vapi before retrying. Do not create duplicate numbers.",
      );
    state.phoneAttempted = true;
    save();
    const n = await request("/phone-number", "POST", {
      provider: "vapi",
      name: "CareCloud Intake",
      numberDesiredAreaCode: process.env.VAPI_AREA_CODE || "772",
      assistantId: state.assistantId,
    });
    state.phoneNumberId = n.id;
    state.phoneNumber = n.number;
    save();
  }
}
await request("/phone-number/" + state.phoneNumberId, "PATCH", {
  assistantId: state.assistantId,
});
console.log(
  JSON.stringify(
    {
      assistant_id: state.assistantId,
      phone_number: state.phoneNumber,
      api_base_url: base,
      dashboard: base,
      instruction:
        "Set VAPI_ASSISTANT_ID and VAPI_PHONE_NUMBER on the backend, then call the number to verify the complete flow.",
    },
    null,
    2,
  ),
);
