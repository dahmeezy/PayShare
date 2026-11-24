# PayShare MVP status

Last audited against `release/mvp-final` (branched from `main` at f726056). Statuses are **Done / Partial / Missing / Broken**.
Evidence is a file, endpoint or test. Items marked "not visually verified" were judged from code, not a screenshot.

Baseline run on `main`: 26 backend tests pass, 4 navigation tests pass, the server boots. The Playwright browser test (`frontend/test/mvp.cjs`) needs Playwright and was not part of the baseline.

**Payments are demo mode unless a funded testnet payer is configured.** `preview` projects settle with "Simulated · No funds moved". A live Stellar testnet settlement has not been run in this audit (no keys or funded accounts).

Legend for "Owner": A = users/projects/tasks/reviews/notifications side, B = money side. Both are fixable today.

## Shared and foundation
| Item | State | Evidence | Needed |
|---|---|---|---|
| Design tokens (light and dark) | Partial | `frontend/ui/tokens.css` has generic tokens and a `.dark` class, but not the spec token set (bg/canvas, bg/brand `#0F7F6C`, text/brand, etc.) | Add spec tokens, light and dark |
| Fonts Inter and JetBrains Mono | Done | `frontend/prototype/fonts/*.woff2` | none |
| Base styles, shared components, showcase | Done | `frontend/ui/base.css`, `components/*`, `ui/showcase.html` | token alignment |
| Sign up, log in | Done | `POST /api/register`, `/api/login`, `test/auth.test.mjs` | none |
| Forgot password, verify account | Partial | Routes exist but need an email/WhatsApp provider; UI labels them unavailable (`live-details.mjs:334`) | Keep honest labels; document |
| Landing page | Done | `frontend/index.html`, `review/landing.webp` | not visually verified |
| Role-based access on server | Done | `membership()`/`projectFor()` in `workspace-api.mjs`; scoped by role in `publicProject` | none |
| Role-based navigation | Partial | `frontend/prototype/navigation.mjs` + test | not visually verified |
| Onboarding (role, profile, notifications, checklist) | Partial | Role set at register, profile edit (`PUT /api/profile`); notification permission and checklist are static screens | Wire to real state |

## Project and money
| Item | State | Evidence | Needed |
|---|---|---|---|
| Projects: create, list | Done | `POST/GET /api/workspace/projects` | none |
| Project overview, members | Done | `publicProject` returns members, totals | none |
| Activity history | Missing | No activity log in the workspace store | Add |
| Project settings | Missing | Only budget/compensation PUT | Add (rename, status) |
| Worker invitations (secure links) | Done | `/projects/:id/invitations`, hashed tokens in `invitations.mjs` | WhatsApp delivery not wired |
| Worker profile with Stellar address | Done | `PUT /api/profile`, `stellar_address` | none |
| Budget, expenses, comp, allocations | Partial | `PUT /budget`, `POST /expenses`, `budgetBreakdown` | Budget is only checked as "not over"; the exact-balance rule is not enforced or exposed |
| Client funding and status | Done | `POST /funding`, testnet verification in `funding.mjs` | none |
| Privacy by role (hidden, not blurred) | Partial | Workers get only their tasks and no compensation (`publicProject`) | Workers also need project totals and overall progress; leak-check test needed |

## Work flow
| Item | State | Evidence | Needed |
|---|---|---|---|
| Tasks: create, assign, criteria, deadline, flags | Partial | `POST /tasks` takes title, description, allocation, clientApprovalRequired | Add acceptance criteria, deadline, deliverables, reassignable flag |
| Worker acceptance of terms before work | Missing | Submission allowed straight from `assigned` | Add accept step |
| Attachments, voice notes | Missing | UI says unavailable (`live-details.mjs:189`) | Links only for MVP; files/voice documented as missing |
| Submission, versions, review | Partial | `/submission`, `/review` (single latest submission, no versions, rejection has notes) | Keep version history |
| Client confirmation (designated) | Done | `/confirm`, `clientApprovalRequired` | none |

## Changes and problems
| Item | State | Evidence | Needed |
|---|---|---|---|
| Allocation change flow | Missing | UI: "Allocation changes are unavailable." (`live.mjs:320`) | Add |
| Incomplete task flow | Missing | none | Add |

## Payments
| Item | State | Evidence | Needed |
|---|---|---|---|
| Payout validation (allocation, funds, approvals, duplicate prevention) | Done | `payout-agent.mjs payoutTerms`, state machine in `workspace-store.mjs` | none |
| Payment authorization with contractor PIN | Missing | Authorization is the signed-in contractor session only | Add PIN |
| x402 settlement on Stellar testnet | Partial | `stellar-settlement.mjs`, tested against a local facilitator and test ledger; no live testnet payment submitted | Needs funded payer, facilitator key; cannot be run without credentials |
| Receipts, tx reference, status, failed handling | Partial | payout object, reconcile endpoint | Receipt endpoint |
| Transactions list and detail, agent log | Partial | Payment history screen; no plain-language agent log | Add agent log |

## Communication and finish
| Item | State | Evidence | Needed |
|---|---|---|---|
| In-app notifications, bell, unread | Missing | UI: "Notification delivery is unavailable." (`live.mjs:401`) | Add |
| WhatsApp | Missing | Screens only; no delivery | Link-based messages are not sent (documented) |
| Dashboards (three roles) | Done | `live-dashboard.mjs`, `review/live-*.webp` | not visually verified |
| Responsive 360–2560 | Done | Full-width layout, phone tab bar; `frontend/test/mvp.cjs` checks 360–1920 px | none |
| Dark theme, theme switch, Settings | Partial | Theme toggle exists in `app.mjs`; Settings screens exist but text size/language are inert | Document |
| Empty, loading, error states | Partial | `aria-busy` on actions, empty states in live layer | Spot-check |

## Deployment
| Item | State | Evidence | Needed |
|---|---|---|---|
| Health endpoint | Done | `GET /healthz`, `backend/test/health.test.mjs` | none |
| Dockerfile / platform config | Done | `railway.json` (Railway, auto-deploy from main), `render.yaml` | none |
| Seed script for sample project | Missing | none | Add |
| `.env.example` | Partial | `backend/.env.example` is the workshop one with secrets as empty names | Add app-focused example |
| Deployment guide | Done | README → Deployment (Railway) | none |
| CI | Done | `.github/workflows/ci.yml` | none |

## Branch log
(see bottom, updated after each merge)
