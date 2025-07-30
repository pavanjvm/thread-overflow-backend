export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  if (process.env.NODE_ENV === 'development') {
    console.log(`📨 ${req.method} ${req.originalUrl} - ${req.ip}`);
  }

  // Override res.json to log response time
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - start;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`📤 ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
    }
    
    return originalJson.call(this, data);
  };

  next();
};