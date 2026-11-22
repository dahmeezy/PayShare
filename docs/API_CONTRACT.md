# API Contract

Endpoints grouped by owner. REST conventions, JSON request/response. Handoff points marked H1–H6.

## Owner A Endpoints

### GET /users
- **May call**: contractor, client (worker sees own record only)
- **Request**: none (query params optional: ?role=..., ?project_id=...)
- **Response**:
  ```json
  [
    {
      "id": "user_123",
      "name": "Tola Adeyemi",
      "role": "contractor",
      "stellar_address": "GA...",
      "trustline_ok": true
    }
  ]
  ```
- **Error**: 401 unauthenticated, 403 forbidden

### GET /users/{id}
- **May call**: project owner (contractor/client)
- **Request**: none
- **Response**: user object (full fields)
- **Error**: 404 not found

### POST /projects
- **May call**: contractor
- **Request**:
  ```json
  {
    "name": "Lagos Wedding Decoration",
    "total_budget": 100000, // in cents
    "contractor_compensation": 20000 // in cents
  }
  ```
- **Response**: created project object
- **Error**: 400 validation (total_budget must equal contractor_comp + approved_expenses + worker_pool), 401 unauthenticated

### GET /projects
- **May call**: contractor, client, worker (limited summary)
- **Request**: query params optional
- **Response**: array of project summaries

### GET /projects/{id}
- **May call**: contractor, client (full); worker (summary without contractor_comp)
- **Request**: none
- **Response**: full project object
- **Error**: 404 not found

### PUT /projects/{id}
- **May call**: contractor or client (when budget/funding affected)
- **Request**: partial fields to update (name, total_budget, etc.)
- **Response**: updated project
- **Error**: 400 validation, 403 forbidden

### GET /projects/{id}/project-members
- **May call**: contractor, client
- **Request**: none
- **Response**: array of project members with roles

### POST /projects/{id}/project-members
- **May call**: contractor
- **Request**: `{ "email": "amara@okafor.example", "role": "worker" }`
- **Response**: created invitation
- **Error**: 400 email already member, 401 unauthenticated

### GET /projects/{id}/tasks
- **May call**: contractor, client, worker (own tasks or summary)
- **Request**: query params optional
- **Response**: array of tasks

### POST /projects/{id}/tasks
- **May call**: contractor
- **Request**:
  ```json
  {
    "title": "Sew wedding outfits",
    "description": "Create traditional wedding attire",
    "status": "assigned",
    "client_confirmed": false,
    "deliverables": ["outfit1", "outfit2"]
  }
  ```
- **Response**: created task
- **Error**: 400 validation, 401 unauthenticated

### PUT /tasks/{id}  **H1**
- **May call**: contractor (sets status="approved" and client_confirmed=true when client confirmation is required)
- **Request**:
  ```json
  {
    "status": "approved",
    "client_confirmed": true
  }
  ```
- **Response**: updated task
- **H1**: A sets tasks.status = "approved" and client_confirmed = true when client confirmation is required. B's payout agent starts from that.
- **Error**: 400 invalid state transition, 401 unauthenticated, 403 forbidden

