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
- **Payment protection:** Check payment conditions and help prevent paying the same task twice.
- **WhatsApp sharing:** Prepare a message and link that someone can review and send through WhatsApp.

Some of these features are still in separate pull requests and are not yet part of the main branch.

## Working prototype

The prototype currently runs locally. We have not added a public demo link yet.

To try the development version, follow the setup instructions in [the testnet guide](backend/docs/payshare-testnet.md) on the `feature/whatsapp` branch.

After starting the backend, open:

`http://127.0.0.1:4021/money`

This address works on the computer running the app. It is **not** a public website. A hosted prototype link will be added here when one is available.

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
