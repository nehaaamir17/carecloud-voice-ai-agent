import Link from "next/link";
const example = JSON.stringify(
  {
    first_name: "Jane",
    last_name: "Doe",
    date_of_birth: "03/15/1990",
    sex: "Female",
    phone_number: "2025550142",
    address_line_1: "123 Example Street",
    city: "Boston",
    state: "MA",
    zip_code: "02108",
  },
  null,
  2,
);
export default function Docs() {
  return (
    <main className="docs content">
      <div className="docs-topline">
        <div className="docs-brand">
          <img
            src="/carecloud-logo.png"
            alt="CareCloud"
            width="38"
            height="38"
          />
          <span>CareCloud Developer Platform</span>
        </div>
        <Link className="text-link" href="/">
          ← Back to dashboard
        </Link>
      </div>
      <div className="eyebrow">DEVELOPER REFERENCE</div>
      <h1>Patient registration API</h1>
      <p>
        Use the site origin as your API base URL. All patient and history
        endpoints require the reviewer key in{" "}
        <code>Authorization: Bearer YOUR_KEY</code>. Only fictional patient data
        should be used.
      </p>
      <div className="docs-links">
        <a className="primary" href="/openapi.json" download>
          Download OpenAPI 3.1
        </a>
        <a className="secondary" href="/postman.json" download>
          Download Postman collection
        </a>
      </div>
      <h2>Endpoints</h2>
      <div className="endpoint-list">
        {[
          [
            "GET",
            "/patients",
            "List patients; optional exact filters: last_name, date_of_birth (MM/DD/YYYY), phone_number. Optional limit and offset.",
          ],
          ["GET", "/patients/:id", "Read a single patient by UUID."],
          [
            "POST",
            "/patients",
            "Create a validated patient. Returns 201 with the created record.",
          ],
          [
            "PUT",
            "/patients/:id",
            "Partially update a patient; omitted fields are preserved. Optional fields may be cleared with null.",
          ],
          [
            "DELETE",
            "/patients/:id",
            "Soft-delete a patient. Sets deleted_at; retains the database record.",
          ],
          [
            "GET",
            "/health",
            "Public database health and phone configuration status.",
          ],
          [
            "GET",
            "/api/calls",
            "Latest 100 calls and transcripts. Filter by patient_id.",
          ],
          ["GET", "/api/appointments", "Latest mock appointment records."],
          [
            "POST",
            "/webhooks/vapi",
            "Voice tool calls and end-of-call events; requires the separate Vapi webhook credential.",
          ],
        ].map(([method, path, desc]) => (
          <div key={method + path}>
            <code className="method">{method}</code>
            <code>{path}</code>
            <p>{desc}</p>
          </div>
        ))}
      </div>
      <h2>Create a patient</h2>
      <pre>{example}</pre>
      <h2>Response contract</h2>
      <pre>
        {'{ "data": { "patient_id": "UUID", "...": "..." }, "error": null }'}
      </pre>
      <p>
        Errors return <code>data: null</code> and an error object containing{" "}
        <code>code</code>, <code>message</code>, and a request ID. Validation
        errors include a <code>fields</code> array. Status codes: 200, 201, 400,
        401, 403, 404, 405, 409, 413, 422, 429, 500, 503.
      </p>
      <h2>Voice write contract</h2>
      <ol>
        <li>Collect required fields and offer optional information.</li>
        <li>
          <code>prepare_registration</code> validates and stores a temporary
          call draft.
        </li>
        <li>
          Read all returned fields to the caller and wait for explicit
          confirmation.
        </li>
        <li>
          <code>confirm_registration</code> saves that exact draft atomically.
          Retry with the same token after a transient failure.
        </li>
      </ol>
      <p>
        Corrections issue a new token. Starting over invalidates the old draft.
        Dropping a call never saves an unconfirmed registration. A returning
        caller can update a verified existing record.
      </p>
    </main>
  );
}
