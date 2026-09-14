# Live voice test evidence

Live verification was completed on September 14, 2026 using fictional/demo data.

## Observed end-to-end result

- The Vapi audio conversation reached the configured assistant.
- The agent collected and confirmed the registration before saving.
- The deployed API persisted one active patient record in D1.
- The completed call was linked to that patient.
- Vapi's end-of-call webhook stored a 4,599-character transcript.
- The optional mock first-visit appointment was persisted and displayed under **Conversation history → Demo bookings**.
- The call ended through the assistant's normal completion path.
- The public health endpoint reported the database, phone agent, and browser agent as configured.

The test also produced an intentionally incomplete call. It was retained as an abandoned call with a transcript and was not associated with a patient, demonstrating that a disconnected, unconfirmed intake does not create a patient record.

## Automated coverage supporting the live test

The 16-test integration suite exercises the production HTTP handler and real SQLite schema. It covers correction-token invalidation, start-over behavior, dropped calls, returning-patient updates, safe confirmation retries, database rollback, persistence after reopening the database, appointment idempotency, authentication, validation, and rate limiting.

## Remaining useful live demonstrations

The following paths are implemented but were not present in the completed-call transcript used for this evidence:

- Correct a spelled name during the final read-back.
- Say **start over** before confirmation.
- Call again with the same phone number and date of birth, then update one field.
- Say **Hablo español** and complete a short Spanish intake.

These scenarios are documented in [DEMO.md](DEMO.md) and can be demonstrated without changing the deployed system.
