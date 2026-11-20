# Data Model

Every table has exactly one owner. Tables refer to each other by id only.

## Member A

### users
- **Purpose**: Store user account information and Stellar trustline status
- **Owner**: A
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `name`: string — required, full name
  - `email`: string — required, unique email address
  - `role`: string (enum: contractor, worker, client) — required
  - `stellar_address`: string — optional, Stellar public key for USDC payments
  - `trustline_ok`: boolean — optional, whether trustline is established
  - `created_at`: string (ISO date) — required
  - `updated_at`: string (ISO date) — required
- **Relationships**:
  - One project member per `project_members`.`user_id`
  - Many `project_members`.`project_id` per project
  - Many `allocations`.`worker_id` per worker
  - Many `submissions`.`worker_id` per worker
  - Many `notifications`.`user_id` per user
  - Many `activity_log`.`user_id` per user

### projects
- **Purpose**: Store project information including budget and compensation breakdown
- **Owner**: A
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `name`: string — required, project name (e.g. "Lagos Wedding Decoration")
  - `total_budget`: number (cents) — required, total project budget in USDC
  - `approved_expenses`: number (cents) — required, sum of approved expenses (default 0)
  - `contractor_compensation`: number (cents) — required, contractor's compensation in USDC
  - `worker_allocation_pool`: number (cents) — required, total pool for workers (total_budget - contractor_comp - approved_expenses)
  - `status`: string (enum: active, completed, cancelled) — required
  - `created_by`: string (UUID) — required, contractor who created project
  - `created_at`: string (ISO date) — required
  - `updated_at`: string (ISO date) — required
- **Relationships**:
  - Many `project_members`.`project_id` per project
  - One `funding`.`project_id` per project (Owner B)
  - Many `expenses`.`project_id` per project (Owner B)
  - One `contractor_compensation`.`project_id` per project (Owner B)
  - Many `allocations`.`project_id` per project (Owner B)
  - Many `tasks`.`project_id` per project

### project_members
- **Purpose**: Link users to projects with their roles
- **Owner**: A
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `project_id`: string (UUID) — required, references projects.id
  - `user_id`: string (UUID) — required, references users.id
  - `role`: string (enum: contractor, worker, client) — required
  - `invited_by`: string (UUID) — optional, who invited this member
  - `joined_at`: string (ISO date) — required
  - `left_at`: string (ISO date) — optional
- **Relationships**:
  - Many per project (`project_id`)
  - Many per user (`user_id`)

### invitations
- **Purpose**: Track project invitation tokens
- **Owner**: A
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `project_id`: string (UUID) — required, references projects.id
  - `invitee_email`: string — required, email of invited user
  - `inviter_id`: string (UUID) — optional, who sent the invitation
  - `token`: string — required, unique invitation token
  - `expires_at`: string (ISO date) — required, token expiration
  - `used_at`: string (ISO date) — optional, when token was used
- **Relationships**:
  - One per project (`project_id`)

### tasks
- **Purpose**: Store project tasks with status tracking
- **Owner**: A
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `project_id`: string (UUID) — required, references projects.id
  - `title`: string — required, task title
  - `description`: string — optional
  - `status`: string (enum: assigned, accepted, in_progress, submitted, approved, rejected, cancelled) — required
  - `assigned_to`: string (UUID) — optional, user_id of assigned worker
  - `client_confirmed`: boolean — required, whether client has confirmed this task
  - `deliverables`: string (JSON) — optional, description of deliverables
  - `created_at`: string (ISO date) — required
  - `updated_at`: string (ISO date) — required
- **Relationships**:
  - Many per project (`project_id`)
  - Many `submissions`.`task_id` per task
  - Many `task_attachments`.`task_id` per task
  - Many `incomplete_reports`.`task_id` per task
  - One `reviews`.`submission_id` per submission (via submissions)

