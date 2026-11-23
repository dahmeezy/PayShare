// Keep money calculations in cents to avoid floating-point rounding problems.
export function toCents(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be a non-negative number");
  }
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(amount * 100 - cents) > 0.000001) {
    throw new Error("Amount must have at most two decimal places");
  }
  return cents;
}

// Only approved, documented expenses count against the budget.
export function approvedExpenseTotal(expenses) {
  return expenses.reduce((total, expense) => {
    if (!expense.approved) return total;
    if (typeof expense.description !== "string" || !expense.description.trim()) {
      throw new Error("Approved expenses need a description");
    }
    return total + toCents(expense.amount);
  }, 0);
}

export function budgetBreakdown(project, payouts = {}) {
  const totalBudget = toCents(project.budget);
  const expenses = Array.isArray(project.expenses)
    ? approvedExpenseTotal(project.expenses)
    : toCents(project.expenses);
  const contractorComp = toCents(project.contractorPay);
  const workerPool = totalBudget - expenses - contractorComp;
  const allocated = project.workers.reduce((sum, worker) => sum + toCents(worker.allocation), 0);
  const paid = project.workers.reduce((sum, worker) =>
    sum + (payouts[worker.id]?.status === "paid" ? (payouts[worker.id].amount ?? toCents(worker.allocation)) : 0), 0);

  if (workerPool < 0 || allocated > workerPool) {
    throw new Error("Budget exceeded: expenses, compensation and allocations cannot exceed the budget");
  }
  return {
    total_budget: totalBudget,
    expenses,
    contractor_comp: contractorComp,
    worker_pool: workerPool,
    allocated,
    paid,
    pending: allocated - paid,
    unallocated: workerPool - allocated,
  };
}
