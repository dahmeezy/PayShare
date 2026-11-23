// Role check middleware
// Verifies that the authenticated user has permission to access the requested resource
import { ROLE } from "./role-constants.mjs";
import { filterContractorCompensation, filterWorkerAllocations, filterPayments, filterExpenses } from "./role-constants.mjs";

export function roleCheck(allowedRoles, resourceRole) {
  return (req, res, next) => {
    // Check if user's role is in allowed list
    if (!allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({ 
        error: "Forbidden",
        message: "You don't have permission to access this resource"
      });
    }
    
    // Apply role-specific data filtering based on the resource
    if (resourceRole === 'contractor_comp') {
      // Contractor compensation hidden from workers
      if (req.auth.role === ROLE.WORKER) {
        // The data has already been filtered in the store layer
        // Just ensure it's null in the response
        res.locals.filterContractorComp = true;
      }
    }
    
    if (resourceRole === 'worker_allocations') {
      // Worker allocations filtered based on role
      if (req.auth.role === ROLE.WORKER) {
        res.locals.filterWorkerAllocations = true;
      }
    }
    
    next();
  };
}
