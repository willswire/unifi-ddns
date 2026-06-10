#!/usr/bin/env bun
import { basename } from 'node:path';
import { CONFIG_PATHS, HEX_ID_PATTERN } from './lib/wrangler-config';

/**
 * Guard against committing real Cloudflare identifiers in wrangler.jsonc.
 * The committed config must only contain placeholders; real IDs live in
 * .env.local (gitignored) and GitHub Actions secrets, injected at deploy
 * time by scripts/deploy.ts.
 *
 * Runs from the pre-commit hook (lefthook) and CI. Ignores any file
 * arguments the hook passes; the target is always the committed config.
 */
const content: string = await Bun.file(CONFIG_PATHS.source).text();
const matches = content.match(HEX_ID_PATTERN);

if (matches !== null && matches.length > 0) {
	console.error(`${basename(CONFIG_PATHS.source)} contains what looks like real Cloudflare IDs:`);
	for (const match of matches) {
		console.error(`  ${match.slice(0, 8)}…`);
	}
	console.error('Replace them with placeholders; real IDs belong in .env.local and GitHub secrets.');
	process.exit(1);
}

console.log(`${basename(CONFIG_PATHS.source)} is clean (placeholders only).`);
