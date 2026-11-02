import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALIAS_PREFIXES = [
  ['@careflow/shared/', path.join(ROOT_DIR, 'packages/shared/src/')],
  ['@careflow/validation/', path.join(ROOT_DIR, 'packages/validation/src/')],
  ['@careflow/database/', path.join(ROOT_DIR, 'packages/database/src/')],
  ['@careflow/support-engine/', path.join(ROOT_DIR, 'packages/support-engine/src/')],
  ['@/', path.join(ROOT_DIR, 'apps/web/src/')],
];

const EXACT_ALIASES = new Map([
  ['@careflow/shared', path.join(ROOT_DIR, 'packages/shared/src/index.ts')],
  ['@careflow/validation', path.join(ROOT_DIR, 'packages/validation/src/index.ts')],
  ['@careflow/database', path.join(ROOT_DIR, 'packages/database/src/index.ts')],
  ['@careflow/support-engine', path.join(ROOT_DIR, 'packages/support-engine/src/index.ts')],
]);

function resolveCandidateFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (EXACT_ALIASES.has(specifier)) {
      return {
        url: pathToFileURL(EXACT_ALIASES.get(specifier)).href,
        shortCircuit: true,
      };
    }

    for (const [prefix, targetDir] of ALIAS_PREFIXES) {
      if (specifier.startsWith(prefix)) {
        const subPath = specifier.slice(prefix.length);
        const resolved = resolveCandidateFile(path.join(targetDir, subPath));
        if (resolved) {
          return { url: resolved, shortCircuit: true };
        }
      }
    }

    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL &&
      context.parentURL.startsWith('file://')
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const resolved = resolveCandidateFile(path.resolve(parentDir, specifier));
      if (resolved) {
        return { url: resolved, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});
