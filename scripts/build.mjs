import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isCloudflareWorkersCI =
  process.env.WORKERS_CI === '1' || process.env.CF_PAGES === '1';

if (isCloudflareWorkersCI) {
  console.log('[careflow] Cloudflare CI detected — building OpenNext Worker bundle...');
  execSync('node scripts/cf-build-if-needed.mjs', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      CF_SKIP_IF_BUILT: '0',
    },
  });
} else {
  execSync('npx next build apps/web', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });
}
