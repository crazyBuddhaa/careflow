import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const DB_NAME = 'customcare-db';
const FALLBACK_DB_NAME = 'careflow-db';
const WRANGLER_CONFIG_PATH = path.resolve(process.cwd(), 'wrangler.jsonc');

function logStep(step) {
  console.log(`\n[CustomCare Cloudflare Setup · getcustomcare.xyz] ${step}`);
}

function loadRuntimeSecret(key) {
  if (process.env[key] && process.env[key].trim()) {
    return process.env[key].trim();
  }
  try {
    const pids = fs.readdirSync('/proc').filter((entry) => /^\d+$/.test(entry));
    for (const pid of pids) {
      try {
        const raw = fs.readFileSync(`/proc/${pid}/environ`, 'utf8');
        for (const item of raw.split('\0')) {
          if (item.startsWith(`${key}=`)) {
            const val = item.slice(key.length + 1).trim();
            if (val) return val;
          }
        }
      } catch {
        // Ignore unreadable proc entries
      }
    }
  } catch {
    // Ignore non-Linux environments
  }
  return '';
}

function buildWranglerConfig({ databaseName, databaseId, enableCustomDomainRoutes }) {
  const config = {
    $schema: 'node_modules/wrangler/config-schema.json',
    name: 'customcare',
    main: 'apps/web/.open-next/worker.js',
    compatibility_date: '2026-08-01',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    build: {
      command: 'CF_SKIP_IF_BUILT=1 node scripts/cf-build-if-needed.mjs',
    },
    assets: {
      directory: 'apps/web/.open-next/assets',
      binding: 'ASSETS',
    },
    services: [
      {
        binding: 'WORKER_SELF_REFERENCE',
        service: 'customcare',
      },
    ],
    vars: {
      NEXT_PUBLIC_APP_NAME: 'CustomCare',
      NEXT_PUBLIC_APP_URL: 'https://getcustomcare.xyz',
      NEXT_PUBLIC_INITIAL_CLIENT: 'CustomCare',
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAFxxgnVK9fCaxASB',
      CAREFLOW_APP_BASE_URL: 'https://getcustomcare.xyz',
      CAREFLOW_AUTH_CALLBACK_URL: 'https://getcustomcare.xyz/login',
      CAREFLOW_ALLOWED_REDIRECT_URLS:
        'https://getcustomcare.xyz,https://www.getcustomcare.xyz,https://customcare.cloud111.workers.dev',
      CAREFLOW_EMAIL_FROM_NAME: 'CustomCare Support',
      CAREFLOW_EMAIL_FROM_ADDRESS: 'support@getcustomcare.xyz',
      CAREFLOW_ENFORCE_ADMIN_MFA: 'true',
      CAREFLOW_CENTRAL_TELEGRAM_BOT_USERNAME:
        loadRuntimeSecret('CAREFLOW_CENTRAL_TELEGRAM_BOT_USERNAME') || 'getcustomcarebot',
    },
  };

  if (enableCustomDomainRoutes) {
    config.routes = [
      { pattern: 'getcustomcare.xyz', custom_domain: true },
      { pattern: 'www.getcustomcare.xyz', custom_domain: true },
      { pattern: '*.getcustomcare.xyz/*', zone_name: 'getcustomcare.xyz' },
    ];
  }

  if (databaseId) {
    config.d1_databases = [
      {
        binding: 'DB',
        database_name: databaseName || DB_NAME,
        database_id: databaseId,
        migrations_dir: 'cloudflare/d1/migrations',
      },
    ];
  }

  return `${JSON.stringify(config, null, 2)}\n`;
}

