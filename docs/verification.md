# Verification record

Checked on 22 October 2026.

| Check | Result |
|---|---|
| Automated test suite | 10 passed, 0 failed. `npm test` |
| Production frontend build | Passed. `npm run build` (Vite config runner). Bundle-size advisory remains for the 688 kB JavaScript chunk. |
| Browser smoke check | Chrome Headless rendered the dashboard UI and data after the Cloudflare same-origin fix. |
| Local health | `GET http://127.0.0.1:8000/api/health` returned 200; Firebase reported connected. |
| Public tunnel health | `GET https://birmingham-reward-dublin-know.trycloudflare.com/api/health` returned 200. This Quick Tunnel URL is temporary. |
| New-source engine run | Demo provider returned HTTP 201 and generated 10 assets from a new sample source. |
| Calendar completeness | 30 rows; 30 UTMs; 30 proposed slots; all referenced media paths exist. |
| Media package | 14 WebM videos; 44 SVG media files (seven five-slide carousels, two standalone graphics, seven post cards); 30 editable Markdown sources. |
| Workbook structure | `assessment_workbook.xlsx` contains 8 sheets; all XML parts parse successfully. |

The short videos are silent text-on-screen animations, not product walkthrough recordings. No social posts were published and no audience-test participants were recruited.