### GET /tasks/{id}/attachments
- **May call**: contractor, client, worker (own task's attachments)

### POST /tasks/{id}/attachments
- **May call**: contractor
- **Request**: `{ "url": "https://...", "description": "sketch" }`
- **Response**: created attachment

### GET /tasks/{id}/submissions
- **May call**: contractor, client (all); worker (own submissions only)

### POST /tasks/{id}/submissions
- **May call**: worker
- **Request**: `{ "content": "photos of completed work" }`
- **Response**: created submission
- **Error**: 400 task not in submitted status, 401 unauthenticated

### GET /submissions/{id}
- **May call**: contractor, client, worker (own submission)

### PUT /submissions/{id}
- **May call**: contractor or client
- **Request**: `{ "status": "accepted" }` or `{ "status": "rejected" }`
- **Response**: updated submission

### GET /submissions/{id}/reviews
- **May call**: contractor, client

### POST /submissions/{id}/reviews
- **May call**: contractor or client
- **Request**:
  ```json
  {
    "score": 5,
    "comments": "Excellent work"
  }
  ```
- **Response**: created review

### GET /tasks/{id}/incomplete-reports
- **May call**: contractor, client

### GET /notifications
- **May call**: all roles (own notifications only for worker)
- **Request**: query ?unread=true|false
- **Response**: array of notifications for the calling user

### GET /activity-log
- **May call**: contractor, client (full); worker (limited - own actions only)
- **Request**: query ?action=..., ?target=...
- **Response**: array of activity log entries

## Owner B Endpoints

### POST /funding
- **May call**: client
- **Request**:
  ```json
  {
    "amount": 100000,
    "funding_address": "GS...testnet*"
  }
  ```
- **Response**: funding record
- **Error**: 400 insufficient funds, 401 unauthenticated

### GET /projects/{id}/funding
- **May call**: contractor, client (full); worker (amount only, no source)
- **Request**: none
- **Response**: funding object or null

### GET /projects/{id}/expenses
- **May call**: contractor, client (full); worker (own expenses or summary total)
- **Request**: none
- **Response**: array of expenses

### POST /expenses
- **May call**: contractor
- **Request**:
  ```json
  {
    "amount": 1000,
    "description": "Venue deposit",
    "approved": true
  }
  ```
- **Response**: created expense
- **Note**: Only approved expenses reduce the budget
- **Error**: 400 unapproved expenses do not reduce budget, 401 unauthenticated

### GET /projects/{id}/contractor-compensation
- **May call**: contractor, client (amount); worker (null)
- **Request**: none
- **Response**:
  ```json
  {
    "amount": 20000,
    "paid": false
  }
  ```
- **Error**: 404 not found (if no compensation set)
- **Note**: contractor_comp is null for workers — never shown to worker role

### GET /projects/{id}/allocations
- **May call**: contractor, client (all workers' allocations); worker (own allocation only)
- **Request**: none
- **Response**: array of allocation objects (filtered by role)

### POST /allocations
- **May call**: contractor
- **Request**:
  ```json
  {
    "worker_id": "worker_123",
    "amount": 15000 // in cents from worker pool
  }
  ```
- **Response**: created allocation
- **Note**: Agreed payments cannot be reduced unilaterally. Allocation changes need the affected worker's acceptance, and client approval when the overall budget or funding is affected.

### POST /allocation-changes  **H4**
- **May call**: contractor or client
- **Request**:
  ```json
  {
    "allocation_id": "alloc_456",
    "proposed_amount": 12000,
    "reason": "Adjustment for delayed deliverables"
  }
  ```
- **Response**: allocation change record
- **H4**: A calls POST /allocation-changes with allocation_id, proposed_amount, reason.
- **Error**: 400 invalid amount, 403 insufficient approvals, 401 unauthenticated

### GET /allocation-changes/{id}
- **May call**: contractor, client
- **Request**: none
- **Response**: allocation change object

### GET /payments
- **May call**: contractor, client (full); worker (own payments + overall project progress)
- **Request**: query ?task_id=..., ?worker_id=..., ?status=...
- **Response**: array of payment records

### POST /payments
- **May call**: payout agent (system-initiated after H1)
- **Request**:
  ```json
  {
    "task_id": "task_789",
    "worker_id": "worker_123",
    "amount": 15000,
    "payment_id": "paymnt_x402_abc123" // unique key per approved work item
  }
  ```
- **Response**: created payment record
- **Note**: x402 settlement must be the actual agreed worker payment (or unlock a protected deliverable) and must not cause a second payment
- **Error**: 409 duplicate payment_id, 400 insufficient funds, 401 unauthenticated

### GET /projects/{id}/payments
- **May call**: contractor, client (full); worker (own payments only + overall paid/pending)

### GET /receipts
- **May call**: contractor, client (full); worker (own receipts only)

### GET /agent-log
- **May call**: contractor, client
- **Request**: query ?task_id=..., ?worker_id=..., ?action=...
- **Response**: array of agent log entries

### POST /whatsapp
- **May call**: contractor, client
- **Request**:
  ```json
  {
    "project_id": "proj_123",
    "message": "Payment of 150 USDC released for task completion",
    "message_type": "payment_reminder",
    "sent_to": "worker_123"
  }
  ```
- **Response**: created whatsapp message record
- **Note**: WhatsApp message alone never authorizes a financial action
- **Error**: 400 invalid message type, 401 unauthenticated

### GET /projects/{id}/money-summary  **H2**
- **May call**: contractor, client, worker
- **Request**: none
- **Response**:
  ```json
  {
    "total_budget": 100000,
    "funded": 100000,
    "expenses": 10000,
    "contractor_comp": 20000,
    "worker_pool": 70000,
    "paid": 50000,
    "pending": 20000,
    "remaining": 30000
  }
  ```
- **H2**: GET /projects/{id}/money-summary returns total_budget, funded, expenses, contractor_comp (null for workers), worker_pool, paid, pending, remaining.
- **Error**: 404 not found

# End of API_CONTRACT.md