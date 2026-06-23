#!/usr/bin/env node
/**
 * `npm run deploy`
 *
 * Cloud Run gives every service two valid URLs (both route to the same revision):
 *   • Canonical: https://SERVICE-PROJECTNUMBER.REGION.run.app    (preferred — predictable)
 *   • Legacy:    https://SERVICE-RANDOMHASH-REGIONCODE.a.run.app (older format; still active)
 * `gcloud run services describe` may report either as `status.url` depending on service age and
 * gcloud version. Shopify Partners only redirects to URLs we register, so we must always pick
 * the same one — this script always picks the canonical project-number form.
 *
 * Steps:
 * 1) Resolve canonical URL: GCP_PUBLIC_APP_URL > project-number form found in
 *    `status.url` / `status.urls[]` / `run.googleapis.com/urls` > regex-matched canonical-shape
 *    URL > constructed from project number.
 * 2) Build --set-env-vars from .env (minus PORT, HOST, GCP_*), append HOST=<canonical>.
 * 3) gcloud run deploy --source . with --allow-unauthenticated.
 * 4) Re-resolve canonical URL post-deploy; bail if absent.
 * 5) If canonical URL ≠ host used for deploy, `gcloud run services update --update-env-vars=HOST=…`.
 * 6) Patch shopify.app.toml application_url + [auth].redirect_urls.
 * 7) `shopify app deploy --allow-updates` so Partners matches the live URL.
 *
 * GCP_REGION must match the Cloud Run region (default us-central1 is wrong for AU services).
 * `shopify.app.toml` has `automatically_update_urls_on_dev = true`, so `shopify app dev` rewrites
 * URLs to the dev tunnel; this flow restores them to production on release.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
console.log('gcloud target', { project, region, service });

const hostForDeploy = resolvePublicUrl({ project, region, service });
if (!hostForDeploy) {
  console.error('Could not resolve public URL — set GCP_PUBLIC_APP_URL in .env or check `gcloud auth login`.');
  process.exit(1);
}
console.log('hostForDeploy (HOST + OAuth base before deploy)', hostForDeploy);

const setEnvVars = buildSetEnvVars(hostForDeploy);

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

const publicUrl = resolvePublicUrl({ project, region, service });
if (!publicUrl) {
  console.error(
    'After deploy, gcloud could not derive a public URL for this service. '
      + 'Fix GCP_REGION (must match Cloud Run region, e.g. australia-southeast1), GCP_SERVICE (Cloud Run service name), '
      + 'and GCP_PROJECT, or set GCP_PUBLIC_APP_URL to the exact https://… URL and redeploy.',
  );
  process.exit(1);
}
console.log('publicUrl (canonical, used for shopify.app.toml + HOST)', publicUrl);

if (publicUrl !== hostForDeploy) {
  console.warn(
    `Canonical URL changed between pre-deploy resolution and post-deploy: deploy=${ hostForDeploy } actual=${ publicUrl }`,
  );
  console.warn('Syncing HOST on the Cloud Run service to the canonical URL.');
  const updateHost = spawnSync(
    'gcloud',
    [
      'run', 'services', 'update', service,
      '--project', project,
      '--region', region,
      `--update-env-vars=HOST=${ publicUrl }`,
    ],
    { stdio: 'inherit', cwd: root },
  );
  if (updateHost.status !== 0) {
    console.error('gcloud run services update failed; set HOST to the canonical URL in Cloud Run console.');
    process.exit(updateHost.status ?? 1);
  }
}

writeShopifyAppToml(publicUrl);
console.log('shopifyAppToml updated:', `${ publicUrl }/`);

installDependencies();

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

function fetchProjectNumber(project) {
  const r = spawnSync(
    'gcloud',
    [ 'projects', 'describe', project, '--format', 'value(projectNumber)' ],
    { encoding: 'utf8', cwd: root },
  );
  if (r.status !== 0) {
    if (r.stderr?.trim()) console.error(r.stderr.trim());
    return '';
  }
  return r.stdout?.trim() ?? '';
}

/**
 * All URLs gcloud knows about for this service: `status.url`, `status.urls[]`,
 * and the JSON-encoded `metadata.annotations['run.googleapis.com/urls']`.
 * Older services advertise the legacy hash URL in `status.url` while still listing
 * the canonical project-number URL in the annotation, so we have to read both.
 */
function fetchServiceUrls({ project, region, service }) {
  const r = spawnSync(
    'gcloud',
    [ 'run', 'services', 'describe', service, '--project', project, '--region', region, '--format', 'json' ],
    { encoding: 'utf8', cwd: root },
  );
  if (r.status !== 0) {
    if (r.stderr?.trim()) console.error(r.stderr.trim());
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout ?? '');
  } catch {
    return [];
  }
  const out = new Set();
  if (parsed?.status?.url) out.add(parsed.status.url);
  for (const u of parsed?.status?.urls ?? []) out.add(u);
  const ann = parsed?.metadata?.annotations?.[ 'run.googleapis.com/urls' ];
  if (typeof ann === 'string') {
    try {
      const list = JSON.parse(ann);
      if (Array.isArray(list)) for (const u of list) out.add(u);
    } catch {
      /* ignore malformed annotation */
    }
  }
  return [ ...out ].map((u) => String(u).replace(/\/+$/u, ''));
}

const canonicalUrlRe = /^https:\/\/[^./]+-\d{3,}\.[a-z0-9-]+\.run\.app$/u;

function pickCanonicalUrl({ urls, projectNumber, region, service }) {
  const expected = projectNumber
    ? `https://${ service }-${ projectNumber }.${ region }.run.app`
    : '';
  if (expected && urls.includes(expected)) return expected;
  const fromList = urls.find((u) => canonicalUrlRe.test(u));
  if (fromList) return fromList;
  if (expected) return expected;
  return urls[ 0 ] ?? '';
}

function resolvePublicUrl({ project, region, service }) {
  const fromEnv = process.env.GCP_PUBLIC_APP_URL?.trim().replace(/\/+$/u, '');
  if (fromEnv) return fromEnv;
  const projectNumber = fetchProjectNumber(project);
  const urls = fetchServiceUrls({ project, region, service });
  const canonical = pickCanonicalUrl({ urls, projectNumber, region, service });
  if (urls.length > 0) {
    const others = urls.filter((u) => u !== canonical);
    if (others.length > 0) {
      console.log('cloudRunUrls (alternates available)', others);
    }
  }
  return canonical;
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

/** Shopify CLI type-checks UI extensions against @shopify/ui-extensions at deploy time. */
function installDependencies() {
  console.log('Installing npm dependencies for shopify app deploy…');
  const rootInstall = spawnSync('npm', [ 'ci' ], { stdio: 'inherit', cwd: root, shell: false });
  if (rootInstall.status !== 0) {
    process.exit(rootInstall.status ?? 1);
  }

  const extensionsDir = join(root, 'extensions');
  if (!existsSync(extensionsDir)) return;

  for (const entry of readdirSync(extensionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const extRoot = join(extensionsDir, entry.name);
    if (!existsSync(join(extRoot, 'package-lock.json'))) continue;
    console.log('Installing extension dependencies:', entry.name);
    const extInstall = spawnSync('npm', [ 'ci' ], { stdio: 'inherit', cwd: extRoot, shell: false });
    if (extInstall.status !== 0) {
      process.exit(extInstall.status ?? 1);
    }
  }
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
