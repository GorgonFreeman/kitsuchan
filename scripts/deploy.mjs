#!/usr/bin/env node
/**
 * `npm run deploy`
 * 1) Resolve public app URL (GCP_PUBLIC_APP_URL > current Cloud Run URL > deterministic *.run.app).
 * 2) Build --set-env-vars from .env, minus PORT and GCP_*; add HOST=<public>.
 * 3) gcloud run deploy --source . (Dockerfile-based) with --allow-unauthenticated.
 * 4) Read the actual deployed URL; warn if different from prediction.
 * 5) Patch shopify.app.toml application_url + [auth].redirect_urls in place.
 * 6) shopify app deploy --allow-updates so Partners + extensions match the live URL.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const tomlPath = join(root, 'shopify.app.toml');

const project = process.env.GCP_PROJECT?.trim();
const region = (process.env.GCP_REGION ?? 'us-central1').trim();
if (!project) {
  console.error('Set GCP_PROJECT in .env');
  process.exit(1);
}

const service = readServiceName();
const predictedUrl = resolvePublicUrl({ project, region, service });
if (!predictedUrl) {
  console.error('Could not resolve public URL — set GCP_PUBLIC_APP_URL in .env or check `gcloud auth login`.');
  process.exit(1);
}
console.log('predictedUrl', predictedUrl);

const setEnvVars = buildSetEnvVars(predictedUrl);

const deployRes = spawnSync(
  'gcloud',
  [
    'run', 'deploy', service,
    '--project', project,
    '--region', region,
    '--source', root,
    '--allow-unauthenticated',
    '--set-env-vars', setEnvVars,
  ],
  { stdio: 'inherit', cwd: root },
);
if (deployRes.status !== 0) {
  process.exit(deployRes.status ?? 1);
}

const actualUrl = describeServiceUrl({ project, region, service });
const publicUrl = (actualUrl || predictedUrl).replace(/\/+$/u, '');
if (actualUrl && actualUrl !== predictedUrl) {
  console.warn(`actualUrl differs from predictedUrl. Using ${ publicUrl } for shopify.app.toml.`);
}

writeShopifyAppToml(publicUrl);
console.log('shopifyAppToml updated:', `${ publicUrl }/`);

const shopifyRes = spawnSync(
  'npm',
  [ 'exec', '--', 'shopify', 'app', 'deploy', '--allow-updates' ],
  { stdio: 'inherit', cwd: root, shell: false },
);
if (shopifyRes.status !== 0) {
  console.error('shopify app deploy failed (Cloud Run already updated).');
  process.exit(shopifyRes.status ?? 1);
}

function readServiceName() {
  const fromEnv = process.env.GCP_SERVICE?.trim();
  if (fromEnv) return fromEnv;
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    if (typeof pkg.name === 'string' && pkg.name.length > 0) return pkg.name;
  } catch {
    /* fall through */
  }
  return 'app';
}

function resolvePublicUrl({ project, region, service }) {
  const fromEnv = process.env.GCP_PUBLIC_APP_URL?.trim().replace(/\/+$/u, '');
  if (fromEnv) return fromEnv;

  const existing = describeServiceUrl({ project, region, service });
  if (existing) return existing;

  const num = spawnSync(
    'gcloud',
    [ 'projects', 'describe', project, '--format', 'value(projectNumber)' ],
    { encoding: 'utf8', cwd: root },
  );
  if (num.status !== 0 || !num.stdout?.trim()) return '';
  return `https://${ service }-${ num.stdout.trim() }.${ region }.run.app`;
}

function describeServiceUrl({ project, region, service }) {
  const r = spawnSync(
    'gcloud',
    [ 'run', 'services', 'describe', service, '--project', project, '--region', region, '--format', 'value(status.url)' ],
    { encoding: 'utf8', cwd: root },
  );
  if (r.status === 0 && r.stdout?.trim()) {
    return r.stdout.trim().replace(/\/+$/u, '');
  }
  return '';
}

function buildSetEnvVars(publicUrl) {
  const exclude = new Set([
    'PORT', 'HOST',
    'GCP_PROJECT', 'GCP_REGION', 'GCP_SERVICE', 'GCP_PUBLIC_APP_URL',
  ]);
  const pairs = [];
  if (existsSync(envPath)) {
    for (const [ k, v ] of parseEnv(readFileSync(envPath, 'utf8'))) {
      if (exclude.has(k)) continue;
      if (!v) continue;
      pairs.push([ k, v ]);
    }
  }
  pairs.push([ 'HOST', publicUrl ]);
  return formatGcloudEnvVars(pairs);
}

/** Tiny dotenv parser: ignore comments/blank, strip surrounding quotes. */
function parseEnv(contents) {
  const out = new Map();
  for (const line of contents.split(/\r?\n/u)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    out.set(key, val);
  }
  return out;
}

/** gcloud --set-env-vars: comma between pairs; switch to ^###^ delimiter when values contain commas. */
function formatGcloudEnvVars(pairs) {
  const needsAlt = pairs.length > 1 || pairs.some(([ , v ]) => v.includes(','));
  const join = (delim) => pairs.map(([ k, v ]) => `${ k }=${ v }`).join(delim);
  if (!needsAlt) return join(',');
  const blob = pairs.map(([ k, v ]) => `${ k }${ v }`).join('');
  let n = 3;
  let delim = '#'.repeat(n);
  while (blob.includes(delim) && n < 64) {
    n += 1;
    delim = '#'.repeat(n);
  }
  return `^${ delim }^${ join(delim) }`;
}

function writeShopifyAppToml(publicUrl) {
  const appUrl = `${ publicUrl }/`;
  const callback = `${ publicUrl }/auth/callback`;
  const raw = readFileSync(tomlPath, 'utf8');
  const next = raw
    .replace(/application_url\s*=\s*['"][^'"]*['"]/u, `application_url = '${ appUrl }'`)
    .replace(
      /(\[auth\][^\[]*?)redirect_urls\s*=\s*\[[\s\S]*?\]/u,
      `$1redirect_urls = [\n  '${ callback }',\n]`,
    );
  writeFileSync(tomlPath, next, 'utf8');
}
