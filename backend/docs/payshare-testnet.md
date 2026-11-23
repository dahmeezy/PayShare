# Run PayShare on Stellar testnet

Use Node.js 22 or newer. Run commands from `backend/`.

## Local preview

Copy `.env.example` to `.env` if you do not already have one. Set `FACILITATOR=backup`, `AGENT_PLANNER=scripted`, and `PAYSHARE_ENABLE_TESTNET_PAYOUTS=false`. Set separate random values of at least 32 characters for the client, contractor, and each worker. Use `PAYSHARE_STATE_FILE` to choose a separate file for the preview if you already have a payment project.

Run `npm ci`, `npm run init:preview` once, then `npm run start:payshare`. Open `http://127.0.0.1:4021/money` and sign in with a role token. Preview history is permanently blocked from sending payouts.

## New testnet payment project

1. Start in a fresh copy with an empty `STELLAR_SECRET_KEY` and `PAYSHARE_PAYER_WALLET`, and with no project history at the configured path. After approval to set up testnet wallets, run `npm run setup -- --new-project`. This creates initial history tied to the new payer and sets up the Stellar testnet wallets. Run `node scripts/workers.mjs` to set up the worker wallets. Finish wallet setup with `npm run setup` if a network error interrupts the first run.
2. Set `FACILITATOR=backup`, `AGENT_PLANNER=scripted`, and `PAYSHARE_CLIENT_WALLET` to the client's public testnet address. The payout wallet is the public address for `STELLAR_SECRET_KEY`. Keep the key and separate role and agent tokens in private configuration.
3. As client, create a funding request. When approved, send one Circle USDC transfer on Stellar testnet from the client wallet to the displayed payer address and enter the transaction hash. PayShare verifies the source, destination, token, amount, and success before counting the deposit. The sample budget is 10 USDC and Amara's allocation is 1.50 USDC.
4. Set and accept task terms, approve the work as contractor, and confirm as client if the task requires client review.
5. For an approved testnet payout, set `PAYSHARE_ENABLE_TESTNET_PAYOUTS=true` and restart the local app. Run `node src/payshare-agent.mjs pay amara` using the same state file as the app. Check the Payments screen for the Stellar receipt. A repeat payout is blocked.

## When payment history is unavailable

Keep one durable state file and a backup. The application stops project changes and payouts if the file is missing, damaged, or missing even one worker's payment record. Restore a trusted copy and reconcile every uncertain or recent payout against Stellar before using the project again. A copy made before a payment can be stale. Keep the app and agent stopped while restoring the file. Preview initialization cannot reopen trusted payment history or enable payouts.

For a submitted payment, use `node src/payshare-agent.mjs reconcile amara [transaction-hash]`. The hash is optional when the facilitator already supplied it. An operator can release a reservation with `node src/payshare-agent.mjs release amara` only if the signature was never submitted.

## Host a preview

- Use a Node.js 22+ web service connected to this private repository and a persistent volume. Run one instance. Set the service's working directory to `backend/` and its build command to `npm ci`.
- Set `PAYSHARE_HOST=0.0.0.0`, let the host provide `PORT`, and set `FACILITATOR=backup`, `AGENT_PLANNER=scripted`, and `PAYSHARE_ENABLE_TESTNET_PAYOUTS=false`.
- Set `PAYSHARE_STATE_FILE` to an absolute path on the persistent volume. Set private role tokens through the host and give reviewers their tokens privately. Use no wallet signing key for the preview.
- Run `npm run init:preview` once with the volume mounted. Start the app with `node --env-file=.env.example src/payshare-server.mjs`. Use HTTPS, `/healthz` to check service health, and `/money` for the prototype.

## Hackathon scope

This version uses the existing sample project and one work item per worker. Team A's account, project, invitation and task services are needed to connect real members, submissions and replacement assignments. An allocation increase requires client consent. Partial pay requires the worker's agreement and a new review. For WhatsApp, set the HTTPS app origin and worker phone numbers through private settings. PayShare prepares a share link, and the sender chooses whether to send it in WhatsApp.
