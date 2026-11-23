// Hidden control helper
// Ensures hidden data is absent from responses (not blurred or disabled)
// This helper is called by route handlers to strip restricted fields
export function applyHiddenControl(data, role, restrictedFields) {
  const result = { ...data };
  
  restrictedFields.forEach(field => {
    if (result[field] !== undefined) {
      delete result[field];
    }
  });
  
  return result;
}
