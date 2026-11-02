import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB_APP_DIR = path.join(ROOT_DIR, 'apps', 'web');
const WORKER_BUNDLE_PATH = path.join(WEB_APP_DIR, '.open-next', 'worker.js');
const ROOT_WRANGLER_CONFIG = path.join(ROOT_DIR, 'wrangler.jsonc');

// Avoid recursive rebuild when invoked via `opennextjs-cloudflare deploy`
if (process.env.OPEN_NEXT_DEPLOY === 'true') {
  process.exit(0);
}

// Reuse existing bundle when built earlier in the same CI pipeline (e.g., `bun run build` on Workers CI)
if (process.env.CF_SKIP_IF_BUILT === '1' && fs.existsSync(WORKER_BUNDLE_PATH)) {
  console.log('[careflow] Reusing OpenNext Cloudflare bundle at apps/web/.open-next/worker.js');
  process.exit(0);
}

console.log('[careflow] Building OpenNext Cloudflare Worker bundle for apps/web...');
execSync(
  `npx opennextjs-cloudflare build --config "${ROOT_WRANGLER_CONFIG}"`,
  {
    cwd: WEB_APP_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  }
);
