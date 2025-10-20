const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * HIPAA Compliance Middleware
 * 
 * This middleware ensures that all API requests comply with HIPAA requirements:
 * - Secure headers for data protection
 * - Audit logging for PHI access
 * - Encryption verification
 * - Access control validation
 */

// HIPAA-compliant security headers
const addSecurityHeaders = (req, res, next) => {
  // Prevent caching of sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Security headers for HIPAA compliance
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // HIPAA-specific headers
  res.setHeader('X-HIPAA-Compliant', 'true');
  res.setHeader('X-Data-Classification', 'PHI');
  
  next();
};

// Audit logging for PHI access
const auditPHIAccess = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Log PHI access after response is sent
    if (req.user && isPHIEndpoint(req.path)) {
      logPHIAccess({
        userId: req.user._id,
        userRole: req.user.role,
        endpoint: req.path,
        method: req.method,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        timestamp: new Date(),
        statusCode: res.statusCode,
        requestId: req.requestId || generateRequestId(),
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

// Check if endpoint contains PHI
const isPHIEndpoint = (path) => {
  const phiEndpoints = [
    '/api/medications',
    '/api/symptoms',
    '/api/health-reports',
    '/api/ai-scanner',
    '/api/prescriptions',
    '/api/appointments',
    '/api/patients',
    '/api/doctors',
    '/api/user/profile',
  ];
  
  return phiEndpoints.some(endpoint => path.startsWith(endpoint));
};

// Log PHI access for audit trail
const logPHIAccess = (accessData) => {
  try {
    // In production, this should be logged to a secure audit database
    console.log('📋 [HIPAA_AUDIT] PHI Access:', {
      timestamp: accessData.timestamp.toISOString(),
      userId: accessData.userId,
      userRole: accessData.userRole,
      endpoint: accessData.endpoint,
      method: accessData.method,
      ipAddress: accessData.ipAddress,
      userAgent: accessData.userAgent,
      statusCode: accessData.statusCode,
      requestId: accessData.requestId,
    });
    
    // TODO: Store in secure audit database
    // await AuditLog.create(accessData);
  } catch (error) {
    console.error('📋 [HIPAA_AUDIT] Failed to log PHI access:', error);
  }
};

// Generate unique request ID for tracking
const generateRequestId = () => {
  return crypto.randomBytes(16).toString('hex');
};

// Validate encryption requirements
const validateEncryption = (req, res, next) => {
  // Ensure HTTPS in production
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.status(400).json({
      error: 'HTTPS required for HIPAA compliance',
      message: 'All requests must use HTTPS encryption'
    });
  }
  
  // Check for proper content-type headers
  if (req.method === 'POST' || req.method === 'PUT') {
    const contentType = req.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({
        error: 'Invalid content type',
        message: 'Content-Type must be application/json for HIPAA compliance'
      });
    }
  }
  
  next();
};

// Rate limiting for security
const rateLimit = (req, res, next) => {
  // Simple rate limiting - in production, use a proper rate limiting library
  const clientId = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 100; // Max requests per window
  
  // Initialize rate limit store if not exists
  if (!global.rateLimitStore) {
    global.rateLimitStore = new Map();
  }
  
  const clientData = global.rateLimitStore.get(clientId) || { count: 0, resetTime: now + windowMs };
  
  if (now > clientData.resetTime) {
    clientData.count = 0;
    clientData.resetTime = now + windowMs;
  }
  
  if (clientData.count >= maxRequests) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
    });
  }
  
  clientData.count++;
  global.rateLimitStore.set(clientId, clientData);
  
  next();
};

// Data sanitization for PHI
const sanitizePHI = (req, res, next) => {
  // Remove or mask sensitive data from logs
  if (req.body) {
    const sanitizedBody = sanitizeObject(req.body);
    req.sanitizedBody = sanitizedBody;
  }
  
  next();
};

// Sanitize object to remove sensitive data
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  const sensitiveFields = [
    'password',
    'ssn',
    'socialSecurityNumber',
    'creditCard',
    'bankAccount',
    'medicalRecordNumber',
    'patientId',
    'diagnosis',
    'medication',
    'symptoms',
  ];
  
  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

// Session security
const secureSession = (req, res, next) => {
  // Ensure secure session cookies
  if (req.session) {
    req.session.cookie.secure = process.env.NODE_ENV === 'production';
    req.session.cookie.httpOnly = true;
    req.session.cookie.sameSite = 'strict';
  }
  
  next();
};

// PHI data validation
const validatePHIData = (req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    const body = req.body;
    
    // Validate required fields for PHI
    if (isPHIEndpoint(req.path)) {
      if (!body || typeof body !== 'object') {
        return res.status(400).json({
          error: 'Invalid data format',
          message: 'PHI data must be in valid JSON format'
        });
      }
    }
  }
  
  next();
};

// Error handling for HIPAA compliance
const hipaaErrorHandler = (err, req, res, next) => {
  // Log error securely without exposing sensitive data
  console.error('📋 [HIPAA_ERROR]', {
    timestamp: new Date().toISOString(),
    error: err.message,
    stack: err.stack,
    endpoint: req.path,
    method: req.method,
    userId: req.user?._id,
    requestId: req.requestId,
  });
  
  // Return generic error message to client
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: 'An error occurred while processing your request',
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  addSecurityHeaders,
  auditPHIAccess,
  validateEncryption,
  rateLimit,
  sanitizePHI,
  secureSession,
  validatePHIData,
  hipaaErrorHandler,
  isPHIEndpoint,
  logPHIAccess,
  generateRequestId,
};
