import { join } from 'node:path';
import { parse, stringify } from 'comment-json';

export interface KVNamespaceConfig {
	binding: string;
	id: string;
	preview_id: string;
}

export interface WranglerConfig {
	[key: string]: unknown;
	name?: string;
	account_id?: string;
	kv_namespaces?: KVNamespaceConfig[];
}

/** Repository root, derived from this file's location. */
export const REPO_ROOT: string = join(import.meta.dirname, '..', '..');

/** The committed config (placeholders only) and the generated deploy config. */
export const CONFIG_PATHS = {
	source: join(REPO_ROOT, 'wrangler.jsonc'),
	deploy: join(REPO_ROOT, 'wrangler.deploy.jsonc'),
	envLocal: join(REPO_ROOT, '.env.local'),
	devVars: join(REPO_ROOT, '.dev.vars'),
} as const;

/** Environment variable names shared by setup, deploy, and CI secrets. */
export const ENV_KEYS = {
	kvId: 'KV_NAMESPACE_ID',
	kvPreviewId: 'KV_NAMESPACE_PREVIEW_ID',
	ntfyUrl: 'NTFY_URL',
	// Read natively by wrangler; never stored in config files.
	accountId: 'CLOUDFLARE_ACCOUNT_ID',
} as const;

/** Cloudflare account and namespace IDs are 32 hex characters. */
export const HEX_ID_PATTERN = /\b[0-9a-f]{32}\b/g;

/** Parses a JSONC config file, preserving comments for round-tripping. */
export async function loadConfig(configPath: string = CONFIG_PATHS.source): Promise<WranglerConfig> {
	const content: string = await Bun.file(configPath).text();
	return parse(content) as WranglerConfig;
}

/** Serializes a config back to JSONC with tabs, preserving comments. */
export function serializeConfig(config: WranglerConfig): string {
	return `${stringify(config, null, '\t')}\n`;
}
