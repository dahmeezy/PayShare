# Connected dashboard visual review

Each comparison shows the original Figma frame, the connected app before the visual fix, and the restored connected app. Both browser captures use the same three signed-in accounts and the same project records saved through the API. The restored app was opened from `http://localhost:4021/`. The project contains simulated funding, a pending submission, an assigned task, and a simulated payout. The captions, counts, amounts and badges reflect those records.

| Role | Desktop · 1440 px | Mobile · 390 px |
| --- | --- | --- |
| Client | [D01 client comparison](live-client-desktop.webp) | [MD01 client comparison](live-client-mobile.webp) |
| Contractor | [C01 contractor comparison](live-contractor-desktop.webp) | [MC01 contractor comparison](live-contractor-mobile.webp) |
| Worker | [W01 worker comparison](live-worker-desktop.webp) | [MW01 worker comparison](live-worker-mobile.webp) |

The live screens retain the authored sidebars, icons, summary cards, and panels. Some panels have fewer rows than Figma because the backend supplied fewer records. Worker dashboards show the worker’s own financial amounts. Simulated amounts and payouts are labeled and have no blockchain receipt.

The connected browser test uses a temporary data store and runs the client, contractor and worker workflow through the same original screens. It checks all three dashboards at 360, 390, 768, 1024 and 1440 px.
