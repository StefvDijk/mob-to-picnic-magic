#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, open, readFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..');
const CONFIG_PATH = resolve(PROJECT_ROOT, 'wrangler.jsonc');
const WRANGLER_ENTRY = resolve(PROJECT_ROOT, 'node_modules/wrangler/bin/wrangler.js');

export function parseArgs(args) {
  const options = { apply: false, remote: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply' || arg === '--remote') {
      const key = arg.slice(2);
      if (options[key]) throw new Error(`Duplicate flag: ${arg}`);
      options[key] = true;
      continue;
    }
    if (['--env', '--email', '--name', '--database-id'].includes(arg)) {
      if (options[arg.slice(2)] !== undefined) throw new Error(`Duplicate option: ${arg}`);
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error('Unknown option');
  }
  if (!['development', 'test', 'production'].includes(options.env)) {
    throw new Error('--env must be development, test, or production');
  }
  if (!options.email || options.email.length > 254 || /[\u0000-\u001f\u007f]/.test(options.email) || !EMAIL_PATTERN.test(options.email.trim())) {
    throw new Error('A valid --email is required');
  }
  options.email = options.email.trim().toLowerCase();
  options.name = (options.name ?? 'Beheerder').trim();
  if (!options.name || options.name.length > 120 || /[\u0000-\u001f\u007f]/.test(options.name)) {
    throw new Error('--name must contain 1 to 120 printable characters');
  }
  if (options['database-id'] !== undefined && !options.remote) throw new Error('--database-id requires --remote');
  if (options.env === 'production' && !options.remote) throw new Error('Production bootstrap requires --remote');
  if (options.remote && !options['database-id']) throw new Error('--database-id is required with --remote');
  return options;
}

export function getDatabaseId(config, environment) {
  const databases = environment === 'development' ? config.d1_databases ?? [] : config.env?.[environment]?.d1_databases ?? [];
  return databases.find((database) => database.binding === 'DB')?.database_id;
}

