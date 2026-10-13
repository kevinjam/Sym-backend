'use strict';

/**
 * Create (or promote) an admin account for the admin console.
 *
 *   ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='a-long-passphrase' \
 *     node scripts/create-admin.js [First] [Last]
 *
 * - New email  -> creates a local-login admin.
 * - Existing   -> sets role to "admin" (password is only changed if
 *                 ADMIN_PASSWORD is provided).
 * - Set SUPER_ADMIN=true to also grant super-admin rights (create / edit /
 *   delete users in the console). Omit it for a regular admin.
 * The password is read from the environment so it never lands in shell history
 * as a command-line argument.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const superAdmin = String(process.env.SUPER_ADMIN || '').toLowerCase() === 'true';
  const [firstName = 'Admin', lastName = 'User'] = process.argv.slice(2);

  if (!email) throw new Error('ADMIN_EMAIL is required');

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sym_medication_app';
  await mongoose.connect(uri);

  let user = await User.findOne({ email });
  if (!user) {
    if (password.length < 12) {
      throw new Error('ADMIN_PASSWORD (min 12 characters) is required for a new admin');
    }
    user = new User({
      email,
      password, // hashed by the User pre-save hook
      role: 'admin',
      firstName,
      lastName,
      emailVerified: true,
      hasAcceptedTerms: true,
      isActive: true,
      isSuperAdmin: superAdmin,
    });
    await user.save();
    console.log(`[admin] Created admin ${email}`);
  } else {
    user.role = 'admin';
    user.isActive = true;
    if (superAdmin) user.isSuperAdmin = true;
    if (password) {
      if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
      user.password = password;
    }
    await user.save();
    console.log(`[admin] Promoted ${email} to admin`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[admin] Failed:', err.message);
  process.exit(1);
});
