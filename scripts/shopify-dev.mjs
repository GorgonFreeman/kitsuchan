/**
 * Runs `shopify app dev` with `--tunnel-url` from HOST in `.env`.
 *
 * Do not run this under `concurrently` with other tools: the Shopify CLI needs
 * a normal TTY for login and prompts. Run `npm run shopify:dev` in its own
 * terminal alongside `npm run dev` (and `npm run tunnel` when you use cloudflared).
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const raw = readFileSync(join(root, '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[ key ] = val;
  }
} catch (err) {
  console.error('scripts/shopify-dev.mjs: could not read .env:', err.message);
  process.exit(1);
}

let host = process.env.HOST?.replace(/\/$/, '');
if (!host) {
  console.error('scripts/shopify-dev.mjs: set HOST in .env (public HTTPS URL of your tunnel).');
  process.exit(1);
}

const child = spawn(
  'npx',
  [
    '--yes',
    '@shopify/cli@latest',
    'app',
    'dev',
    `--tunnel-url=${ host }`,
  ],
  { stdio: 'inherit', shell: true, cwd: root },
);

child.on('exit', (code) => process.exit(code ?? 0));
