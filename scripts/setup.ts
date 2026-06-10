#!/usr/bin/env bun
import { $ } from 'bun';
import { CONFIG_PATHS, ENV_KEYS, HEX_ID_PATTERN, loadConfig } from './lib/wrangler-config';

/**
 * One-time interactive setup for a new deployment (fork or first clone).
 * Provisions the KV namespaces this worker needs (binding name read from
 * wrangler.jsonc), writes their IDs to .env.local (gitignored), and
 * optionally configures the NTFY_URL secret.
 *
 * After running this, `bun run deploy` works locally, and the same IDs can
 * be added as GitHub Actions secrets for CI deploys.
 */

function extractId(output: string, label: string): string {
	const match = new RegExp(HEX_ID_PATTERN.source).exec(output);
	if (!match) {
		console.error(`Could not find a namespace ID in wrangler output for ${label}:`);
		console.error(output);
		process.exit(1);
	}
	return match[0];
}

async function main(): Promise<void> {
	if (process.env['CI'] === 'true') {
		console.error('setup is interactive and not meant for CI. CI deploys read GitHub Actions secrets.');
		process.exit(1);
	}

	const config = await loadConfig();
	const binding = config.kv_namespaces?.[0]?.binding;
	if (binding === undefined || binding === '') {
		console.error('No KV namespace binding found in wrangler.jsonc');
		process.exit(1);
	}

	console.log('Checking wrangler authentication…');
	const whoami = await $`bun x wrangler whoami`.nothrow().quiet();
	if (whoami.exitCode !== 0 || whoami.text().includes('not authenticated')) {
		console.error('Not logged in. Run `bun x wrangler login` first.');
		process.exit(1);
	}

	// `wrangler whoami` lists account IDs; with one account, use it directly,
	// otherwise ask which to deploy into.
	const accountIds = [...new Set(whoami.text().match(HEX_ID_PATTERN) ?? [])];
	let accountId = accountIds.length === 1 ? accountIds[0] : undefined;
	if (accountId === undefined) {
		const entered = prompt(`Cloudflare account ID to deploy into${accountIds.length > 0 ? ` (one of: ${accountIds.join(', ')})` : ''}:`);
		if (entered === null || entered.trim() === '') {
			console.error('An account ID is required.');
			process.exit(1);
		}
		accountId = entered.trim();
	}
	console.log(`Using account ${accountId}`);

	if (await Bun.file(CONFIG_PATHS.envLocal).exists()) {
		const overwrite = confirm('.env.local already exists. Re-provision KV namespaces and overwrite it?');
		if (!overwrite) {
			console.log('Keeping existing .env.local; nothing to do.');
			return;
		}
	}

	console.log(`Creating KV namespace ${binding}…`);
	const prod = await $`bun x wrangler kv namespace create ${binding}`.text();
	const prodId = extractId(prod, binding);
	console.log(`  production: ${prodId}`);

	console.log('Creating preview KV namespace…');
	const preview = await $`bun x wrangler kv namespace create ${binding} --preview`.text();
	const previewId = extractId(preview, `${binding} --preview`);
	console.log(`  preview: ${previewId}`);

	const lines = [
		'# Local deployment configuration. Not committed.',
		'# The same values go in GitHub Actions secrets for CI deploys.',
		`${ENV_KEYS.accountId}=${accountId}`,
		`${ENV_KEYS.kvId}=${prodId}`,
		`${ENV_KEYS.kvPreviewId}=${previewId}`,
		'',
	];
	await Bun.write(CONFIG_PATHS.envLocal, lines.join('\n'));
	console.log(`Wrote ${CONFIG_PATHS.envLocal}`);

	const ntfy = prompt('ntfy topic URL for change notifications (blank to skip):');
	if (ntfy !== null && ntfy.trim() !== '') {
		await $`bun x wrangler secret put ${ENV_KEYS.ntfyUrl} < ${new Response(ntfy.trim())}`;
		await Bun.write(CONFIG_PATHS.devVars, `${ENV_KEYS.ntfyUrl}="${ntfy.trim()}"\n`);
		console.log(`${ENV_KEYS.ntfyUrl} secret set and .dev.vars written for local dev.`);
	}

	console.log('\nSetup complete. Next steps:');
	console.log('  - bun run deploy            (deploy from this machine)');
	console.log(`  - add ${ENV_KEYS.kvId}, ${ENV_KEYS.kvPreviewId}, CLOUDFLARE_API_TOKEN,`);
	console.log(`    CLOUDFLARE_ACCOUNT_ID (and optionally ${ENV_KEYS.ntfyUrl}) as GitHub Actions`);
	console.log('    secrets to deploy on every push to main.');
}

await main();
