'use strict';

/**
 * Apple App Store verification (App Store Server API + Server Notifications V2).
 *
 * Required configuration (see env.example) — nothing is invented here:
 *   APPLE_BUNDLE_ID            default com.thinkdevs.sym
 *   APPLE_APP_ID               numeric Apple ID of the app (App Store Connect → App Information)
 *   APPLE_IAP_KEY_ID           In-App Purchase key ID
 *   APPLE_IAP_ISSUER_ID        Issuer ID
 *   APPLE_IAP_PRIVATE_KEY      contents of the .p8 (\n escaped) — or —
 *   APPLE_IAP_PRIVATE_KEY_PATH path to the .p8 (absolute, or relative to the backend root)
 *   APPLE_ROOT_CERTS_DIR       optional; folder with Apple's root CA certificates (.cer / .pem).
 *                              Relative paths resolve from the backend root; default certs/apple
 *
 * Production is tried first and Sandbox second, because App Review and TestFlight
 * purchases are sandbox transactions made against the production app.
 */

const fs = require('fs');
const path = require('path');
const {
  AppStoreServerAPIClient,
  APIException,
  Environment,
  SignedDataVerifier,
  Status,
  VerificationException,
  VerificationStatus,
} = require('@apple/app-store-server-library');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const GRACE_CAP_DAYS = 16; // Apple's maximum billing grace period
const DAY = 864e5;

function bundleId() {
  return String(process.env.APPLE_BUNDLE_ID || 'com.thinkdevs.sym').trim();
}

let warnedMissingKey = false;

function readPrivateKey() {
  const inline = String(process.env.APPLE_IAP_PRIVATE_KEY || '').trim();
  if (inline) return inline.replace(/\\n/g, '\n');
  const configured = String(process.env.APPLE_IAP_PRIVATE_KEY_PATH || '').trim();
  if (!configured) return '';
  const file = path.isAbsolute(configured)
    ? configured
    : path.resolve(BACKEND_ROOT, configured);
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    // Never let a bad key file crash a request: report "not configured" and say why.
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      const hint =
        err.code === 'EACCES'
          ? 'the user running this process cannot read it (chown it to that user, chmod 600)'
          : err.code === 'ENOENT'
            ? 'no file exists there'
            : err.message;
      console.warn(`[appStore] Cannot read APPLE_IAP_PRIVATE_KEY_PATH (${file}): ${hint}`);
    }
    return '';
  }
}

/** Where Apple's root certificates live. Defaults to <backend>/certs/apple. */
function rootCertsDir() {
  const configured = String(process.env.APPLE_ROOT_CERTS_DIR || '').trim();
  if (!configured) return path.join(BACKEND_ROOT, 'certs', 'apple');
  if (path.isAbsolute(configured)) return configured;
  return path.resolve(BACKEND_ROOT, configured);
}

function readRootCertificates() {
  const dir = rootCertsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(cer|pem|der|crt)$/i.test(f))
    .map((f) => fs.readFileSync(path.join(dir, f)));
}

