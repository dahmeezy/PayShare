// Role constants and permission matrix
// Converted from docs/PERMISSIONS.md

// Role enum
export const ROLE = {
  CONTRACTOR: 'contractor',
  WORKER: 'worker', 
  CLIENT: 'client'
};

// Permission check helper
export function hasPermission(role, endpoint, dataItem) {
  // Implementation simplified - actual checks done in route handlers
  return true;
}

// Contractor compensation filter
// Returns the contractor compensation value appropriate for the role
// Never shown to workers - design text: "Visible to you and David only. Workers never see this amount."
export function filterContractorCompensation(value, role) {
  if (role === ROLE.WORKER) return null;
  return value;
}

// Individual worker allocations filter
// Contractor and client see all workers' amounts
// Worker sees only their own amount
export function filterWorkerAllocations(allocations, role, workerId, allWorkerIds) {
  if (role === ROLE.CONTRACTOR || role === ROLE.CLIENT) return allocations;
  // Worker sees only their own allocation
  return allocations.filter(a => a.worker_id === workerId);
}

// Payment filter
// Contractor and client see all payments in full detail
// Worker sees own payments only + overall project payment progress
export function filterPayments(payments, role, workerId, allPaymentIds) {
  if (role === ROLE.CONTRACTOR || role === ROLE.CLIENT) return payments;
  // Worker: own payments + overall progress
  return {
    own: payments.own.filter(p => p.worker_id === workerId),
    overall: {
      paid: payments.overall.paid,
      total: payments.overall.total
    }
  };
}

// Transaction history filter
// Project-level full history for contractor and client
// Own transactions only for worker
export function filterTransactionHistory(transactions, role, workerId) {
  if (role === ROLE.CONTRACTOR || role === ROLE.CLIENT) return transactions;
  // Worker: own transactions only
  return transactions.filter(t => t.worker_id === workerId);
}

// Expense filter
// Contractor: all expenses with details
// Worker: own expenses or project summary total
// Client: all expenses with details
export function filterExpenses(expenses, role, workerId) {
  if (role === ROLE.CONTRACTOR) return expenses;
  if (role === ROLE.CLIENT) return expenses;
  // Worker: own expenses
  return expenses.filter(e => e.worker_id === workerId);
}

// Project members filter (for sidebar/showing CAN SEE column)
export function filterProjectMembers(members, role) {
  if (role === ROLE.CONTRACTOR) {
    return members.map(m => ({ ...m, canSee: 'Full breakdown' }));
  }
  if (role === ROLE.CLIENT) {
    return members.map(m => ({ ...m, canSee: 'Full breakdown' }));
  }
  // Worker: own allocation + totals
  return members.map(m => ({ 
    ...m, 
    canSee: 'Own allocation + totals',
    isOwnAllocation: m.role === req.auth.role 
  }));
}
