# Reviewer demonstration script

## Product walkthrough (up to five minutes)

1. Open Dashboard. Explain that all counts are read from local SQLite records and observed performance stays blank until manually entered.
2. Open Source Library. Add or select a long-form source and show its ID and SHA-256 reference.
3. Open Generate Content. Select three platforms and run demo mode. State clearly that demo output is deterministic, not live AI.
4. Open Content Studio. Edit a hook, inspect source evidence, validation warnings, duplicate result, and rights checklist. Try approval before checks to demonstrate the block.
5. Open Content Calendar and Export Center. Assign a time to an eligible asset and download CSV. Explain that a scheduled asset is not published.

## Technical demonstration (up to eight minutes)

1. Start the app with `npm run dev`; open `http://127.0.0.1:5173`.
2. Generate once from a saved source; inspect run ID, runtime, provider label, and cost reporting.
3. Refresh using a new source to demonstrate source traceability and duplicate checks against saved assets.
4. Trigger a recoverable failure with an empty/too-short source; show the validation error and confirm prior assets remain saved.
5. Show `/api/health`, `/api/openapi.json`, and the CSV export.
6. For a real provider run, use a test key in a local `.env` outside version control; never show the key on screen. Provider connectivity and price were not verified in this workspace.
