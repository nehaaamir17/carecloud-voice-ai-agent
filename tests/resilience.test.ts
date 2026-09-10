import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./database";
import { VoiceService } from "../lib/voice";
import { handleRequest } from "../lib/http";
const patient = {
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
test("concurrent record deletion invalidates voice update without committing the call", async () => {
  const db = database(),
    v = new VoiceService(db);
  try {
    const p = await v.patients.create(patient);
    await v.lookup("delete-race", {
      phone_number: p.phone_number,
      date_of_birth: p.date_of_birth,
    });
    const draft = await v.prepare("delete-race", {
      patient,
      patient_id: p.patient_id,
      update_requested: true,
      optional_fields_offered: true,
    });
    await v.patients.remove(p.patient_id);
    await assert.rejects(
      v.commit("delete-race", {
        confirmation_token: draft.confirmation_token,
        caller_confirmed: true,
      }),
    );
    assert.equal((await v.session("delete-race")).patient_id, null);
    assert.equal(
      (await v.session("delete-race")).draft_token,
      draft.confirmation_token,
    );
  } finally {
    db.close();
  }
});
test("concurrent modification is not overwritten by an older voice draft", async () => {
  const db = database(),
    v = new VoiceService(db);
  try {
    const p = await v.patients.create(patient);
    await v.lookup("modify-race", {
      phone_number: p.phone_number,
      date_of_birth: p.date_of_birth,
    });
    const draft = await v.prepare("modify-race", {
      patient,
      patient_id: p.patient_id,
      update_requested: true,
      optional_fields_offered: true,
    });
    db.sqlite
      .prepare(
        "UPDATE patients SET city = 'Cambridge', updated_at = '2999-01-01T00:00:00.000Z' WHERE patient_id = ?",
      )
      .run(p.patient_id);
    await assert.rejects(
      v.commit("modify-race", {
        confirmation_token: draft.confirmation_token,
        caller_confirmed: true,
      }),
      /record changed/i,
    );
    assert.equal((await v.patients.get(p.patient_id)).city, "Cambridge");
    assert.equal((await v.session("modify-race")).patient_id, null);
  } finally {
    db.close();
  }
});
test("SQL constraints reject invalid records even when bypassing HTTP", () => {
  const db = database();
  try {
    assert.throws(
      () =>
        db.sqlite.exec(
          "INSERT INTO patients(patient_id,first_name,last_name,date_of_birth,sex,phone_number,address_line_1,city,state,zip_code,created_at,updated_at) VALUES('12345678-1234-1234-1234-123456789012','Jane','Doe','2020-02-30','Female','2025550142','123 Example','Boston','MA','02108','now','now')",
        ),
      /CHECK/,
    );
  } finally {
    db.close();
  }
});
test("request body limit and login rate limit fail explicitly", async () => {
  const db = database(),
    env = {
      DB: db,
      ADMIN_API_KEY: "a".repeat(40),
      VAPI_WEBHOOK_SECRET: "b".repeat(40),
    };
  try {
    const req = (body: string) =>
      new Request("https://carecloud.test/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    assert.equal(
      (await handleRequest(req("x".repeat(70000)), env)).status,
      413,
    );
    for (let i = 0; i < 9; i++)
      assert.equal(
        (await handleRequest(req(JSON.stringify({ key: "wrong" })), env))
          .status,
        401,
      );
    assert.equal(
      (await handleRequest(req(JSON.stringify({ key: "wrong" })), env)).status,
      429,
    );
  } finally {
    db.close();
  }
});
