# Screen Map

Mapping of Figma screens to data shown, actions performed, and API endpoints called.
Screens without existing endpoint coverage are flagged.

## Auth & Onboarding (34:113)

| Role | Screen Name | Data Shown | Actions Performed | Endpoints | Notes |
|---|---|---|---|---|---|
| All | Onboarding / Role Selection | Name, role (contractor/worker/client) | Select role, accept terms | POST /users (during onboarding) | Creates initial user record |
| All | Email/Password Setup | Email, password | Submit form | — | Auth not yet implemented; headers X-User-Id and X-Role used instead (H5) |

## Contractor Desktop (30:18)

| Role | Screen Name | Data Shown | Actions Performed | Endpoints | Notes |
|---|---|---|---|---|---|
| Contractor | Project Dashboard | Projects list, total budget, funded status, expenses, contractor comp, worker pool, paid/pending/remaining | Create project, invite workers, set allocations, document expenses, view money summary | POST /projects, GET /projects/{id}/money-summary **H2**, POST /projects/{id}/project-members, POST /expenses | — |
| Contractor | Task Management | Tasks list with status (assigned, accepted, in_progress, submitted, approved, rejected, cancelled), task assignments | Create tasks, update task status to "approved" (H1), assign workers, add attachments | POST /projects/{id}/tasks, PUT /tasks/{id} **H1**, POST /tasks/{id}/attachments | H1: sets status="approved" and client_confirmed=true |
| Contractor | Allocations | Worker allocation pool, individual shares (Amara 150, Chidi 100, etc.), acceptance status | Set initial allocations, request allocation changes (H4), view allocation changes | POST /allocations, POST /allocation-changes **H4**, GET /projects/{id}/allocations | — |
| Contractor | Payments | Payment history, paid amounts, pending payments, x402 settlement status | Initiate payments via payout agent, view payment receipts | GET /payments, POST /payments (agent), GET /receipts | Payout agent initiates after H1 |
| Contractor | Project Financials | Full financial breakdown: total_budget, funded, expenses, contractor_comp, worker_pool, paid, pending, remaining | View money summary **H2**, export financial data | GET /projects/{id}/money-summary **H2** | — |

## Worker Desktop (30:20)

| Role | Screen Name | Data Shown | Actions Performed | Endpoints | Notes |
|---|---|---|---|---|---|
| Worker | Task Board | Tasks assigned, status, descriptions, deliverables, submission deadlines | View tasks, submit work (submissions), report problems, view own payments | GET /projects/{id}/tasks, POST /tasks/{id}/submissions, GET /notifications | — |
| Worker | My Allocation | Own allocation amount, acceptance status, payment history | View own allocation, accept/reject allocation changes | GET /projects/{id}/allocations, POST /allocation-changes (respond to) | — |
| Worker | Payments Received | Own payment records, receipts, payment status, overall project payment progress | View own payments, download receipts | GET /projects/{id}/payments, GET /receipts | Worker sees own payments + overall progress |
| Worker | Profile | Stellar address, trustline status, name, role | Update Stellar address, view trustline_ok | GET /users/{id}, — | H6: users.stellar_address and users.trustline_ok |

## Client Desktop (30:22)

| Role | Screen Name | Data Shown | Actions Performed | Endpoints | Notes |
|---|---|---|---|---|---|
| Client | Project Overview | Full financial breakdown, funded status, expenses, contractor compensation, worker allocations, paid/pending/remaining | Fund project, view money summary **H2**, confirm deliverables, approve budget changes | POST /funding, GET /projects/{id}/money-summary **H2**, PUT /projects/{id}, GET /projects/{id}/contractor-compensation | — |
| Client | Task & Deliverable Review | Tasks list, deliverables, client_confirmed status, approval needed | Review task work, confirm client_confirmed on tasks, approve allocation changes **H4** | PUT /tasks/{id} **H1**, POST /allocation-changes **H4** (respond), GET /submissions/{id}/reviews | H1: client confirmation triggers payout agent |
| Client | Worker Allocations | All workers' allocations and acceptance status | View allocations, approve/reject allocation change requests | GET /projects/{id}/allocations, GET /allocation-changes/{id} | — |
| Client | Payments & Receipts | Payment history, receipts, overall payment progress | View payments, confirm designated deliverables | GET /projects/{id}/payments, GET /receipts | — |
| Client | WhatsApp Log | WhatsApp message history, message types, delivery status | Send WhatsApp messages (notification only) | POST /whatsapp | — |

## Mobile Screens (30:19, 30:21, 30:23)

| Role | Screen Name | Data Shown | Actions Performed | Endpoints | Notes |
|---|---|---|---|---|---|
| All (mobile) | Compact Project View | Summary budget, expenses, worker pool, paid/pending | Quick view of financial status | GET /projects/{id}/money-summary **H2** | Confirms desktop data parity |
| Worker (mobile) | Task Submissions | Submit work photos/files, report problems | Submit task work, add problem report | POST /tasks/{id}/submissions, — | — |

## WhatsApp Experience (30:24)

| Role | Screen Name | Data Shown | Actions Performed | Endpoints | Notes |
|---|---|---|---|---|---|
| All | WhatsApp Message Log | Message history, types (payment_reminder, approval, notification, system) | Send WhatsApp messages (notification only) | POST /whatsapp | **Critical**: WhatsApp message alone never authorizes a financial action |

### Screens Needing Data Not Yet in This Contract

The following Figma screens reference data that this API contract does not yet fully provide:

1. **30:20 Worker Desktop — "My Allocation" acceptance flow**: Requires POST /allocation-changes response format with worker_accepted and client_approved fields — covered in API contract.
2. **30:22 Client Desktop — "Confirm designated deliverables"**: Requires PUT /tasks/{id} with client_confirmed=true — handoff H1 covers this.
3. **30:18 Contractor Desktop — "Set worker allocations"**: Requires POST /allocations with amount from worker pool — covered in API contract.

All screens can be mapped to endpoints defined in this contract. No screen requires data absent from the contract.