// Response filter helper
// Filters response data based on user role
import { ROLE } from "./role-constants.mjs";
import { filterContractorCompensation, filterWorkerAllocations } from "./role-constants.mjs";

export function applyRoleFilters(responseData, role, overrides = {}) {
  const filtered = { ...responseData };
  
  // Filter contractor compensation for workers
  if (role === ROLE.WORKER && filtered.contractor_compensation !== undefined) {
    filtered.contractor_compensation = filterContractorCompensation(
      filtered.contractor_compensation, 
      role
    );
  }
  
  // Filter worker allocations
  if (role === ROLE.WORKER && filtered.allocations !== undefined) {
    filtered.allocations = filterWorkerAllocations(
      filtered.allocations, 
      role,
      overrides.workerId
    );
  }
  
  // Filter payments
  if (role === ROLE.WORKER && filtered.payments !== undefined) {
    filtered.payments = filterPayments(filtered.payments, role);
  }
  
  // Filter expenses
  if (role === ROLE.WORKER && filtered.expenses !== undefined) {
    filtered.expenses = filterExpenses(filtered.expenses, role);
  }
  
  // Apply any overrides
  return { ...filtered, ...overrides };
}
