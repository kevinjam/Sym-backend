'use strict';

const User = require('../models/User');

/**
 * Gate for destructive user-management endpoints.
 *
 * The role in the JWT is not enough: the flag is re-read from the database on
 * every call so that revoking super-admin access takes effect immediately,
 * without waiting for the token to expire.
 */
async function requireSuperAdmin(req, res, next) {
  try {
    const me = await User.findById(req.user?.id).select('role isSuperAdmin isActive');
    if (!me || me.role !== 'admin' || me.isActive === false || me.isSuperAdmin !== true) {
      return res.status(403).json({ success: false, error: 'Super admin access required.' });
    }
    return next();
  } catch (err) {
    console.error('[requireSuperAdmin]', err);
    return res.status(500).json({ success: false, error: 'Unable to verify permissions.' });
  }
}

module.exports = { requireSuperAdmin };
