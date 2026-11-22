# Run the PayShare testnet project

Run the commands from `backend/` with Node.js 22 or newer.

1. Run `npm ci`, `npm run setup`, and `node scripts/workers.mjs`. Setup creates Stellar testnet accounts and adds Circle USDC trustlines. Get testnet USDC for the client wallet. Use a separate client and payout wallet.
2. In `.env`, set `FACILITATOR=backup`, `AGENT_PLANNER=scripted`, and `PAYSHARE_CLIENT_WALLET` to the client's **public** testnet address. The payout wallet is the public address for `STELLAR_SECRET_KEY`. If the server runs separately from the signer, also set `PAYSHARE_PAYER_WALLET` on the server to that same public address.
3. Set separate random local tokens (32 characters or more) for the client, contractor, each worker, and agent. Run `node src/payshare-server.mjs`, open `http://127.0.0.1:4021/money`, and use the appropriate token. Keep `.env`, signing keys, and the state file private.
4. As client, create a funding request, send one Circle USDC payment on Stellar **testnet** from the configured client address to the displayed wallet, and paste its transaction hash. PayShare checks the ledger before updating available funds. The seeded demo budget is 10 USDC and the Amara allocation is 1.50 USDC.
5. As contractor, enter task terms in Deliverables. As the worker, accept the terms. As contractor, approve completed work and supply a submission reference. As client, confirm the deliverable if designated for client review. Allocation changes and incomplete work reports have their own approval screens.
6. To enable testnet payouts, set `PAYSHARE_ENABLE_TESTNET_PAYOUTS=true` and restart the server. From the same backend directory run `node src/payshare-agent.mjs pay amara`. Open Payments to see status and the Stellar testnet receipt. Running the same payout again should be rejected.
7. Run `npm test` for calculation, permission, workflow, and settlement tests. Tests use disposable state and simulated ledger/facilitator responses.

## Payout recovery

The server first reserves an amount from the project's verified funding and records the start of a submission before calling the facilitator. The agent only accepts a quote matching that amount, worker wallet, and Circle testnet USDC. It records the payment as paid after Stellar confirms that exact transfer.

If a payout is still pending on the ledger, use `node src/payshare-agent.mjs reconcile amara [transaction-hash]`. The hash is optional when the facilitator already returned it. If the agent stopped before submitting a signature, `node src/payshare-agent.mjs release amara` releases the reservation. The release command rejects signed submissions. Keep and back up the state file. Archive the state before changing the project's wallet or starting a separate test project.

## MVP choices and handoff

- This branch uses the existing single-project demo and its one work item per worker. Team A's project, invitation, task/submission and session services are needed to connect real projects, identities, worker onboarding, and reassigned work. A transferred item is recorded and the replacement worker is notified. The new assignment and its agreed pay go through Team A's task and allocation handoff.
- The client can make multiple verified transfers, one payment operation per transaction. The agent signs locally with its dedicated testnet key. No public-network payout is available.
- Each allocation change requires the affected worker's acceptance. An increase also requires the client to approve the larger commitment. A worker's counteroffer goes back to the contractor before applying the normal client rule.
- Incomplete work needs a documented resolution. Partial pay requires the worker's agreement and a new contractor review, plus client approval when required. The approved original allocation remains in the history.
- WhatsApp uses share links. Configure `PAYSHARE_APP_URL` with the deployed HTTPS origin and the worker phone numbers in `.env`. The link opens a draft for the sender and a sign-in page for the recipient. A sender still presses Send in WhatsApp.