### task_attachments
- **Purpose**: Store file attachments for tasks
- **Owner**: A
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `task_id`: string (UUID) — required, references tasks.id
  - `url`: string — required, attachment URL/path
  - `uploaded_by`: string (UUID) — required, who uploaded
  - `uploaded_at`: string (ISO date) — required
  - `description`: string — optional
- **Relationships**:
  - One per task (`task_id`)

### submissions
- **Purpose**: Store worker task submissions
- **Owner**: A
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `task_id`: string (UUID) — required, references tasks.id
  - `worker_id`: string (UUID) — required, references users.id (the worker)
  - `content`: string (JSON) — required, submission content/work result
  - `status`: string (enum: pending, accepted, rejected) — required
  - `submitted_at`: string (ISO date) — required
  - `reviewed_at`: string (ISO date) — optional
  - `review_id`: string (UUID) — optional, references reviews.id
- **Relationships**:
  - One per task (`task_id`)
  - One per worker (`worker_id`)

### reviews
- **Purpose**: Store task review scores and comments
- **Owner**: A
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `submission_id`: string (UUID) — required, references submissions.id
  - `reviewer_id`: string (UUID) — required, who reviewed (contractor or client)
  - `score`: number (1-5) — required
  - `comments`: string — optional
  - `created_at`: string (ISO date) — required
- **Relationships**:
  - One per submission (`submission_id`)

### incomplete_reports
- **Purpose**: Store reports on incomplete or problematic work
- **Owner**: A
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `task_id`: string (UUID) — required, references tasks.id
  - `worker_id`: string (UUID) — required, references users.id (the worker)
  - `report_type`: string (enum: problem, delay, partial) — required
  - `description`: string — required, report details
  - `resolved`: boolean — required, whether issue resolved
  - `resolved_at`: string (ISO date) — optional
  - `created_at`: string (ISO date) — required
- **Relationships**:
  - One per task (`task_id`)
  - One per worker (`worker_id`)

### notifications
- **Purpose**: System notifications for users
- **Owner**: A
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `user_id`: string (UUID) — required, recipient user
  - `type`: string (enum: task_update, payment, invitation, system) — required
  - `title`: string — required, notification title
  - `message`: string — required, notification body
  - `read`: boolean — required, whether read
  - `related_id`: string (UUID) — optional, related entity id (task, payment, etc.)
  - `related_type`: string (enum: task, payment, invitation) — optional, type of related entity
  - `created_at`: string (ISO date) — required
- **Relationships**:
  - One per user (`user_id`)

### activity_log
- **Purpose**: Audit trail of all system actions
- **Owner**: A
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `user_id`: string (UUID) — required, who performed the action
  - `action`: string — required, action description
  - `target_type`: string — required, what was affected (task, project, user, etc.)
  - `target_id`: string (UUID) — required, id of affected entity
  - `old_value`: string (JSON) — optional, value before change
  - `new_value`: string (JSON) — optional, value after change
  - `created_at`: string (ISO date) — required
- **Relationships**:
  - One per action (`user_id`)

## Member B

### funding
- **Purpose**: Track USDC funding into projects
- **Owner**: B
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `project_id`: string (UUID) — required, references projects.id
  - `amount`: number (cents) — required, funded amount in USDC
  - `funded_by`: string (UUID) — required, who funded (client)
  - `funding_address`: string — required, USDC deposit address
  - `funded_at`: string (ISO date) — required
  - `status`: string (enum: pending, completed, failed) — required
- **Relationships**:
  - One per project (`project_id`)

### expenses
- **Purpose**: Track approved project expenses
- **Owner**: B
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `project_id`: string (UUID) — required, references projects.id
  - `amount`: number (cents) — required, expense amount in USDC
  - `description`: string — required, expense description
  - `approved`: boolean — required, whether expense is approved
  - `approved_by`: string (UUID) — optional, who approved
  - `receipt_url`: string — optional, receipt documentation
  - `claimed_at`: string (ISO date) — optional
  - `created_at`: string (ISO date) — required