function appAppleId() {
  const n = Number(process.env.APPLE_APP_ID);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Safe diagnostics for health checks / deploy logs (no secrets). */
function configStatus() {
  const keyId = Boolean(String(process.env.APPLE_IAP_KEY_ID || '').trim());
  const issuerId = Boolean(String(process.env.APPLE_IAP_ISSUER_ID || '').trim());
  const appId = appAppleId();
  const privateKeyPath = String(process.env.APPLE_IAP_PRIVATE_KEY_PATH || '').trim();
  const privateKeyInline = Boolean(String(process.env.APPLE_IAP_PRIVATE_KEY || '').trim());
  const key = readPrivateKey();
  const dir = rootCertsDir();
  const rootCerts = readRootCertificates();
  const dirExists = fs.existsSync(dir);
  return {
    keyId,
    issuerId,
    appAppleId: appId,
    privateKeyLoaded: Boolean(key),
    privateKeySource: privateKeyInline ? 'env' : privateKeyPath || null,
    rootCertsDir: dir,
    rootCertsDirExists: dirExists,
    rootCertCount: rootCerts.length,
    configured: Boolean(keyId && issuerId && key && rootCerts.length > 0 && appId),
    hints: [
      !keyId && 'Set APPLE_IAP_KEY_ID',
      !issuerId && 'Set APPLE_IAP_ISSUER_ID',
      !appId && 'Set APPLE_APP_ID (numeric App Store Connect app id)',
      !key &&
        (privateKeyPath
          ? `Cannot read IAP private key at ${path.isAbsolute(privateKeyPath) ? privateKeyPath : path.resolve(BACKEND_ROOT, privateKeyPath)}`
          : 'Set APPLE_IAP_PRIVATE_KEY_PATH or APPLE_IAP_PRIVATE_KEY'),
      rootCerts.length === 0 &&
        `No Apple root CA files (.cer/.pem) in ${dir} — run npm run fetch-apple-root-certs (the .p8 key alone is not enough)`,
      !dirExists && `Directory missing: ${dir}`,
    ].filter(Boolean),
  };
}

function isConfigured() {
  return configStatus().configured;
}

const clients = new Map();
const verifiers = new Map();

function envOf(name) {
  return name === 'sandbox' ? Environment.SANDBOX : Environment.PRODUCTION;
}

function client(name) {
  if (!clients.has(name)) {
    clients.set(
      name,
      new AppStoreServerAPIClient(
        readPrivateKey(),
        String(process.env.APPLE_IAP_KEY_ID),
        String(process.env.APPLE_IAP_ISSUER_ID),
        bundleId(),
        envOf(name)
      )
    );
  }
  return clients.get(name);
}

function verifier(name) {
  if (!verifiers.has(name)) {
    verifiers.set(
      name,
      new SignedDataVerifier(readRootCertificates(), true, envOf(name), bundleId(), appAppleId())
    );
  }
  return verifiers.get(name);
}

/** Turn Apple's decoded payloads into the provider-neutral shape. */
function normalize({ transaction, renewal, status, environment, now = Date.now() }) {
  const expiresAt = transaction.expiresDate ? new Date(transaction.expiresDate) : null;
  const revoked = transaction.revocationDate != null || status === Status.REVOKED;
  const isOnTrial =
    transaction.offerType === 1 && String(transaction.offerDiscountType || '') === 'FREE_TRIAL';
  const autoRenew = renewal ? renewal.autoRenewStatus === 1 : false;

  let state;
  let entitledUntil = expiresAt;
  if (revoked) {
    state = 'revoked';
  } else if (status === Status.BILLING_GRACE_PERIOD) {
    state = 'grace';
    const graceEnd = renewal?.gracePeriodExpiresDate
      ? new Date(renewal.gracePeriodExpiresDate)
      : expiresAt
        ? new Date(expiresAt.getTime() + GRACE_CAP_DAYS * DAY)
        : null;
    entitledUntil = graceEnd;
  } else if (status === Status.BILLING_RETRY) {
    state = 'billing_retry';
  } else if (status === Status.EXPIRED) {
    state = 'expired';
  } else if (status === Status.ACTIVE) {
    state = isOnTrial ? 'trial' : autoRenew ? 'active' : 'cancelled';
  } else {
    state = 'expired';
  }

  const entitledState = ['active', 'trial', 'grace', 'cancelled'].includes(state);
  const entitled = entitledState && Boolean(entitledUntil) && entitledUntil.getTime() > now;

  return {
    provider: 'apple',
    productId: transaction.productId,
    originalTransactionId: String(transaction.originalTransactionId || transaction.transactionId),
    latestTransactionId: String(transaction.transactionId || ''),
    state: entitled || !entitledState ? state : 'expired',
    entitled,
    isOnTrial: entitled && isOnTrial,
    autoRenew,
    expiresAt: entitledUntil,
    environment: String(transaction.environment || environment).toLowerCase() === 'sandbox' ? 'sandbox' : 'production',
    externalAccountId: transaction.appAccountToken || undefined,
    bundleId: transaction.bundleId,
  };
}

async function inEnvironments(fn) {
  let lastError;
  for (const name of ['production', 'sandbox']) {
    try {
      return await fn(name);
    } catch (err) {
      lastError = err;
      const notFound = err instanceof APIException && err.httpStatusCode === 404;
      const wrongEnv =
        err instanceof VerificationException && err.status === VerificationStatus.INVALID_ENVIRONMENT;
      if (!notFound && !wrongEnv) throw err;
    }
  }
  throw lastError;
}

/** Authoritative current state of the subscription a transaction belongs to. */
async function getSubscriptionState(transactionId) {
  return inEnvironments(async (name) => {
    const api = client(name);
    const ver = verifier(name);

    const info = await api.getTransactionInfo(String(transactionId));
    const tx = await ver.verifyAndDecodeTransaction(info.signedTransactionInfo);
    const original = tx.originalTransactionId || tx.transactionId;

    const statuses = await api.getAllSubscriptionStatuses(String(transactionId));
    const items = (statuses.data || []).flatMap((g) => g.lastTransactions || []);
    const match = items.find((i) => String(i.originalTransactionId) === String(original));

    if (!match) {
      return normalize({ transaction: tx, renewal: null, status: undefined, environment: name });
    }
    const latestTx = await ver.verifyAndDecodeTransaction(match.signedTransactionInfo);
    const renewal = match.signedRenewalInfo
      ? await ver.verifyAndDecodeRenewalInfo(match.signedRenewalInfo)
      : null;
    return normalize({ transaction: latestTx, renewal, status: match.status, environment: name });
  });
}

/** Verifies the JWS signature chain and decodes a Server Notification V2. */
async function decodeNotification(signedPayload) {
  return inEnvironments(async (name) => verifier(name).verifyAndDecodeNotification(signedPayload));
}

/** Verifies and decodes a signed transaction that arrived inside a notification. */
async function decodeTransaction(signedTransactionInfo) {
  return inEnvironments(async (name) => verifier(name).verifyAndDecodeTransaction(signedTransactionInfo));
}

module.exports = {
  rootCertsDir,
  readPrivateKey,
  readRootCertificates,
  configStatus,
  isConfigured,
  getSubscriptionState,
  decodeNotification,
  decodeTransaction,
  normalize,
  APIException,
  VerificationException,
};
