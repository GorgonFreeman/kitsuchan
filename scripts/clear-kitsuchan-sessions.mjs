/**
 * Deletes every `kitsuchan:session:*` key in Upstash Redis so the next app open
 * runs OAuth again (e.g. after adding scopes). Does nothing for in-memory sessions — restart `server.js` instead.
 *
 * Run: node --env-file=.env scripts/clear-kitsuchan-sessions.mjs
 */

import { Redis } from '@upstash/redis';

const KEY_PREFIX = 'kitsuchan:session:';

async function main() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    console.error(
      'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN. Example: node --env-file=.env scripts/clear-kitsuchan-sessions.mjs',
    );
    process.exit(1);
  }

  const redis = Redis.fromEnv();
  const pattern = `${ KEY_PREFIX }*`;
  const keys = await redis.keys(pattern);

  if (!keys.length) {
    console.log('clear-kitsuchan-sessions', 'no keys matched', pattern);
    return;
  }

  await Promise.all(keys.map((key) => redis.del(key)));
  console.log('clear-kitsuchan-sessions', 'deleted', keys.length, 'key(s)');
  for (const key of keys) {
    console.log(' ', key);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
