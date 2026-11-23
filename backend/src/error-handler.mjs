// Global error handler for auth routes
// Ensures consistent error format and no sensitive data in responses

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  
  const status = error.status || 500;
  const message = status < 500 
    ? error.message 
    : 'Internal server error';
  
  // Never leak password hashes or salts in error responses
  const errorBody = {
    error: status,
    message,
  };
  
  // Add code property for client-side handling
  if (status === 401) errorBody.code = 'AUTH_ERROR';
  if (status === 429) errorBody.code = 'RATE_LIMITED';
  if (status === 400) errorBody.code = 'VALIDATION_ERROR';
  
  res.status(status).json(errorBody);
}
