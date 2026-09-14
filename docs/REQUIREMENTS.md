# Assessment coverage

Source: all eight pages of the supplied Voice AI Agent Patient Registration System assessment. The confidential PDF is deliberately not committed to this repository.

| Requirement                                      | Implementation                                                                                        | Verification                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Real US inbound phone number                     | Vapi number `+1 (772) 256-9450`, permanent assistant, phone routing                                   | Provider resource/routing verified; live Vapi audio flow completed |
| Natural LLM conversation                         | GPT-4.1 via Vapi; Deepgram Nova 3; Vapi multilingual speech                                           | Live English registration and scheduling conversation completed    |
| Clarification, corrections, out-of-order answers | Prompt accepts multiple fields and spelling; server returns field errors                              | Validation and correction tests                                    |
| Full confirmation before save                    | Prepare/read-back/confirm sequence; token scoped to call and exact draft                              | Old token, missing consent, corrections and retry tests            |
| Invalid phone/date handling                      | Shared Zod validation and targeted tool error response                                                | Calendar, future date, short phone and other invalid input tests   |
| Graceful call completion                         | Saved-only success response, optional mock booking, endCall tool                                      | Live call ended cleanly with transcript and appointment persisted  |
| All 16 demographic fields                        | validation.ts and SQL schema; 9 required, 7 optional/defaulted                                        | Every field represented; required and optional validation tests    |
| UUID, UTC creation/update timestamps             | Service-owned fields; client attempts rejected                                                        | REST lifecycle tests                                               |
| Persistent relational database                   | Cloudflare D1; local persistent SQLite through Wrangler                                               | Reopen/restart test and live HTTP smoke test                       |
| Schema constraints                               | NOT NULL, CHECK, primary keys, foreign keys and indexes                                               | Tests execute generated SQL rather than a fake database            |
| Optional seed records                            | Not automatically seeded; synthetic reviewer script provided                                          | Optional requirement                                               |
| GET /patients and all 3 filters                  | Exact last name, DOB and normalized phone filters                                                     | Integration and smoke tests                                        |
| GET /patients/:id                                | UUID lookup, excludes deleted                                                                         | Integration tests                                                  |
| POST /patients                                   | Validated create with 201                                                                             | Integration tests                                                  |
| PUT /patients/:id                                | Partial update; preserves omitted fields                                                              | Integration tests                                                  |
| DELETE /patients/:id                             | Sets deleted_at, retains physical record                                                              | Integration tests inspect retained SQL row                         |
| JSON envelope and statuses                       | data/error contract, structured field errors                                                          | Integration tests                                                  |
| Voice/database service integration               | Voice and REST use PatientService                                                                     | Transactional save/rollback tests                                  |
| Failure feedback                                 | Correlated Vapi errors plus request-failed speech                                                     | Tool failure and database rollback tests; audio pending            |
| Environment secrets and input sanitization       | Separate bearer credentials, signed cookie, CSRF check, body limits, parameterized SQL, rate limiting | Auth/CSRF/schema tests                                             |
| Conversation observability                       | Linked transcript/summary, structured stdout; final payload enabled for synthetic demo                | Automated end-of-call test and live linked transcript              |
| Deployment accessible at review                  | Sites Worker and D1; protected patient API on public origin                                           | Live authenticated API/webhook smoke test passed                   |
| Documentation                                    | README, architecture, setup, env, trade-offs and limitations                                          | Included                                                           |
| Returning-caller bonus                           | Phone + birth date lookup, explicit update permission                                                 | Returning-caller tests                                             |
| Scheduling bonus                                 | Persistent mock availability and unique slot booking                                                  | Booking/idempotency test                                           |
| Spanish bonus                                    | Multilingual STT/TTS and language-aware prompt                                                        | Configuration present; real Spanish audio pending                  |
| Transcript bonus                                 | End-of-call webhook linked to patient                                                                 | Integration test and dashboard                                     |
| Dashboard bonus                                  | Patient table/search/details, call history, transcripts, demo bookings, themes and aggregate charts   | Responsive mobile QA, theme persistence and production build       |
| Tests bonus                                      | Node test runner, real SQLite and production handler                                                  | Automated test suite                                               |

## Evaluation dimensions

Each core dimension carries 20%. The US number and assistant routing are provisioned, and a live Vapi audio conversation completed registration and mock appointment booking. Architecture, validation, state transitions, persistence and errors are also verified automatically. Correction, restart, returning-caller update and Spanish behavior are implemented and tested at the service layer; the reviewer script identifies them as the remaining useful live demonstrations.

The PDF's three-hour deadline and preference for a small working system take precedence over speculative additions. No HIPAA compliance, clinical scheduling, or real patient-data suitability is claimed.
