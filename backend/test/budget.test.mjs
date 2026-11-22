import test from "node:test";
import assert from "node:assert/strict";
import { toCents, approvedExpenseTotal, budgetBreakdown } from "../src/budget.mjs";

const project = {
  budget: 10,
  expenses: 1,
  contractorPay: 2,
  workers: [
    { id: "amara", allocation: 1.5 },
    { id: "bisi", allocation: 2.5 },
    { id: "chidi", allocation: 3 },
  ],
};

test("converts valid USDC amounts to cents", () => {
  assert.equal(toCents(1.25), 125);
  assert.equal(toCents(0), 0);
});

test("rejects negative, invalid and fractional-cent amounts", () => {
  for (const amount of [-1, NaN, Infinity, "5", 1.234]) {
    assert.throws(() => toCents(amount));
  }
});

test("calculates the worker pool and unpaid allocations", () => {
  const result = budgetBreakdown(project);
  assert.equal(result.worker_pool, 700);
  assert.equal(result.allocated, 700);
  assert.equal(result.pending, 700);
  assert.equal(result.unallocated, 0);
});

test("subtracts paid allocations from pending", () => {
  const result = budgetBreakdown(project, { amara: { status: "paid" } });
  assert.equal(result.paid, 150);
  assert.equal(result.pending, 550);
});

test("rejects spending more than the budget", () => {
  assert.throws(() => budgetBreakdown({ ...project, expenses: 5 }), /Budget exceeded/);
});

test("only approved and documented expenses reduce the budget", () => {
  const expenses = [
    { amount: 1, description: "Transport", approved: true },
    { amount: 4, description: "Unapproved purchase", approved: false },
  ];
  assert.equal(approvedExpenseTotal(expenses), 100);
  assert.equal(budgetBreakdown({ ...project, expenses }).worker_pool, 700);
});

test("approved expenses require a description", () => {
  assert.throws(() => approvedExpenseTotal([{ amount: 1, approved: true }]), /description/);
});
