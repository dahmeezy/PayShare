# PayShare

PayShare helps people working on the same project get paid fairly and keep track of their money.

When a contractor works with different people, it can be stressful to calculate everyone's pay, confirm that work is done, and send payments one by one. PayShare makes that process easier to manage.

## What we are building

PayShare is a payment tool for project teams. It helps a client, contractor, and workers agree on how much each person should receive, track project funds, and check payments.

The goal is simple: everyone should know what they are being paid for, how much they are owed, and whether they have been paid.

## How it works

1. A project is created with a budget and a list of workers.
2. Each worker gets a task and an agreed payment amount.
3. The client funds the project.
4. The worker completes the task and the required people review the work.
5. Once the payment conditions are met, PayShare can send the agreed amount in USDC on Stellar testnet.
6. The team can check payment status and view transaction receipts.

PayShare uses **Stellar** for blockchain payments and **x402** to support the payment process.

## Features

The current development work includes:

- **Project money overview:** See the budget, expenses, worker allocations, and payment status.
- **Funding checks:** Verify testnet USDC deposits before treating them as available funds.
- **Task approvals:** Record worker acceptance, contractor review, and client confirmation where needed.
- **Allocation changes:** Let people propose and approve changes to agreed pay.
- **Incomplete work reports:** Record issues and agree on what should happen next.
- **Payment protection:** Check approval, money available, and payment history before sending. Missing or damaged history stops payouts.
- **WhatsApp sharing:** Prepare a message and link that someone can review and send through WhatsApp.

Some of these features are still in separate pull requests and are not yet part of the main branch.

## Working prototype

The prototype runs locally with one sample project. You can review the budget, accept and approve work, and check payment status in the browser. The preview needs no Stellar keys and cannot send payments.

### Run the preview

1. Open `backend/` on the branch with the full prototype (`feature/whatsapp` while the pull requests are open).
2. Use Node.js 22 or newer. Run `npm ci` and copy `.env.example` to `.env` if you do not already have one.
3. Set `FACILITATOR=backup`, `AGENT_PLANNER=scripted`, `PAYSHARE_ENABLE_TESTNET_PAYOUTS=false`, and `PAYSHARE_STATE_FILE=payshare-state.json`. Set a different private token for each demo role you want to use. Generate tokens with `openssl rand -hex 32`.
4. Run `npm run init:preview` once in a fresh demo folder, then run `npm run start:payshare`.
5. Open [the local prototype](http://127.0.0.1:4021/money) and enter a role token. For the full approval flow, use the contractor, Amara, and client tokens in separate tabs.

Run `npm test` from `backend/` to check the payment rules and project workflow. The tests simulate blockchain requests. See [the testnet guide](backend/docs/payshare-testnet.md) for wallet setup, payment recovery, and hosting requirements.

### Public demo

A public preview needs access to a Node.js 22+ host, HTTPS, and a persistent volume for the project file. Set role tokens through the host's private settings and keep payouts disabled. The testnet guide includes the build command, start command, and health check for a hosted preview.

## Tools we use

- **JavaScript and Node.js:** Backend logic
- **Express:** API and local web server
- **Stellar testnet:** Test payments without using real money
- **USDC:** The token used for payments
- **x402:** Payment requests and settlement
- **HTML, CSS, and JavaScript:** Prototype screens

## Current limitations

PayShare currently uses one sample project and local access tokens. We still need to connect it to the team's full account, project, and task system. WhatsApp messages are prepared as drafts and sent manually.

The payment demo is for **Stellar testnet only**. It is not ready to handle real customer money.

## Project status

PayShare is being built as part of the **EmpowerHer Hackathon**. We are testing the main payment flow and bringing the different parts of the project together.

## Acknowledgement

The project builds on the x402 Stellar EmpowerHer workshop starter kit by KoxyG.
