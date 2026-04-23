const jwt = require('jsonwebtoken');

function extractBearerToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || typeof auth !== 'string') return null;
  if (!auth.startsWith('Bearer ')) return null;
  return auth.substring('Bearer '.length).trim();
}

function authenticateToken(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Authorization token missing' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = payload.userId || payload.id || payload.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    req.user = {
      _id: userId,
      id: userId,
      role: payload.role || 'patient',
      conditions: payload.conditions || [],
      email: payload.email,
    };
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired' });
    }
    return res.status(401).json({ error: 'Invalid access token' });
  }
}

function requirePatient(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!req.user.role || req.user.role === 'patient') {
    return next();
  }
  return res.status(403).json({ error: 'Patient role required' });
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
}

const requireDoctor = requireRole(['doctor']);
const requireAnyRole = requireRole(['patient', 'doctor']);

module.exports = {
  authenticateToken,
  requireRole,
  requirePatient,
  requireDoctor,
  requireAnyRole,
};