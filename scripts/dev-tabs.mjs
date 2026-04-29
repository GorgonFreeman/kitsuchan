/**
 * Opens tunnel, embedded dev server, and Shopify CLI each in its own terminal tab
 * (macOS Terminal / iTerm via `ttab`, same idea as shopivibe).
 *
 * Requires Accessibility permission for Terminal/iTerm — see `ttab` readme.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ttabBin = join(root, 'node_modules', '.bin', 'ttab');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnTab(title, npmScript) {
  const argv = existsSync(ttabBin)
    ? [ttabBin, '-t', title, '-d', root, 'npm', 'run', npmScript]
    : ['npx', 'ttab', '-t', title, '-d', root, 'npm', 'run', npmScript];

  const child = spawn(argv[ 0 ], argv.slice(1), {
    stdio: 'inherit',
    cwd: root,
    shell: false,
  });

  return new Promise((resolve, reject) => {
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', reject);
  });
}

if (process.platform === 'win32') {
  console.error(
    '`npm run dev:tabs` uses ttab (macOS/Linux). On Windows, open three terminals and run: npm run tunnel | npm run dev | npm run shopify:dev',
  );
  process.exit(1);
}

console.log('Opening tabs (tunnel → dev → shopify) …\n');

await spawnTab('minishopi tunnel', 'tunnel');
await delay(450);
await spawnTab('minishopi dev', 'dev');
await delay(450);
await spawnTab('minishopi shopify', 'shopify:dev');

console.log('\nTabs launched. If the tunnel URL changed, set HOST in .env to match.\n');
