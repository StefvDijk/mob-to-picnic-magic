import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { createBootstrapSql, parseArgs, validateTarget } from '../scripts/bootstrap-admin.mjs';

const valid = ['--env', 'development', '--email', 'Admin@Example.com'];
const remoteConfig = {
  d1_databases: [{ binding: 'DB', database_name: 'local' }],
  env: {
    test: { d1_databases: [{ binding: 'DB', database_name: 'test' }] },
    production: { d1_databases: [{ binding: 'DB', database_name: 'prod', database_id: '123e4567-e89b-42d3-a456-426614174000' }] },
  },
};

test('CLI defaults to dry-run and refuses unsafe remote targets', () => {
  assert.equal(parseArgs(valid).apply, false);
  assert.equal(parseArgs([...valid, '--apply']).apply, true);
  assert.throws(() => parseArgs(['--env', 'production', '--email', 'admin@example.com']), /requires --remote/);
  assert.throws(() => parseArgs(['--env', 'test', '--email', 'admin@example.com', '--remote']), /database-id is required/);
  const options = parseArgs(['--env', 'production', '--email', 'admin@example.com', '--remote', '--database-id', '123e4567-e89b-42d3-a456-426614174000']);
  assert.throws(() => validateTarget({ ...options, 'database-id': 'REPLACE_WITH_PROVISIONED_D1_ID' }, remoteConfig), /does not match/);
  assert.throws(() => validateTarget(options, { ...remoteConfig, env: { production: { d1_databases: [{ binding: 'DB', database_id: 'REPLACE_WITH_PROVISIONED_D1_ID' }] } } }), /no provisioned D1 UUID/);
  const remoteDevelopment = parseArgs(['--env', 'development', '--email', 'admin@example.com', '--remote', '--database-id', '123e4567-e89b-42d3-a456-426614174000']);
  assert.equal(validateTarget(remoteDevelopment, { ...remoteConfig, d1_databases: [{ binding: 'DB', database_id: '123e4567-e89b-42d3-a456-426614174000' }] }), 'DB');
  const remoteTest = parseArgs(['--env', 'test', '--email', 'admin@example.com', '--remote', '--database-id', '123e4567-e89b-42d3-a456-426614174000']);
  assert.equal(validateTarget(remoteTest, { ...remoteConfig, env: { ...remoteConfig.env, test: { d1_databases: [{ binding: 'DB', database_id: '123e4567-e89b-42d3-a456-426614174000' }] } } }), 'DB');
  assert.throws(() => validateTarget(remoteTest, remoteConfig), /no provisioned D1 UUID/);
  assert.equal(parseArgs(valid).email, 'admin@example.com');
});

test('local test bootstrap rejects a shared development database identity', () => {
  const options = parseArgs(['--env', 'test', '--email', 'fixture@example.invalid']);
  assert.throws(() => validateTarget(options, remoteConfig), /must be isolated/);
  const isolated = { ...remoteConfig, env: { ...remoteConfig.env,
    test: { d1_databases: [{ binding: 'DB', preview_database_id: 'picnic-test-local' }] } } };
  assert.equal(validateTarget(options, isolated), 'DB');
});

async function newIsolatedDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  return db;
}

