# Permission Matrix

Table of every endpoint and data item against the three human roles.
Field-level notes where a response differs by role.

| Endpoint / Data Item | Contractor | Worker | Client |
|---|---|---|---|
| **GET /users** | Full user list (own + others) | Own record only (id, name, role) | Full user list |
| **GET /users/{id}** | Full user object | Own record only | Full user object |
| **POST /projects** | Create project (required) | Not authorized | Not authorized |
| **GET /projects** | All projects (summary) | Own project's summary | All projects (summary) |
| **GET /projects/{id}** | Full project object | Summary: no contractor_comp | Full project object |
| **PUT /projects/{id}** | Update budget/compensation | Not authorized | Update budget/compensation |
| **GET /projects/{id}/project-members** | All members | Not authorized | All members |
| **POST /projects/{id}/project-members** | Send invitations | Not authorized | Not authorized |
| **GET /projects/{id}/tasks** | All tasks | Own tasks + summary | All tasks |
| **POST /projects/{id}/tasks** | Create task (required) | Not authorized | Not authorized |
| **PUT /tasks/{id}** **H1** | Set status=approved, client_confirmed=true | Not authorized | Not authorized |
| **GET /tasks/{id}/attachments** | All attachments | Own task's attachments | All attachments |
| **GET /tasks/{id}/submissions** | All submissions | Own submissions only | All submissions |
| **POST /tasks/{id}/submissions** | Not authorized | Submit work (required) | Not authorized |
| **GET /submissions/{id}** | Full submission | Own submission | Full submission |
| **PUT /submissions/{id}** | Accept/reject submission | Not authorized | Accept/reject submission |
| **GET /submissions/{id}/reviews** | All reviews | Not authorized | All reviews |
| **POST /submissions/{id}/reviews** | Add review (required) | Not authorized | Add review |
| **GET /tasks/{id}/incomplete-reports** | All reports | Not authorized | All reports |
| **GET /notifications** | All notifications | Own notifications only | All notifications |
| **GET /activity-log** | Full audit trail | Own actions only | Full audit trail |
| **POST /funding** | Not authorized | Not authorized | Fund project (required) |
| **GET /projects/{id}/funding** | Full funding record | Amount only (no source) | Full funding record |
| **GET /projects/{id}/expenses** | All expenses | Own expenses or summary total | All expenses |
| **POST /expenses** | Document expense (required) | Not authorized | Not authorized |
| **GET /projects/{id}/contractor-compensation** | Amount (required) | **null** (never shown) | Amount (required) |
| **GET /projects/{id}/allocations** | All workers' allocations | Own allocation only | All workers' allocations |
| **POST /allocations** | Set worker shares (required) | Not authorized | Not authorized |
| **POST /allocation-changes** **H4** | Request change (required) | Worker must accept any change | Request change (required) |
| **GET /allocation-changes/{id}** | Full change record | Not authorized | Full change record |
| **GET /payments** | All payments (full detail) | Own payments + overall progress | All payments (full detail) |
| **POST /payments** | Not authorized (payout agent only) | Not authorized | Not authorized (payout agent) |
| **GET /projects/{id}/payments** | All project payments | Own payments + paid/pending totals | All project payments |
| **GET /receipts** | All receipts | Own receipts only | All receipts |
| **GET /agent-log** | Full log | Not authorized | Full log |
| **POST /whatsapp** | Send message (required) | Not authorized | Send message (required) |
| **GET /projects/{id}/money-summary** | Full summary | Full summary (sees same fields) | Full summary |

### Data Item Field-Level Notes

| Data Item | Contractor | Worker | Client |
|---|---|---|---|
| **total_budget** | Visible | Visible | Visible |
| **funded** | Visible | Visible | Visible |
| **approved_expenses** | Visible | Visible (own or summary) | Visible |
| **contractor_compensation** | Visible | **null** — never shown | Visible |
| **worker_allocation_pool** | Visible | Visible | Visible |
| **Individual worker allocations** | See all workers' amounts | See **only own** amount | See all workers' amounts |
| **Payments made** | Full detail (amount, status, tx hash) | Own payments only + overall paid/total | Full detail |
| **Payments pending** | Full detail | Own pending + overall progress | Full detail |
| **Transaction history** | Project-level full history | **Own transactions only** | Project-level full history |
| **Expenses** | All expenses with details | Own expenses or project summary total | All expenses with details |
| **Task status** | All tasks full status | Own tasks full status | All tasks full status |
| **Allocations accepted** | All workers' acceptance status | Own acceptance status | All workers' acceptance status |

