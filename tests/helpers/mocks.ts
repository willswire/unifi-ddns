import { vi } from 'vitest';

export const createMockCloudflareClient = () => {
	const mockClient = {
		user: {
			tokens: {
				verify: vi.fn(),
			},
		},
		zones: {
			list: vi.fn(),
		},
		dns: {
			records: {
				list: vi.fn(),
				update: vi.fn(),
			},
		},
	};

	return mockClient;
};

export const createMockKVNamespace = (): KVNamespace => {
	const storage = new Map<string, string>();

	return {
		get: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
		put: vi.fn((key: string, value: string) => {
			storage.set(key, value);
			return Promise.resolve(undefined);
		}),
		delete: vi.fn((key: string) => {
			storage.delete(key);
			return Promise.resolve(undefined);
		}),
		list: vi.fn(() => Promise.resolve({ keys: [], list_complete: true, cursor: '' })),
		getWithMetadata: vi.fn(),
	} as unknown as KVNamespace;
};

export const createMockEnv = (): Env => {
	const env: Env = {
		DDNS_KV: createMockKVNamespace(),
		NTFY_URL: 'https://ntfy.example.com/test-topic',
	};
	return env;
};

export const createMockRequest = (
	url: string,
	options: Partial<{
		method: string;
		headers: Record<string, string>;
		body: string;
	}> = {},
): Request => {
	const headers = new Headers(options.headers ?? {});

	// Add default CF-Connecting-IP if not provided
	if (!headers.has('CF-Connecting-IP')) {
		headers.set('CF-Connecting-IP', '192.168.1.1');
	}

	return new Request(url, {
		method: options.method ?? 'GET',
		headers,
		body: options.body,
	});
};

export const createAuthHeader = (email: string, token: string): string => {
	const credentials = btoa(`${email}:${token}`);
	return `Bearer ${credentials}`;
};

export const mockConsole = (): { restore: () => void } => {
	const originalConsole = { ...console };

	const restore = (): void => {
		Object.assign(console, originalConsole);
	};

	console.log = vi.fn();

	console.error = vi.fn();

	console.warn = vi.fn();

	console.info = vi.fn();

	return { restore };
};