function applyBatch(db, email, id) {
  const sql = createBootstrapSql({ id, email, name: "First Admin's Name", now: 1_800_000_000_123 });
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

async function assertOneAdmin(db, id) {
  const userRows = db.prepare('SELECT id,name,email,emailVerified,createdAt,updatedAt FROM user').all();
  const accountRows = db.prepare('SELECT id,email,role,status,invitation_id,created_at,updated_at FROM app_accounts').all();
  assert.equal(userRows.length, 1);
  assert.equal(accountRows.length, 1);
  assert.equal(userRows[0].id, id);
  assert.equal(userRows[0].name, "First Admin's Name");
  assert.equal(userRows[0].email, 'admin@example.com');
  assert.equal(userRows[0].emailVerified, 0);
  assert.equal(userRows[0].createdAt, '2027-01-15T08:00:00.123Z');
  assert.equal(userRows[0].updatedAt, '2027-01-15T08:00:00.123Z');
  assert.equal(accountRows[0].id, id);
  assert.equal(accountRows[0].role, 'admin');
  assert.equal(accountRows[0].status, 'active');
}

test('sequential batches create exactly one linked first admin', async () => {
  const db = await newIsolatedDatabase();
  try {
    applyBatch(db, 'admin@example.com', '123e4567-e89b-42d3-a456-426614174000');
    applyBatch(db, 'another@example.com', '123e4567-e89b-42d3-a456-426614174001');
    await assertOneAdmin(db, '123e4567-e89b-42d3-a456-426614174000');
  } finally {
    db.close();
  }
});

test('an existing native user blocks bootstrap without adding an app account', async () => {
  const db = await newIsolatedDatabase();
  try {
    db.prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)')
      .run('123e4567-e89b-42d3-a456-426614174009', 'Existing', 'existing@example.com', 0, '2027-01-15T08:00:00.123Z', '2027-01-15T08:00:00.123Z');
    applyBatch(db, 'admin@example.com', '123e4567-e89b-42d3-a456-426614174000');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM app_accounts').get().count, 0);
  } finally {
    db.close();
  }
});

test('a failed second insert rolls back the native user', async () => {
  const db = await newIsolatedDatabase();
  try {
    db.exec("CREATE TRIGGER bootstrap_test_fail BEFORE INSERT ON app_accounts BEGIN SELECT RAISE(ABORT, 'blocked'); END");
    assert.throws(() => applyBatch(db, 'admin@example.com', '123e4567-e89b-42d3-a456-426614174000'), /blocked/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM app_accounts').get().count, 0);
  } finally {
    db.close();
  }
});

test('racing batches serialize without leaving an orphan or second account', async () => {
  const dbPath = `/tmp/picnic-bootstrap-race-${process.pid}-${Date.now()}.sqlite`;
  const db = new DatabaseSync(dbPath);
  db.exec(await readFile(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  const attempts = [
    ['admin@example.com', '123e4567-e89b-42d3-a456-426614174000'],
    ['another@example.com', '123e4567-e89b-42d3-a456-426614174001'],
  ];
  try {
    const sql = attempts.map(([email, id]) => createBootstrapSql({ id, email, name: 'Beheerder', now: 1_800_000_000_123 }));
    const workerSource = `
      import { parentPort, workerData } from 'node:worker_threads';
      import { DatabaseSync } from 'node:sqlite';
      const db = new DatabaseSync(workerData.path);
      db.exec('PRAGMA busy_timeout=5000');
      try { db.exec('BEGIN IMMEDIATE;' + workerData.sql + 'COMMIT;'); parentPort.postMessage('ok'); }
      catch (error) { parentPort.postMessage({ error: error.message }); }
      finally { db.close(); }
    `;
    await Promise.all(sql.map((statement) => new Promise((resolve, reject) => {
      const worker = new Worker(workerSource, { eval: true, workerData: { path: dbPath, sql: statement } });
      worker.once('message', (message) => message === 'ok' ? resolve() : reject(new Error('Concurrent bootstrap transaction failed')));
      worker.once('error', reject);
    })));
    const userCount = db.prepare('SELECT COUNT(*) AS count FROM user').get().count;
    const accountCount = db.prepare('SELECT COUNT(*) AS count FROM app_accounts').get().count;
    assert.equal(userCount, 1);
    assert.equal(accountCount, 1);
    const created = db.prepare('SELECT id FROM user').get().id;
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM app_accounts WHERE id=?').get(created).count, 1);
  } finally {
    db.close();
    const { unlink } = await import('node:fs/promises');
    await unlink(dbPath).catch(() => {});
  }
});
