/**
 * One-time: copy every collection from MongoDB `test` → `sym_db` without deleting source.
 *
 * Usage (from backend/):
 *   node scripts/migrate-test-to-sym-db.js
 *
 * Safe defaults:
 * - Does not drop `test`
 * - Skips documents that already exist in `sym_db` (same _id)
 * - Creates `sym_db` if missing
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const SOURCE_DB = process.env.MIGRATE_FROM_DB || 'test';
const TARGET_DB = process.env.MIGRATE_TO_DB || 'sym_db';

function withDbName(uri, dbName) {
  // Replace path db (or insert if missing) while keeping query string.
  const q = uri.indexOf('?');
  const base = q >= 0 ? uri.slice(0, q) : uri;
  const query = q >= 0 ? uri.slice(q) : '';
  const noSlash = base.replace(/\/$/, '');
  const afterHost = noSlash.replace(/^mongodb(\+srv)?:\/\/[^/]+/, '');
  const hostOnly = afterHost === '' || afterHost === '/';
  if (hostOnly) {
    return `${noSlash}/${dbName}${query}`;
  }
  return `${noSlash.replace(/\/[^/]*$/, `/${dbName}`)}${query}`;
}

async function main() {
  const raw = process.env.MONGODB_URI;
  if (!raw) {
    console.error('MONGODB_URI is missing in .env');
    process.exit(1);
  }

  // Connect without relying on default db — we pick source/target explicitly.
  const uri = withDbName(raw, SOURCE_DB);
  const client = new MongoClient(uri);

  console.log(`Connecting…`);
  console.log(`Source: ${SOURCE_DB}`);
  console.log(`Target: ${TARGET_DB}`);

  await client.connect();
  const source = client.db(SOURCE_DB);
  const target = client.db(TARGET_DB);

  const collections = await source.listCollections().toArray();
  if (collections.length === 0) {
    console.log(`No collections found in "${SOURCE_DB}". Nothing to migrate.`);
    await client.close();
    return;
  }

  let totalCopied = 0;
  let totalSkipped = 0;

  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;

    const srcCol = source.collection(name);
    const dstCol = target.collection(name);
    const count = await srcCol.countDocuments();
    console.log(`\n▸ ${name}: ${count} document(s)`);

    if (count === 0) continue;

    const cursor = srcCol.find({});
    let copied = 0;
    let skipped = 0;
    const batch = [];

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      batch.push(doc);
      if (batch.length >= 500) {
        const r = await insertIgnoreDupes(dstCol, batch);
        copied += r.copied;
        skipped += r.skipped;
        batch.length = 0;
      }
    }
    if (batch.length) {
      const r = await insertIgnoreDupes(dstCol, batch);
      copied += r.copied;
      skipped += r.skipped;
    }

    // Copy indexes (best-effort; skip _id_ default)
    try {
      const indexes = await srcCol.indexes();
      for (const idx of indexes) {
        if (idx.name === '_id_') continue;
        const { key, name: idxName, v, ns, ...options } = idx;
        try {
          await dstCol.createIndex(key, { ...options, name: idxName });
        } catch (e) {
          console.warn(`  index ${idxName}: ${e.message}`);
        }
      }
    } catch (e) {
      console.warn(`  could not copy indexes: ${e.message}`);
    }

    console.log(`  copied=${copied} skipped(existing)=${skipped}`);
    totalCopied += copied;
    totalSkipped += skipped;
  }

  console.log(`\nDone. copied=${totalCopied} skipped=${totalSkipped}`);
  console.log(
    `Verify in Compass: open "${TARGET_DB}". Keep "${SOURCE_DB}" until you confirm, then you may drop it.`,
  );
  await client.close();
}

async function insertIgnoreDupes(col, docs) {
  try {
    const res = await col.insertMany(docs, { ordered: false });
    return { copied: res.insertedCount, skipped: 0 };
  } catch (e) {
    // Bulk write with duplicate _id → some inserted, some skipped
    const inserted = e.result?.nInserted ?? e.insertedCount ?? 0;
    const writeErrors = e.writeErrors?.length ?? 0;
    return {
      copied: inserted,
      skipped: writeErrors || Math.max(0, docs.length - inserted),
    };
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
