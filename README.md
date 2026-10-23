# IncuBrix Content Engine

A small workspace for turning long-form material into social content drafts, reviewing them, planning a calendar, and exporting the work.

## Open the demo

[Open the live demo](https://compatibility-pmid-hold-exists.trycloudflare.com) — no login required.

This is a temporary Cloudflare Quick Tunnel to an isolated demo database, with Firebase disabled. It works only while this computer and tunnel are running, and its URL can change after a restart. Anyone with the link can use the demo, so do not enter private information. This is a public demo, not a permanent production deployment.

## Always-on hosted deployment

The project includes a Render Blueprint for a **public free demo** deployment. See [the deployment guide](docs/deployment.md). Anyone with the URL can use and modify its demo data. Render free services may sleep, and temporary SQLite data can be lost on restart or redeploy; do not save private or important data. A paid service with persistent storage is needed for reliable availability and retained data; the Blueprint does not create a service automatically.

## Run on your computer

You need Node.js 22.5+ and npm. In PowerShell, from this folder:

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Stop with Ctrl+C. The app uses demo generation by default; no AI key is needed.

Run the checks with:

```powershell
npm.cmd test
npm.cmd run build
```

## Use the app

1. Add a source in **Source Library**.
2. Generate drafts, then review and edit them in **Content Studio**.
3. Schedule approved drafts in **Content Calendar**.
4. Record actual results in **Analytics** and download files in **Export Center**.

The app saves data in local SQLite. Firestore backup is optional and uses a Firebase service-account file configured on the server; never commit that file or share its contents.

## Content pack

`content/final_assets/` contains 30 media packages: 14 silent 9:16 WebM motion videos with captions, seven five-panel SVG carousels, two static SVG graphics, and seven SVG post cards. `content/assets/` has the editable copy sources. The media is original text/vector artwork; the videos are not product footage or voice narration. The calendar includes proposed Singapore-time slots, not posts already scheduled on social accounts.

Regenerate the pack with `node scripts/prepare_assessment.mjs` on Windows with Chrome or Edge installed. Rebuild the workbook after the calendar changes with `node scripts/build_workbook.mjs`.

## Assessment handoff

Download the curated handoff archive: [`output/IncuBrix_Submission_Package.zip`](output/IncuBrix_Submission_Package.zip). It includes the app source, documentation, workbook, calendar, and final assets; it excludes local credentials, Firebase admin keys, and local database files.

| Item | Current status | File or location |
|---|---|---|
| Product observations (5) | Five public-site observations recorded; direct product use still needs verification | [Product research](docs/product_research.md) |
| Social opportunities (3) | Three evidence-informed hypotheses documented; results not tested | [Product research](docs/product_research.md) |
| Account audit | Official handles and five dated peer LinkedIn counts recorded; per-post metrics are incomplete | [Account audit](docs/account_audit.md) |
| Strategy and launch kit | Drafts ready for human review | [Strategy](docs/strategy.md), [launch kit](docs/launch_kit.md) |
| 30 content assets, including videos and carousels | 30 packages with final media, captions, UTMs, editable sources, and proposed slots; owner approval and platform scheduling remain | [Final media](content/final_assets/), [editable sources](content/assets/), [asset checklist](docs/asset_quality_checklist.md) |
| Content engine | Implemented; demo mode works | This application |
| Real-audience test | Not run; no results recorded | [Test plan](docs/audience_test.md) |
| Workbook | Project workbook created; real-world inputs remain pending and the official Excel template was not supplied | [Open workbook](assessment_workbook.xlsx) |
| `calendar.csv` | 30-row calendar with UTMs, proposed slots, and media/source paths; live export is in **Export Center** | [Calendar CSV](content/calendar.csv) |
| README | Included | This file |
| Repository access | Project pushed to the provided GitHub repository; confirm visibility and grant reviewer access | [IncuBrix Content Engine on GitHub](https://github.com/Anbuchandiran-Official/IncuBrix-Content-Engine) |
| Two reviewer video links | Not recorded or uploaded | Use [demo script](docs/demo_script.md) |

See the [verification record](docs/verification.md) for test results and the [assessment gap report](docs/assessment_gap_report.md) for remaining work. Do not present public-site research as direct product use or fill test results with estimates.

For the shortest actionable list of owner inputs needed to finish the assessment, see [Owner TODO](docs/owner_todo.md).

## More

- API status: `/api/health`
- API schema: `/api/openapi.json`
- Strategy, evidence, asset checklist, and research templates: [`docs/`](docs/)