### Key Permission Rules (enforced in server responses)

- **contractor_compensation** is **null** for worker-facing responses — never contains another worker's allocation amount
- **Payments**: worker sees own payments + overall project paid/pending totals; contractor/client see all payment detail including tx hashes
- **Transaction history**: project-level for contractor and client; own transactions only for a worker
- **Individual worker allocations**: contractor and client see all; a worker sees only their own
- **WhatsApp message alone never authorizes a financial action** — no financial endpoint responds to WhatsApp-only triggers
- **Expenses** must be approved (`approved: true`) to reduce the budget — unapproved expenses are documented but do not affect summaries
### Implementation Notes (A04)

- **contractor_compensation**: Server-side filtering implemented in `role-constants.mjs::filterContractorCompensation`. Returns `null` for worker roles. Verified in RBAC tests.

- **Individual worker allocations**: Server-side filtering implemented in `role-constants.mjs::filterWorkerAllocations`. Contractor/client see all; worker sees only own allocation. Verified in RBAC tests.

- **Payments made and pending**: Server-side filtering implemented in `role-constants.mjs::filterPayments`. Contractor/client see full detail; worker sees own payments + overall progress. Verified in RBAC tests.

- **Transaction history**: Server-side filtering implemented in `role-constants.mjs::filterTransactionHistory`. Project-level for contractor/client; own transactions only for worker.

- **Individual worker allocations in project members**: Server-side filtering implemented in `role-constants.mjs::filterProjectMembers`. Shows "Full breakdown" for contractor/client; "Own allocation + totals" for worker.

- **Expenses**: Server-side filtering implemented in `role-constants.mjs::filterExpenses`. Contractor: all expenses; Worker: own expenses; Client: all expenses.

- **Route guards**: Implemented in `frontend/index.html` - users without proper role context are redirected to role selection screen.

- **Hidden data**: Absent from responses (not blurred or disabled). Implemented in `hidden-control.mjs::applyHiddenControl` and `role-constants.mjs::applyHiddenControl`.

- **Role context from session**: Frontend reads role from `localStorage.getItem('payshare_role')` and configures sidebar, top bar, and bottom navigation accordingly.

- **Rate limiting**: Applied on auth endpoints (login: 5/15min, forgot: 3/15min, verify: 5/15min) as implemented in `rate-limit.mjs`.
</ENDOFFILE
echo "Updated PERMISSIONS.md"

### Implementation Notes (A04)

- **contractor_compensation**: Server-side filtering implemented in `role-constants.mjs::filterContractorCompensation`. Returns `null` for worker roles. Verified in RBAC tests.

- **Individual worker allocations**: Server-side filtering implemented in `role-constants.mjs::filterWorkerAllocations`. Contractor/client see all; worker sees only own allocation. Verified in RBAC tests.

- **Payments made and pending**: Server-side filtering implemented in `role-constants.mjs::filterPayments`. Contractor/client see full detail; worker sees own payments + overall progress. Verified in RBAC tests.

- **Transaction history**: Server-side filtering implemented in `role-constants.mjs::filterTransactionHistory`. Project-level for contractor/client; own transactions only for worker.

- **Individual worker allocations in project members**: Server-side filtering implemented in `role-constants.mjs::filterProjectMembers`. Shows "Full breakdown" for contractor/client; "Own allocation + totals" for worker.

- **Expenses**: Server-side filtering implemented in `role-constants.mjs::filterExpenses`. Contractor: all expenses; Worker: own expenses; Client: all expenses.

- **Route guards**: Implemented in `frontend/index.html` - users without proper role context are redirected to role selection screen.

- **Hidden data**: Absent from responses (not blurred or disabled). Implemented in `hidden-control.mjs::applyHiddenControl` and `role-constants.mjs::applyHiddenControl`.

- **Role context from session**: Frontend reads role from `localStorage.getItem('payshare_role')` and configures sidebar, top bar, and bottom navigation accordingly.

- **Rate limiting**: Applied on auth endpoints (login: 5/15min, forgot: 3/15min, verify: 5/15min) as implemented in `rate-limit.mjs`.
