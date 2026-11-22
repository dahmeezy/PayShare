# Open Questions

Every assumption made and every decision not covered by this prompt, especially:

## 1. Client USDC Funding
- **How does the client fund the project with USDC?**
  - The contract mentions `POST /funding` with `amount` and `funding_address`, and a `funding_address` field on the funding entity.
  - It is unclear whether the client deposits USDC into a shared project address, or whether each contribution is tracked individually.
  - The `funding_address` on the funding record may be the x402 facilitator address or a Stellar address receiving USDC.
  - **Decision needed**: Is funding a single transaction or multiple contributions? Does the facilitator URL (from .env.example) handle auto-settlement, or does the backend manually verify each deposit?

## 2. Payout Agent & x402
- **How does a payout use x402 to pay workers?**
  - The contract specifies that x402 settlement must be the actual agreed worker payment and must not cause a second payment.
  - `POST /payments` is called by the payout agent (system-initiated after H1 task approval).
  - The `payment_id` field on payments must be unique per approved work item — this likely maps to the x402 payment identifier.
  - **Decision needed**: Does the payout agent call an external x402 facilitator API? Who computes the `payment_id` (contractor, client, or agent)? How is idempotency ensured so a worker is not paid twice for the same approved work?

## 3. Agent Signing Key
- **Who holds the agent signing key?**
  - The `.env.example` contains `AGENT_SECRET_KEY=` (empty), suggesting the payout agent needs a private key.
  - The agent logs (`agent_log`) record actions, but it is unclear whether the agent signs transactions internally or calls a hosted service.
  - **Decision needed**: Is the agent signing key stored securely in environment variables, a hardware module, or managed by a third-party x402 facilitator? Who can rotate the key?

## 4. Allocation Change approval flow
- **H4 says**: "A calls POST /allocation-changes with allocation_id, proposed_amount, reason."
- But the permission matrix also says contractor or client can call this endpoint, and worker must accept.
- **Decision needed**: Who can *initiate* an allocation change — only the contractor, or also the client? What combination of worker_accepted + client_approved is required for the change to take effect? Must both be true, or is either sufficient?

## 5. Incomplete work pay rules
- **Business rule**: "Incomplete work gives no automatic full pay, zero pay or deduction, and non-transferable tasks are never reassigned automatically."
- **Decision needed**: Who determines the pay amount for incomplete work — the contractor, the client, or the payout agent? Is there a standard deduction percentage, or is it case-by-case? How is this recorded in the database (adjustment to allocation, a new allocation, or a payment with a reduced amount)?

## 6. Worker trustline and Stellar address
- **H6**: "users.stellar_address and users.trustline_ok."
- **Decision needed**: When and how is `trustline_ok` set? Is it the worker's responsibility to establish the trustline, or does the contractor/client trigger it? What happens when `trustline_ok` is false — are payments blocked until it's true?

## 7. Duplicate payment prevention
- **Business rule**: "No worker is paid twice for the same approved work (payments need a unique key per approved work item)."
- **Decision needed**: The `payment_id` on payments must be unique per approved work item. Is this generated from (task_id + worker_id + amount), or is it a UUID? What happens if two payout agents attempt to pay the same work item concurrently?

## 8. Client confirmation scope
- **Business rule**: "Contractor approval is required for deliverables. Client approval only for overall completion or deliverables designated for client confirmation."
- **Decision needed**: How is `client_confirmed` on tasks set? Is it a binary flag per task, or are there multiple deliverables with individual confirmation flags? Who designates which deliverables require client confirmation — the contractor or the client?

## 9. Expense approval and budget impact
- **Business rule**: "Only approved, documented expenses reduce the budget."
- **Decision needed**: The `expenses` table has `approved: boolean`. Does `approved: false` mean the expense is merely undocumented, or does it still reduce the budget at a reduced rate? Who approves expenses — contractor only, or client also for large amounts?

## 10. Notification system
- **Endpoints**: `GET /notifications` and `POST /notifications` (implied in the contract).
- **Decision needed**: What triggers a notification? Is every state change (task status, payment, allocation) supposed to create a notification automatically, or must the code explicitly create them? What notification types are supported beyond the enum (task_update, payment, invitation, system)?

## 11. Activity log completeness
- **Endpoints**: `GET /activity-log`.
- **Decision needed**: Should the activity log capture *all* state changes, or only *financially significant* ones? For example: task status changes, allocation changes, submissioncrejections, or only payment movements, funding events, allocation change approvals?

## 12. Role hierarchy and delegation
- **Decision needed**: Can a contractor delegate task approval to a client? Can a worker's Stellar address be updated by the contractor, or must the worker do it themselves? Are there any admin/super-user roles beyond contractor, client, and worker?

# End of OPEN_QUESTIONS.md