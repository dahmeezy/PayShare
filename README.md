# PayShare

PayShare helps people working on the same project agree on pay and see when it is due. It gives the team one place to track project funds, tasks, approvals and payments.

- **Clients** create or join projects, record funding, review progress and confirm work when a task requires it.
- **Contractors** manage budgets and expenses, invite workers, assign tasks and pay, review submissions, and run eligible payouts.
- **Workers** join by invitation, submit assigned work, and see their own pay, approval status and receipts.

PayShare uses HTML, CSS and JavaScript for the Figma-based screens, Node.js and Express for the API, and local JSON files for persistence. Stellar testnet and test USDC support on-chain funding and settlement. x402 verifies and settles authorized testnet payouts through a configured facilitator.

## Run locally

Install Node.js 22 or newer. From a PowerShell terminal in the repository root, run:

```powershell
Set-Location backend
npm.cmd ci
npm.cmd run init:workspace
npm.cmd start
```

Open [PayShare](http://localhost:4021/). On macOS or Linux, use `cd backend` and `npm` in place of `npm.cmd`. The first run creates a workspace history file. Run `npm start` for later sessions. Local simulation requires no `.env` file, facilitator or OpenAI key. An existing workspace or `.env` is kept intact.

The [Figma preview](http://localhost:4021/frontend/prototype.html) still includes the original sample screens and theme variants. Enter through the server root for the connected app. The original agent workshop console is available separately with `npm run workshop` in a fully configured workshop environment.

## Five-minute demo

1. In a browser window, register as a **client**. Create a project in **Simulation** mode with a budget of 100 USDC and record 100 USDC in simulated funding.
2. Create a contractor invitation. Copy the private link into a separate browser profile. Register with the invited email and accept. Set contractor compensation to 10 USDC and record a 5 USDC expense.
3. As the contractor, create a worker invitation. Open it in another browser profile, register with the invited email, and accept. The invitation sets the account role. Use **Your profile** to edit the display name or public Stellar wallet.
4. Refresh the contractor’s project. Assign the worker a task with a 45 USDC allocation and choose **Require client confirmation**. As the worker, refresh, open the task and submit a short note or deliverable link.
5. As the contractor, refresh, review and approve. As the client, refresh and confirm the deliverable. The contractor can now refresh and choose **Run payout simulation**. Refresh the worker view to see the saved result labeled **Simulated payout · No funds moved**. The worker sees their own tasks and payments.

Use separate browser profiles instead of tabs because each profile has one account session. PayShare creates private links for manual sharing. It does not send them.

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

Copy `backend/.env.example` into `backend/.env` only if you need optional configuration and the file does not already exist. Keep wallet seeds, access tokens, user data and state files out of Git.

### Stellar testnet walkthrough

Choose **Stellar testnet** when creating the project. The client saves their public account in **Your profile**, then makes a single classic USDC payment from that wallet to the displayed funding account. Use the project’s displayed **hash memo**, encoded in base64. Enter the amount and Stellar transaction hash in **Fund project**. PayShare checks the network, token issuer, amount, source, destination and memo, and rejects previously recorded transactions.

The worker saves their own public Stellar account before the contractor assigns the task. After all required approvals, **Authorize Stellar testnet payout** asks the scripted agent to check the real project budget and payment history. It gets the facilitator’s capabilities and verifies the payment terms before reserving one attempt. It marks the payout paid only after finding the exact USDC transfer on Stellar testnet. If settlement is uncertain, the payout stays locked and must be reconciled. Ordinary project actions continue during a facilitator outage.

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
```

Backend tests cover session and role checks, invitation reuse, funding limits, allocations, approvals, missing history, and failed or mismatched settlements. The checkout was tested through a local facilitator and test ledger. A real Stellar testnet payment was not submitted. A read-only query verified the public backup advertises Stellar testnet support. See [facilitator troubleshooting](backend/docs/troubleshooting.md) for credential errors.

## Limits and hosting handoff

- Email ownership verification, password recovery and automatic message delivery require an external delivery service. They are disabled and labeled in the app.
- Task submissions store text or a link. The app does not host attachments. Team members manually refresh project data to see updates from other accounts.
- The connected dashboard covers the core project flow. Secondary Figma screens remain in the design preview.
- Run one application instance with write access to both data files. Keep backups together and restrict file access. If payment history is missing or damaged, restore and reconcile it before resuming. The initializer is for a new workspace.
- Build with Node.js 22 or newer and `npm ci` from `backend`. Start with `npm start` and publish its `PORT` behind HTTPS. Deploy from a checkout containing both `backend` and `frontend` because Express serves the bundled Figma assets. Enable secure cookies and mount the two persistent files. Enable testnet payments only once the configured facilitator and wallets are ready.

## Acknowledgement

PayShare builds on the x402 Stellar EmpowerHer workshop starter kit by KoxyG.
