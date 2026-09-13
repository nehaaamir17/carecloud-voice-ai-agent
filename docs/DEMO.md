# Reviewer walkthrough (use fictional details)

1. Open the dashboard. Unlock with the reviewer key supplied privately.
2. Call the configured US number, or select **Call free in browser** on the dashboard and allow microphone access. Say: “My name is Jane Doe. I was born March 15, 1990, and my phone number is 202-555-0142.”
3. Provide sex Female and address “123 Example Street, Boston, Massachusetts, 02108.” Decline optional information if desired.
4. During read-back say: “Actually, my last name is Davis, spelled D-A-V-I-S.” The agent should issue a new full read-back and wait.
5. Confirm. The agent must announce success only after persistence returns. Decline a demo appointment to end the call.
6. Refresh the dashboard. Open Jane Davis and inspect every field. View the linked call transcript after the provider sends its end-of-call report.
7. Call again with the same phone and date of birth. Accept the update invitation. Change the city to Cambridge and confirm. Verify the same patient UUID was updated.
8. Try a future birth date or “123” as the phone number. The agent must ask for that specific field again.
9. Start another call, provide details, then say “start over.” Confirm that the old draft is discarded.
10. Drop a call before confirmation. A call log may remain, but no patient should be created.
11. For Spanish, say “Hablo español” and follow the same flow. Check pronunciation, date ambiguity, and read-back in Spanish.
12. Optionally accept a mock appointment, confirm a specific UTC slot, and inspect it in Demo bookings. It is not a real clinical appointment.

## Interview explanation

- Why Vapi? It supplies phone transport, streaming speech recognition, synthesis, and interruption handling; engineering effort goes into the conversation/service boundary.
- Why D1/SQLite? Durable relational constraints with no TCP connection pool or additional database account; a single deployment serves the UI and API.
- Why two tools for saving? Validation produces an immutable, call-scoped draft. Confirmation uses its token rather than accepting a second, potentially different payload. A transaction commits the patient and call association together.
- What prevents duplicates? Confirm retries reuse the token. The saved call/token returns the same patient. Returning-caller identity lookup is a separate feature; phone numbers are not globally unique because families can share them.
- What does the server not prove? It cannot independently prove the caller heard every field and said yes. The LLM's conversation and consent assertion must be evaluated through real call transcripts/audio.
- What would change for production? Strong identity verification, access roles, data minimization and retention, managed secrets, audit trails, consent policies, backups, automated provider evaluations, and healthcare compliance work.