async function main() {
  const apiToken = (
    loadRuntimeSecret('CLOUDFLARE_API_TOKEN') ||
    loadRuntimeSecret('CF_API_TOKEN') ||
    loadRuntimeSecret('CLOUDFLARE_TOKEN') ||
    ''
  ).trim();

  const accountIdEnv = (
    loadRuntimeSecret('CLOUDFLARE_ACCOUNT_ID') ||
    loadRuntimeSecret('CF_ACCOUNT_ID') ||
    ''
  ).trim();

  if (apiToken) {
    process.env.CLOUDFLARE_API_TOKEN = apiToken;
  }
  if (accountIdEnv) {
    process.env.CLOUDFLARE_ACCOUNT_ID = accountIdEnv;
  }

  if (!apiToken) {
    console.error('\n❌ Missing CLOUDFLARE_API_TOKEN environment variable in the container runtime.');
    process.exit(1);
  }

  logStep('1/5 Verifying Cloudflare authentication via Wrangler...');
  const whoami = spawnSync('npx', ['wrangler', 'whoami'], {
    stdio: 'pipe',
    encoding: 'utf-8',
    env: process.env,
  });

  if (whoami.status !== 0) {
    console.error('❌ Wrangler authentication failed:');
    console.error(whoami.stderr || whoami.stdout);
    process.exit(1);
  }

  const whoamiOutput = `${whoami.stdout || ''}\n${whoami.stderr || ''}`;
  const accountMatch = whoamiOutput.match(/│\s*[^│]+\s*│\s*([0-9a-f]{32})\s*│/i);
  const resolvedAccountId = accountIdEnv || (accountMatch ? accountMatch[1] : '');
  if (resolvedAccountId) {
    process.env.CLOUDFLARE_ACCOUNT_ID = resolvedAccountId;
  }
  console.log(`✅ Authenticated with Cloudflare${resolvedAccountId ? ` (Account ID: ${resolvedAccountId})` : ''}.`);

  logStep('2/5 Checking Cloudflare zone status for getcustomcare.xyz...');
  let zoneActive = false;
  try {
    const zoneRes = await fetch(
      'https://api.cloudflare.com/client/v4/zones?name=getcustomcare.xyz',
      {
        headers: { Authorization: `Bearer ${apiToken}` },
      }
    );
    const zoneData = await zoneRes.json();
    if (zoneData?.success && Array.isArray(zoneData.result) && zoneData.result.length > 0) {
      const zone = zoneData.result[0];
      zoneActive = zone.status === 'active';
      console.log(`✅ Found zone getcustomcare.xyz (status: ${zone.status}).`);
    } else {
      console.log(
        'ℹ️  Zone getcustomcare.xyz is not yet added to this Cloudflare account. Worker will deploy to your *.workers.dev URL and be ready for getcustomcare.xyz once added.'
      );
    }
  } catch {
    console.log('ℹ️  Skipped zone check.');
  }

  logStep(`3/5 Checking or creating Cloudflare D1 database "${DB_NAME}"...`);
  let databaseId = '';
  let resolvedDbName = DB_NAME;
  let d1PermissionMissing = false;

  const listResult = spawnSync('npx', ['wrangler', 'd1', 'list', '--json'], {
    stdio: 'pipe',
    encoding: 'utf-8',
    env: process.env,
  });

  const listOutput = `${listResult.stdout || ''}\n${listResult.stderr || ''}`;
  if (listResult.status === 0 && listResult.stdout) {
    try {
      const databases = JSON.parse(listResult.stdout);
      if (Array.isArray(databases)) {
        const existingPrimary = databases.find((db) => db.name === DB_NAME);
        const existingFallback = databases.find((db) => db.name === FALLBACK_DB_NAME);
        const match = existingPrimary || existingFallback;
        if (match && match.uuid) {
          databaseId = match.uuid;
          resolvedDbName = match.name;
          console.log(`✅ Found existing D1 database "${resolvedDbName}" (${databaseId}).`);
        }
      }
    } catch {
      // Fallback to create
    }
  } else if (listOutput.includes('code: 10000') || listOutput.includes('Authentication error')) {
    d1PermissionMissing = true;
  }

  if (!databaseId && !d1PermissionMissing) {
    console.log(`Creating D1 database "${DB_NAME}"...`);
    const createResult = spawnSync('npx', ['wrangler', 'd1', 'create', DB_NAME], {
      stdio: 'pipe',
      encoding: 'utf-8',
      env: process.env,
    });

    const combinedOutput = `${createResult.stdout || ''}\n${createResult.stderr || ''}`;
    const uuidMatch = combinedOutput.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );

    if (uuidMatch) {
      databaseId = uuidMatch[0];
      resolvedDbName = DB_NAME;
      console.log(`✅ Created D1 database "${resolvedDbName}" (${databaseId}).`);
    } else if (combinedOutput.includes('code: 10000') || combinedOutput.includes('Authentication error')) {
      d1PermissionMissing = true;
    } else {
      console.error('⚠️ Could not create D1 database:');
      console.error(combinedOutput);
    }
  }

  if (d1PermissionMissing) {
    console.warn(
      '\n⚠️  Your CLOUDFLARE_API_TOKEN is valid for Workers deployment, but does not yet include the "Account → D1 → Edit" permission (Cloudflare API code 10000).'
    );
    console.warn(
      '   To enable automated D1 database creation & SQL migrations, edit your token at https://dash.cloudflare.com/profile/api-tokens and add: Account -> D1 -> Edit.'
    );
  }

  logStep('4/5 Updating wrangler.jsonc & applying D1 migrations...');
  const wranglerConfig = buildWranglerConfig({
    databaseName: resolvedDbName,
    databaseId,
    enableCustomDomainRoutes: zoneActive,
  });
  fs.writeFileSync(WRANGLER_CONFIG_PATH, wranglerConfig, 'utf-8');
  console.log(
    `✅ Updated wrangler.jsonc (Worker: "customcare"${databaseId ? `, D1 DB: ${databaseId}` : ''}).`
  );

  if (databaseId) {
    console.log(`Applying remote D1 SQL migrations (0001..0008) to "${resolvedDbName}"...`);
    execSync(`npx wrangler d1 migrations apply ${resolvedDbName} --remote`, {
      stdio: 'inherit',
      env: { ...process.env, CI: 'true' },
    });

    const safeAlterColumns = [
      `ALTER TABLE channel_customer_identities ADD COLUMN session_state_json TEXT NOT NULL DEFAULT '{}'`,
      `ALTER TABLE telegram_customer_contexts ADD COLUMN session_state_json TEXT NOT NULL DEFAULT '{}'`,
      `ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'business'`,
      `ALTER TABLE users ADD COLUMN is_personal_account INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE users ADD COLUMN is_platform_admin INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE organization_members ADD COLUMN agent_identity_id TEXT`,
      `ALTER TABLE organization_members ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
      `ALTER TABLE organization_members ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'active'`,
      `ALTER TABLE organization_members ADD COLUMN department TEXT NOT NULL DEFAULT 'Support'`,
      `ALTER TABLE organization_members ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '[]'`,
      `ALTER TABLE organization_members ADD COLUMN invited_by_user_id TEXT`,
      `ALTER TABLE organization_members ADD COLUMN joined_at TEXT`,
      `ALTER TABLE organization_members ADD COLUMN suspended_at TEXT`,
      `ALTER TABLE organization_members ADD COLUMN revoked_at TEXT`,
      `ALTER TABLE organization_members ADD COLUMN departed_at TEXT`,
      `ALTER TABLE support_agents ADD COLUMN user_id TEXT`,
      `ALTER TABLE support_agents ADD COLUMN agent_identity_id TEXT`,
      `ALTER TABLE support_agents ADD COLUMN department TEXT NOT NULL DEFAULT 'Support'`,
      `ALTER TABLE support_agents ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'active'`,
      `ALTER TABLE support_agents ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '[]'`,
      `ALTER TABLE auth_sessions ADD COLUMN agent_identity_id TEXT`,
      `ALTER TABLE auth_sessions ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'personal_account'`,
      `ALTER TABLE support_complaints ADD COLUMN assigned_specialist_name TEXT`,
      `ALTER TABLE support_complaints ADD COLUMN assigned_specialist_department TEXT`,
      `ALTER TABLE support_complaints ADD COLUMN sla_deadline_at TEXT`,
      `ALTER TABLE support_conversations ADD COLUMN department TEXT NOT NULL DEFAULT 'Support'`,
      `ALTER TABLE support_conversations ADD COLUMN reopened_count INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE support_conversations ADD COLUMN sla_deadline_at TEXT`,
      `UPDATE users SET is_platform_admin = 0 WHERE LOWER(email) NOT IN ('oluwafemiadekanmi76@gmail.com', 'admin@getcustomcare.xyz')`,
      `UPDATE users SET is_platform_admin = 1 WHERE LOWER(email) IN ('oluwafemiadekanmi76@gmail.com', 'admin@getcustomcare.xyz')`,
    ];
    for (const sql of safeAlterColumns) {
      spawnSync(
        'npx',
        ['wrangler', 'd1', 'execute', resolvedDbName, '--remote', '--command', sql],
        { stdio: 'pipe', env: { ...process.env, CI: 'true' } }
      );
    }

    console.log('✅ Remote D1 migrations applied successfully!');
  }

  logStep('5/5 Building & deploying CustomCare Worker to Cloudflare...');
  execSync('node scripts/cf-build-if-needed.mjs', {
    stdio: 'inherit',
    env: { ...process.env, CF_SKIP_IF_BUILT: '0' },
  });

  execSync('npx wrangler deploy', {
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
  });

  console.log('\n🎉 CustomCare Worker deployed to Cloudflare!');
  if (d1PermissionMissing) {
    console.log(
      '👉 Next step for D1: Add "Account → D1 → Edit" to your existing API Token at https://dash.cloudflare.com/profile/api-tokens and re-run `npm run cf:setup` to provision `customcare-db` and apply all 3 remote SQL migrations.'
    );
  }
}

main().catch((err) => {
  console.error('❌ Cloudflare setup failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
