'use strict';

/**
 * Store product identifiers. Nothing is hardcoded: the IDs come from the
 * subscription products created in App Store Connect and Google Play Console.
 *
 *   APPLE_PRODUCT_MONTHLY / _ANNUAL / _LITE
 *   GOOGLE_PRODUCT_MONTHLY / _ANNUAL / _LITE
 *
 * The keys match the catalog `packageType` values in stripeService.
 */

const SUFFIX = { monthly: 'MONTHLY', annual: 'ANNUAL', annual_lite: 'LITE' };
const PREFIX = { apple: 'APPLE_PRODUCT_', google: 'GOOGLE_PRODUCT_' };

function read(name) {
  return String(process.env[name] || '').trim();
}

function productMap(provider) {
  const prefix = PREFIX[provider];
  if (!prefix) return {};
  const out = {};
  Object.entries(SUFFIX).forEach(([packageType, suffix]) => {
    const id = read(`${prefix}${suffix}`);
    if (id) out[packageType] = id;
  });
  return out;
}

function allowedProductIds(provider) {
  return new Set(Object.values(productMap(provider)));
}

function isKnownProduct(provider, productId) {
  return Boolean(productId) && allowedProductIds(provider).has(String(productId));
}

function packageTypeForProduct(provider, productId) {
  const map = productMap(provider);
  return Object.keys(map).find((type) => map[type] === String(productId)) || null;
}

/** The "Diet & exercise plans" tier only unlocks the lite feature set. */
function isLiteProduct(productId) {
  if (!productId) return false;
  const id = String(productId);
  return ['apple', 'google'].some((p) => productMap(p).annual_lite === id);
}

/**
 * Overlay store product IDs on the plan catalog. When a store's IDs are not
 * configured the catalog is left exactly as it was.
 */
function applyStoreIdsToCatalog(catalog) {
  const apple = productMap('apple');
  const google = productMap('google');
  if (!catalog || !Array.isArray(catalog.packages)) return catalog;
  return {
    ...catalog,
    packages: catalog.packages.map((pkg) => ({
      ...pkg,
      storeProductId: apple[pkg.packageType] || pkg.storeProductId,
      storeProductIdAndroid: google[pkg.packageType] || pkg.storeProductIdAndroid,
    })),
  };
}

module.exports = {
  productMap,
  allowedProductIds,
  isKnownProduct,
  packageTypeForProduct,
  isLiteProduct,
  applyStoreIdsToCatalog,
};
