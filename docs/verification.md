# Verification record

Original baseline checked on 22 October 2026; verification and demo updates added through 23 October 2026.

| Check | Result |
|---|---|
| Automated test suite | 10 passed, 0 failed. `npm test` |
| Production frontend build | Passed. `npm run build` (Vite config runner). Bundle-size advisory remains for the 688 kB JavaScript chunk. |
| Browser smoke check | Chrome Headless rendered the dashboard UI and data after the Cloudflare same-origin fix. |
| Local health | `GET http://127.0.0.1:8000/api/health` returned 200; Firebase reported connected. |
| Public tunnel health | `GET https://compatibility-pmid-hold-exists.trycloudflare.com`. Public homepage, `/api/health`, and `/api/openapi.json` each returned HTTP 200 on 23 October 2026. Temporary Quick Tunnel to an isolated demo SQLite database; Firebase disabled. Public, unauthenticated, and available only while this machine and tunnel remain running. |
| New-source engine run | Demo provider returned HTTP 201 and generated 10 assets from a new sample source. |
| Calendar completeness | 30 rows; 30 UTMs; 30 proposed slots; all referenced media paths exist. |
| Media package | 14 WebM videos; 44 SVG media files (seven five-slide carousels, two standalone graphics, seven post cards); 30 editable Markdown sources. |
| Workbook structure | `assessment_workbook.xlsx` contains 8 sheets; all XML parts parse successfully. |
| Repository publication | Project pushed to the provided GitHub `main` branch. `.env`, Firebase admin credentials, and local SQLite files are ignored and excluded. |
| Local package recheck (23 October 2026) | 30/30 calendar rows contain all 12 required planning/content fields; every referenced final-media and editable-source path exists; all 30 rows have proposed slots across LinkedIn, Instagram, and YouTube Shorts. This is a file-integrity check, not owner approval, platform preview, live scheduling, or the evaluator's random quality audit. |
| Automated tests and production build (23 October 2026) | `npm.cmd test`: 10 passed, 0 failed. `npm.cmd run build`: passed; Vite emitted the documented large-chunk advisory (687.78 kB minified JavaScript). In this PowerShell environment `npm` was blocked by execution policy, so use `npm.cmd` as shown in README. |

The short videos are silent text-on-screen animations, not product walkthrough recordings. No social posts were published and no audience-test participants were recruited.
