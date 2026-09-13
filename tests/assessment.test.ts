import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { database, reopen } from "./database";
import { handleRequest } from "../lib/http";
import { patientSchema } from "../lib/validation";
import { VoiceService } from "../lib/voice";
import type { AppEnv } from "../lib/auth";
const key = "test-access-key-32-characters-long-123456",
  secret = "test-webhook-secret-32-characters-123456";
export const jane = {
  first_name: "Jane",
  last_name: "Doe",
  date_of_birth: "02/29/1992",
  sex: "Female",
  phone_number: "2025550142",
  address_line_1: "123 Example Street",
  city: "Boston",
  state: "MA",
  zip_code: "02108",
};
function harness(db = database()) {
  const env: AppEnv = {
    DB: db,
    ADMIN_API_KEY: key,
    VAPI_WEBHOOK_SECRET: secret,
  };
  return {
    db,
    env,
    async request(
      path: string,
      method = "GET",
      body?: unknown,
      headers: Record<string, string> = {},
    ) {
      return handleRequest(
        new Request("https://carecloud.test" + path, {
          method,
          headers: {
            authorization: "Bearer " + key,
            "content-type": "application/json",
            ...headers,
          },
          ...(body !== undefined
            ? { body: typeof body === "string" ? body : JSON.stringify(body) }
            : {}),
        }),
        env,
      );
    },
  };
}
test("complete REST lifecycle, filters, envelope and soft deletion", async () => {
  const h = harness();
  try {
    const r = await h.request("/patients", "POST", jane);
    assert.equal(r.status, 201);
    const { data, error } = (await r.json()) as any;
    assert.equal(error, null);
    assert.match(data.patient_id, /^[0-9a-f-]{36}$/);
    assert.equal(data.preferred_language, "English");
    assert.equal(data.date_of_birth, "02/29/1992");
    assert.match(data.created_at, /Z$/);
    for (const q of [
      "last_name=Doe",
      "date_of_birth=02%2F29%2F1992",
      "phone_number=2025550142",
    ]) {
      assert.equal(
        ((await (await h.request("/patients?" + q)).json()) as any).data.length,
        1,
      );
    }
    assert.equal(
      (
        await h.request("/patients/" + data.patient_id, "PUT", {
          last_name: "Davis",
        })
      ).status,
      200,
    );
    const updated = (await (
      await h.request("/patients/" + data.patient_id)
    ).json()) as any;
    assert.equal(updated.data.last_name, "Davis");
    assert.equal(updated.data.first_name, "Jane");
    assert.equal(
      (await h.request("/patients/" + data.patient_id, "DELETE")).status,
      200,
    );
    assert.equal((await h.request("/patients/" + data.patient_id)).status, 404);
    assert.equal(
      ((await (await h.request("/patients")).json()) as any).data.length,
      0,
    );
    assert.ok(
      h.db.sqlite.prepare("SELECT deleted_at FROM patients").get()?.deleted_at,
    );
  } finally {
    h.db.close();
  }
});
test("every demographic validation and strict server-owned fields", async () => {
  const h = harness();
  try {
    const invalid = [
      { first_name: "Jane3" },
      { last_name: "" },
      { date_of_birth: "02/30/1992" },
      { date_of_birth: "02/29/1993" },
      { date_of_birth: "12/31/2999" },
      { date_of_birth: "1992-02-29" },
      { sex: "Unknown" },
      { phone_number: "123" },
      { phone_number: "1234567890" },
      { email: "wrong@" },
      { address_line_1: "" },
      { city: "x".repeat(101) },
      { state: "ZZ" },
      { zip_code: "1234" },
      { insurance_member_id: "A-42" },
      { emergency_contact_phone: "123" },
      { patient_id: crypto.randomUUID() },
      { created_at: "today" },
      { deleted_at: "now" },
      { address_line_1: "<script>" },
    ];
    for (const v of invalid) {
      const r = await h.request("/patients", "POST", { ...jane, ...v });
      assert.equal(r.status, 422, JSON.stringify(v));
      const e = (await r.json()) as any;
      assert.equal(e.data, null);
      assert.equal(e.error.code, "VALIDATION_ERROR");
    }
    assert.equal((await h.request("/patients", "POST", "{")).status, 400);
    assert.equal((await h.request("/patients?phone_number=123")).status, 422);
    assert.equal((await h.request("/patients/not-a-uuid")).status, 422);
    assert.equal((await h.request("/patients?unknown=x")).status, 400);
  } finally {
    h.db.close();
  }
});
test("optional normalization, accents, leading zero ZIP and country code", () => {
  const p = patientSchema.parse({
    ...jane,
    first_name: "José",
    last_name: "O'Neil-Smith",
    phone_number: "+1 (202) 555-0142",
    email: "",
    state: "ma",
    insurance_member_id: "AB123",
    zip_code: "02108-1234",
  });
  assert.equal(p.phone_number, "2025550142");
  assert.equal(p.email, null);
  assert.equal(p.state, "MA");
  assert.equal(p.zip_code, "02108-1234");
});
test("API auth, webhook separation, signed session and CSRF", async () => {
  const h = harness();
  try {
    assert.equal(
      (await h.request("/patients", "GET", undefined, { authorization: "" }))
        .status,
      401,
    );
    assert.equal((await h.request("/webhooks/vapi", "POST", {})).status, 401);
    const login = await h.request("/api/session", "POST", { key });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.match(login.headers.get("set-cookie")!, /HttpOnly/);
    assert.match(login.headers.get("set-cookie")!, /Secure/);
    assert.equal(
      (
        await h.request("/patients", "GET", undefined, {
          authorization: "",
          cookie,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await h.request("/patients", "POST", jane, {
          authorization: "",
          cookie,
          origin: "https://evil.test",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await h.request("/patients", "POST", jane, {
          authorization: "",
          cookie,
          origin: "https://carecloud.test",
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await h.request("/patients", "GET", undefined, {
          authorization: "",
          cookie: cookie + "x",
        })
      ).status,
      401,
    );
  } finally {
    h.db.close();
  }
});
test("browser voice config exposes only the origin-restricted public key", async () => {
  const h = harness();
  try {
    h.env.VAPI_ASSISTANT_ID = "assistant-test";
    h.env.VAPI_PUBLIC_KEY = "public-test-key";
    const response = await h.request("/api/voice-config", "GET", undefined, {
      authorization: "",
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as any;
    assert.deepEqual(body.data, {
      enabled: true,
      assistant_id: "assistant-test",
      public_key: "public-test-key",
    });
    assert.equal(JSON.stringify(body).includes(key), false);
    assert.equal(JSON.stringify(body).includes(secret), false);
  } finally {
    h.db.close();
  }
});
test("voice requires optional offer and confirmation; corrections invalidate tokens", async () => {
  const db = database(),
    voice = new VoiceService(db);
  try {
    await assert.rejects(voice.prepare("call1", { patient: jane }));
    const first = await voice.prepare("call1", {
      patient: jane,
      optional_fields_offered: true,
    });
    assert.equal((await voice.patients.list()).length, 0);
    assert.match(first.read_back, /date of birth: 02\/29\/1992/);
    const corrected = await voice.prepare("call1", {
      patient: { ...jane, last_name: "Davis" },
      optional_fields_offered: true,
    });
    await assert.rejects(
      voice.commit("call1", {
        confirmation_token: first.confirmation_token,
        caller_confirmed: true,
      }),
    );
    await assert.rejects(
      voice.commit("call1", {
        confirmation_token: corrected.confirmation_token,
        caller_confirmed: false,
      }),
    );
    const saved = await voice.commit("call1", {
      confirmation_token: corrected.confirmation_token,
      caller_confirmed: true,
    });
    assert.equal(saved.patient.last_name, "Davis");
    const replay = await voice.commit("call1", {
      confirmation_token: corrected.confirmation_token,
      caller_confirmed: true,
    });
    assert.equal(replay.patient.patient_id, saved.patient.patient_id);
    assert.equal((await voice.patients.list()).length, 1);
  } finally {
    db.close();
  }
});
test("start over and dropped calls never save unconfirmed information", async () => {
  const db = database(),
    v = new VoiceService(db);
  try {
    const draft = await v.prepare("reset", {
      patient: jane,
      optional_fields_offered: true,
    });
    await v.reset("reset", {});
    await assert.rejects(
      v.commit("reset", {
        confirmation_token: draft.confirmation_token,
        caller_confirmed: true,
      }),
    );
    const next = await v.prepare("drop", {
      patient: jane,
      optional_fields_offered: true,
    });
    await v.webhook({
      message: {
        type: "end-of-call-report",
        call: { id: "drop" },
        artifact: { transcript: "Caller: Jane Doe" },
        endedReason: "customer-ended-call",
      },
    });
    await assert.rejects(
      v.commit("drop", {
        confirmation_token: next.confirmation_token,
        caller_confirmed: true,
      }),
    );
    assert.equal((await v.patients.list()).length, 0);
    assert.equal((await v.session("drop")).status, "abandoned");
  } finally {
    db.close();
  }
});
test("returning caller must verify and opt into update", async () => {
  const db = database(),
    v = new VoiceService(db);
  try {
    const p = await v.patients.create(jane);
    const lookup = await v.lookup("return", {
      phone_number: jane.phone_number,
    });
    assert.equal(lookup.verification_required, true);
    await assert.rejects(
      v.prepare("return", {
        patient: jane,
        patient_id: p.patient_id,
        optional_fields_offered: true,
        update_requested: true,
      }),
    );
    const verified = await v.lookup("return", {
      phone_number: jane.phone_number,
      date_of_birth: jane.date_of_birth,
    });
    assert.equal(verified.verified, true);
    await assert.rejects(
      v.prepare("return", {
        patient: jane,
        patient_id: p.patient_id,
        optional_fields_offered: true,
      }),
    );
    const draft = await v.prepare("return", {
      patient: { ...jane, city: "Cambridge" },
      patient_id: p.patient_id,
      optional_fields_offered: true,
      update_requested: true,
    });
    await v.commit("return", {
      confirmation_token: draft.confirmation_token,
      caller_confirmed: true,
    });
    assert.equal((await v.patients.get(p.patient_id)).city, "Cambridge");
    assert.equal((await v.patients.list()).length, 1);
  } finally {
    db.close();
  }
});
test("tool errors return HTTP 200 correlated results; unknown and malformed tools are handled", async () => {
  const h = harness();
  try {
    const r = await h.request(
      "/webhooks/vapi",
      "POST",
      {
        message: {
          type: "tool-calls",
          call: { id: "call-errors" },
          toolCallList: [
            {
              id: "t1",
              function: {
                name: "prepare_registration",
                arguments: {
                  patient: { ...jane, phone_number: "123" },
                  optional_fields_offered: true,
                },
              },
            },
            { id: "t2", name: "not_a_tool", arguments: {} },
          ],
        },
      },
      { authorization: "Bearer " + secret },
    );
    assert.equal(r.status, 200);
    const body = (await r.json()) as any;
    assert.deepEqual(
      body.results.map((x: any) => x.toolCallId),
      ["t1", "t2"],
    );
    assert.equal(JSON.parse(body.results[0].result).error.status, 422);
    assert.equal(JSON.parse(body.results[1].result).error.code, "UNKNOWN_TOOL");
  } finally {
    h.db.close();
  }
});
test("database failure rolls back patient and call link, leaves draft retryable", async () => {
  const db = database(),
    v = new VoiceService(db);
  try {
    const d = await v.prepare("fail", {
      patient: jane,
      optional_fields_offered: true,
    });
    db.sqlite.exec(
      "CREATE TRIGGER fail_write BEFORE INSERT ON patients BEGIN SELECT RAISE(ABORT,'simulated failure'); END",
    );
    await assert.rejects(
      v.commit("fail", {
        confirmation_token: d.confirmation_token,
        caller_confirmed: true,
      }),
    );
    assert.equal((await v.patients.list()).length, 0);
    assert.equal((await v.session("fail")).draft_token, d.confirmation_token);
    db.sqlite.exec("DROP TRIGGER fail_write");
    assert.equal(
      (
        await v.commit("fail", {
          confirmation_token: d.confirmation_token,
          caller_confirmed: true,
        })
      ).saved,
      true,
    );
  } finally {
    db.close();
  }
});
test("patient and confirmation survive a database close and reopen", async () => {
  const folder = mkdtempSync(join(tmpdir(), "carecloud-test-")),
    file = join(folder, "patients.sqlite");
  let db = database(file);
  try {
    let v = new VoiceService(db);
    const d = await v.prepare("restart", {
      patient: jane,
      optional_fields_offered: true,
    });
    const saved = await v.commit("restart", {
      confirmation_token: d.confirmation_token,
      caller_confirmed: true,
    });
    db.close();
    db = reopen(file);
    v = new VoiceService(db);
    assert.equal(
      (await v.patients.get(saved.patient.patient_id)).first_name,
      "Jane",
    );
    assert.equal(
      (
        await v.commit("restart", {
          confirmation_token: d.confirmation_token,
          caller_confirmed: true,
        })
      ).replayed,
      true,
    );
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
test("mock scheduling persists and retries do not double-book", async () => {
  const db = database(),
    v = new VoiceService(db);
  try {
    const d = await v.prepare("schedule", {
      patient: jane,
      optional_fields_offered: true,
    });
    await v.commit("schedule", {
      confirmation_token: d.confirmation_token,
      caller_confirmed: true,
    });
    const slot = (await v.slots()).slots[0];
    assert.ok(slot);
    await v.book("schedule", { slot, caller_confirmed: true });
    assert.equal(
      (await v.book("schedule", { slot, caller_confirmed: true })).replayed,
      true,
    );
    assert.equal(
      db.sqlite.prepare("SELECT count(*) AS n FROM appointments").get()?.n,
      1,
    );
  } finally {
    db.close();
  }
});