export function validateTarget(options, config) {
  const databases = options.env === 'development' ? config.d1_databases : config.env?.[options.env]?.d1_databases;
  if (!Array.isArray(databases) || !databases.some((database) => database.binding === 'DB')) throw new Error('Selected Wrangler environment has no DB binding');
  if (!options.remote && options.env === 'test') {
    const localIdentity = (entries) => {
      const entry = entries?.find((database) => database.binding === 'DB');
      return entry?.preview_database_id ?? entry?.database_id ?? entry?.binding;
    };
    if (localIdentity(databases) === localIdentity(config.d1_databases)) {
      throw new Error('Local test database must be isolated from development');
    }
  }
  if (options.remote) {
    const configuredId = getDatabaseId(config, options.env);
    if (!configuredId || !UUID_PATTERN.test(configuredId)) {
      throw new Error('Selected Wrangler environment has no provisioned D1 UUID');
    }
    if (options['database-id'] !== configuredId) {
      throw new Error('--database-id does not match the selected Wrangler environment');
    }
  }
  return 'DB';
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function createBootstrapSql({ id, email, name, now = Date.now() }) {
  if (!UUID_PATTERN.test(id)) throw new Error('Generated account id is invalid');
  const normalizedEmail = email.trim().toLowerCase();
  const displayName = name.trim();
  const iso = new Date(now).toISOString();
  const nativeDate = sqlString(iso);
  const appTime = Math.trunc(now);
  return `INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt)
SELECT ${sqlString(id)},${sqlString(displayName)},${sqlString(normalizedEmail)},0,${nativeDate},${nativeDate}
WHERE NOT EXISTS (SELECT 1 FROM user) AND NOT EXISTS (SELECT 1 FROM app_accounts);
INSERT INTO app_accounts(id,email,role,status,invitation_id,created_at,updated_at)
SELECT u.id,${sqlString(normalizedEmail)},'admin','active',NULL,${appTime},${appTime}
FROM user u WHERE u.id=${sqlString(id)} AND NOT EXISTS (SELECT 1 FROM app_accounts);`;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function runWrangler(args, logPath) {
  const result = spawnSync(process.execPath, [WRANGLER_ENTRY, 'd1', 'execute', 'DB', ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
      WRANGLER_LOG_PATH: logPath,
      WRANGLER_SEND_METRICS: 'false',
    },
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error('Wrangler D1 command failed');
  return result.stdout;
}

function readJsonResult(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    const envelopes = Array.isArray(parsed) ? parsed : [parsed];
    const rows = envelopes.flatMap((envelope) => envelope?.results ?? envelope?.result?.results ?? []);
    if (!rows.length) throw new Error();
    return rows[0];
  } catch {
    throw new Error('Could not read Wrangler D1 query result');
  }
}

async function readConfig() {
  const content = await readFile(CONFIG_PATH, 'utf8');
  const result = ts.parseConfigFileTextToJson('wrangler.jsonc', content);
  if (result.error) throw new Error('Could not parse wrangler.jsonc');
  return result.config;
}

function targetArgs(options) {
  return ['--config', CONFIG_PATH, ...(options.env === 'development' ? [] : ['--env', options.env]),
    ...(options.remote ? ['--remote'] : ['--local']),
  ];
}

function preflightSql() {
  return 'SELECT (SELECT COUNT(*) FROM user) AS user_count, (SELECT COUNT(*) FROM app_accounts) AS account_count';
}

async function writePrivateSql(sql) {
  const path = join(tmpdir(), `picnic-bootstrap-${randomUUID()}.sql`);
  let file;
  let created = false;
  let written = false;
  try {
    file = await open(path, 'wx', 0o600);
    created = true;
    await file.writeFile(sql, 'utf8');
    written = true;
    return path;
  } catch {
    throw new Error('Could not prepare private SQL file');
  } finally {
    await file?.close().catch(() => {});
    if (created && !written) await unlink(path).catch(() => {});
  }
}

async function main(args) {
  let options;
  let logPath;
  try {
    options = parseArgs(args);
    const config = await readConfig();
    validateTarget(options, config);
    logPath = await mkdtemp(join(tmpdir(), 'picnic-bootstrap-wrangler-'));
    await chmod(logPath, 0o700);
    const target = targetArgs(options);
    const preflight = readJsonResult(runWrangler([...target, '--command', preflightSql(), '--json'], logPath));
    if (Number(preflight.user_count) !== 0 || Number(preflight.account_count) !== 0) {
      throw new Error('Bootstrap requires an empty native user table and app_accounts table');
    }
    if (!options.apply) {
      process.stdout.write(`Dry run: ${options.env} D1 is empty; rerun with --apply to create the first admin.\n`);
      return;
    }

    const id = randomUUID();
    const sqlFile = await writePrivateSql(createBootstrapSql({ id, email: options.email, name: options.name }));
    try {
      runWrangler([...target, '--file', sqlFile, ...(options.remote ? ['--yes'] : [])], logPath);
    } finally {
      await unlink(sqlFile).catch(() => {});
    }

    const verification = readJsonResult(runWrangler([...target, '--command', `SELECT
      (SELECT COUNT(*) FROM user) AS user_count,
      (SELECT COUNT(*) FROM app_accounts) AS account_count,
      (SELECT email FROM user WHERE id=${sqlString(id)} AND emailVerified=0 AND createdAt GLOB '????-??-??T*Z' AND updatedAt GLOB '????-??-??T*Z') AS native_email,
      (SELECT email FROM app_accounts WHERE id=${sqlString(id)} AND role='admin' AND status='active' AND invitation_id IS NULL) AS account_email`, '--json'], logPath));
    if (Number(verification.user_count) !== 1 || Number(verification.account_count) !== 1 ||
      verification.native_email !== options.email || verification.account_email !== options.email) {
      throw new Error('Post-write verification failed; inspect the database before retrying');
    }
    process.stdout.write('First admin created and verified. Complete email OTP verification through the normal sign-in flow.\n');
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Bootstrap failed');
  } finally {
    if (logPath) await rm(logPath, { recursive: true, force: true }).catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
