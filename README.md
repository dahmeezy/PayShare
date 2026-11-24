# PayShare

PayShare helps people working on the same project agree on pay and see when it is due. It gives the team one place to track project funds, tasks, approvals and payments.

- **Clients** create or join projects, record funding, review progress and confirm work when a task requires it.
- **Contractors** manage budgets and expenses, invite workers, assign tasks and pay, review submissions, and run eligible payouts.
- **Workers** join by invitation, submit assigned work, and see their own pay, approval status and receipts.

PayShare uses HTML, CSS and JavaScript for the Figma-based screens, Node.js and Express for the API, and local JSON files for persistence. Stellar testnet and test USDC support on-chain funding and settlement. x402 verifies and settles authorized testnet payouts through a configured facilitator.

## Run locally

Install Git and Node.js 22 or newer. Open PowerShell in the folder where you want to download PayShare and run:

```powershell
git clone --branch main https://github.com/dahmeezy/PayShare.git
Set-Location .\PayShare\backend
npm.cmd ci
npm.cmd run init:workspace
npm.cmd start
```

Open [PayShare](http://localhost:4021/). On macOS or Linux, use `cd PayShare/backend` and `npm` in place of `npm.cmd`. The initializer creates the history file for a new workspace. For later sessions, run `npm.cmd start` from `backend`. Local simulation uses the scripted planner and works without a `.env` file, facilitator or OpenAI key.

The server root opens the original Figma screens with live account and project data. The original workshop console remains available separately with `npm run workshop` in a fully configured workshop environment.

## Five-minute demo

1. Register as a **client**. Complete onboarding, then choose **Fund a project** from the dashboard. Create a project in **Simulation** mode with a budget of 100 USDC and record 100 USDC in simulated funding.
2. Choose **Invite contractor** on the funding or financial breakdown screen. Copy the private link into a separate browser profile. Register with the invited email and accept the invitation. From the contractor dashboard, open **View budget**, choose **Manage budget** to set compensation to 10 USDC, then **Add expense** to record a 5 USDC expense.
3. Open **Invite worker** on the contractor dashboard. Share the link with another browser profile. Register as the invited worker and accept. The invitation sets the account role. The profile screen lets workers edit their name and public payout wallet.
4. From the contractor dashboard, choose **Create task**. Assign a worker, enter a 45 USDC allocation, and select **Require client confirmation**. As the worker, open the task from **My tasks**, choose **Submit work**, and enter a note or deliverable link.
5. The contractor opens **Review submissions** and approves the work. The client opens **Review & confirm** on their dashboard and confirms the deliverable. The contractor opens **Approvals**, chooses **Authorize payout**, then **Run payout simulation**. The worker opens **Payment history** to see **Simulated · No funds moved**. Reopen or refresh a screen to see changes saved from another account.

Use separate browser profiles because each profile has one account session. PayShare creates private links for manual sharing. It does not send them. Compare the connected dashboards with the Figma frames in the [visual review](frontend/review/connected-dashboard-review.md).

## Payments and optional configuration

| Setting | When needed |
| --- | --- |
| `PORT` | Optional. Defaults to 4021. |
| `PAYSHARE_USERS_FILE`, `PAYSHARE_WORKSPACE_FILE` | Optional local paths. Set to files on persistent storage when hosting. |
| `PAYSHARE_SECURE_COOKIES=true` | Set when serving the app over HTTPS. |
| `PAYSHARE_ENABLE_TESTNET_PAYOUTS=true` | Explicitly enables testnet projects when the rest of the testnet configuration is valid. Keep off for a simulation-only demo. |
| `STELLAR_NETWORK`, `STELLAR_NETWORK_PASSPHRASE`, `USDC_CONTRACT_ID` | Use the Stellar testnet and Circle testnet USDC values in [backend/.env.example](backend/.env.example). |
| `STELLAR_SECRET_KEY` | Secret seed for the dedicated testnet project payer. Keep it server-side. The payer needs test XLM and a USDC trustline. |
| `FACILITATOR`, `FACILITATOR_PRIMARY_URL`, `FACILITATOR_PRIMARY_API_KEY`, `FACILITATOR_BACKUP_URL` | Select the matching provider explicitly. OpenZeppelin needs a valid primary key. The public backup currently advertises x402 exact settlement on Stellar testnet. |
| `AGENT_PLANNER=ai`, `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional AI summaries for clients and contractors. No OpenAI key is needed for the default scripted workflow. |

To configure an optional service, run the following from `backend`, then edit `.env`. Keep wallet seeds, access tokens, user data and state files out of Git.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

### Stellar testnet walkthrough

Choose **Stellar testnet** when creating the project. The client saves their public account in **Your profile**, then makes a single classic USDC payment from that wallet to the displayed funding account. Use the project’s displayed **hash memo**, encoded in base64. Enter the amount and Stellar transaction hash in **Fund project**. PayShare checks the network, token issuer, amount, source, destination and memo, and rejects previously recorded transactions.

The worker saves their own public Stellar account before the contractor assigns the task. After all required approvals, **Authorize Stellar testnet payout** checks the project budget and payment history, checks the facilitator’s capabilities, and reserves one attempt before asking the facilitator to verify and settle it. PayShare marks the payout paid only after finding the exact USDC transfer on Stellar testnet. If settlement is uncertain, the payout stays locked and must be reconciled. Ordinary project actions continue during a facilitator outage.

AI mode can summarize project totals and the scripted agent’s eligibility results. Only aggregate status data is sent for that optional request. The same code makes all funding and payout decisions in either mode.

## Tests

```powershell
# From backend
npm.cmd test
node --test ..\frontend\prototype\navigation.test.mjs
```

The browser test starts its own server and uses temporary user and project files.

```powershell
npm.cmd install --no-save --package-lock=false playwright
npx.cmd playwright install chromium
$env:PLAYWRIGHT_MODULE = (Resolve-Path .\node_modules\playwright).Path
node ..\frontend\test\mvp.cjs
$env:PAYSHARE_MVP_MOBILE = '1'
node ..\frontend\test\mvp.cjs
Remove-Item Env:\PAYSHARE_MVP_MOBILE
```

Backend tests cover session and role checks, invitation reuse, funding limits, allocations, approvals, missing history, and failed or mismatched settlements. The checkout was tested through a local facilitator and test ledger. A real Stellar testnet payment was not submitted. A read-only query verified the public backup advertises Stellar testnet support. See [facilitator troubleshooting](backend/docs/troubleshooting.md) for credential errors.

## Limits and hosting handoff

- Email ownership verification, password recovery and automatic message delivery require an external delivery service. They are disabled and labeled in the app.
- Task submissions store text or a link. The app does not host attachments. Team members manually refresh project data to see updates from other accounts.
- The connected app uses the original Figma frames. Features without an API, such as allocation change requests, attachments and voice notes, display an availability message.

### Deployment handoff

1. Use a Node.js 22 or newer host and a checkout containing both `backend` and `frontend`. Set the service working directory to `backend`, the install command to `npm ci`, and the start command to `npm start`.
2. Run one application instance. Mount a persistent volume, set `PAYSHARE_USERS_FILE` and `PAYSHARE_WORKSPACE_FILE` to separate files on it, and give the application write access. For a new workspace, run `npm run init:workspace` once with those settings. Back up both files together. Restore and reconcile damaged or missing history before resuming payouts.
3. Expose the host's `PORT` over HTTPS and set `PAYSHARE_SECURE_COOKIES=true`. Open the root URL and run the demo in simulation mode first. Enable testnet payouts only after preparing the wallets and configuring a facilitator.

## Acknowledgement

PayShare builds on the x402 Stellar EmpowerHer workshop starter kit by KoxyG.