- **Relationships**:
  - One per project (`project_id`)

### contractor_compensation
- **Purpose**: Store contractor's agreed compensation
- **Owner**: B
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `project_id`: string (UUID) — required, references projects.id
  - `amount`: number (cents) — required, contractor compensation in USDC
  - `paid`: boolean — required, whether paid
  - `paid_at`: string (ISO date) — optional
  - `payment_id`: string — optional, x402 or payment reference
- **Relationships**:
  - One per project (`project_id`)

### allocations
- **Purpose**: Store worker allocation shares from the pool
- **Owner**: B
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `project_id`: string (UUID) — required, references projects.id
  - `worker_id`: string (UUID) — required, references users.id (the worker)
  - `amount`: number (cents) — required, worker's share in USDC
  - `accepted`: boolean — required, whether worker has accepted this allocation
  - `accepted_at`: string (ISO date) — optional
  - `status`: string (enum: pending, accepted) — required
- **Relationships**:
  - One per project (`project_id`)
  - One per worker (`worker_id`)

### allocation_changes
- **Purpose**: Track requests to change worker allocations
- **Owner**: B
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `allocation_id`: string (UUID) — required, references allocations.id
  - `proposed_amount`: number (cents) — required, new proposed amount
  - `reason`: string — required, reason for change
  - `requested_by`: string (UUID) — required, who requested (contractor or client)
  - `worker_accepted`: boolean — required, whether worker accepted
  - `client_approved`: boolean — required, whether client approved
  - `created_at`: string (ISO date) — required
  - `resolved_at`: string (ISO date) — optional
- **Relationships**:
  - One per allocation (`allocation_id`)

### payments
- **Purpose**: Record all worker payments via x402
- **Owner**: B
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `task_id`: string (UUID) — required, references tasks.id
  - `worker_id`: string (UUID) — required, references users.id (paid worker)
  - `amount`: number (cents) — required, payment amount in USDC
  - `payment_id`: string — required, x402 payment identifier (unique key per approved work item)
  - `status`: string (enum: completed, failed, pending) — required
  - `usdc_tx_hash`: string — optional, Stellar transaction hash
  - `paid_at`: string (ISO date) — optional
  - `created_at`: string (ISO date) — required
- **Relationships**:
  - One per task (`task_id`)
  - One per worker (`worker_id`)
  - One receipt per `receipts`.`payment_id`

### receipts
- **Purpose**: Payment receipts for workers
- **Owner**: B
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `payment_id`: string (UUID) — required, references payments.id
  - `worker_id`: string (UUID) — required, references users.id (receiving worker)
  - `amount`: number (cents) — required, receipt amount
  - `usdc_tx_hash`: string — required, Stellar transaction hash
  - `received_at`: string (ISO date) — required
  - `notes`: string — optional, additional receipt notes
- **Relationships**:
  - One per payment (`payment_id`)

### agent_log
- **Purpose**: Payout agent operation log
- **Owner**: B
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `task_id`: string (UUID) — required, related task
  - `worker_id`: string (UUID) — required, related worker
  - `action`: string — required, agent action taken
  - `status`: string (enum: success, failed, skipped) — required
  - `error_details`: string (JSON) — optional, error information
  - `created_at`: string (ISO date) — required
- **Relationships**:
  - One per agent action (`task_id`, `worker_id`)

### whatsapp_messages
- **Purpose**: Log WhatsApp communications
- **Owner**: B
- **Fields**:
  - `id`: string (UUID) — required, primary key
  - `project_id`: string (UUID) — required, references projects.id
  - `sent_to`: string (UUID) — required, recipient user id
  - `message`: string — required, WhatsApp message body
  - `message_type`: string (enum: payment_reminder, approval, notification, system) — required
  - `sent_at`: string (ISO date) — required
  - `delivered`: boolean — required, whether delivered
  - `read`: boolean — required, whether read
- **Relationships**:
  - One per project (`project_id`)

# End of DATA_MODEL.md