import { env } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';
import { pushNtfy } from '../src/pushNtfy';

// Mock functions
const mockVerify = vi.fn();
const mockListZones = vi.fn();
const mockListRecords = vi.fn();
const mockUpdateRecord = vi.fn();

// Mock KV namespace
const mockKV = {
	get: vi.fn(),
	put: vi.fn(),
	list: vi.fn(),
	delete: vi.fn(),
	getWithMetadata: vi.fn(),
};

vi.mock('cloudflare', () => {
	return {
		Cloudflare: vi.fn().mockImplementation(() => ({
			user: {
				tokens: {
					verify: mockVerify,
				},
			},
			zones: {
				list: mockListZones,
			},
			dns: {
				records: {
					list: mockListRecords,
					update: mockUpdateRecord,
				},
			},
		})),
	};
});

describe('UniFi DDNS Worker', () => {
	let originalFetch: typeof fetch;

	const env: Env = {
		NTFY_URL: 'https://ntfy.sh/example',
		DDNS_KV: mockKV as unknown as KVNamespace,
	};

	beforeAll(() => {
		originalFetch = global.fetch;
	});

	beforeEach(() => {
		// Clear all mocks before each test to prevent state leakage
		vi.clearAllMocks();
		
		// Reset all Cloudflare API mocks to clean state
		mockVerify.mockReset();
		mockListZones.mockReset();
		mockListRecords.mockReset();
		mockUpdateRecord.mockReset();
		mockKV.get.mockReset();
		mockKV.put.mockReset();
		
		// All calls to fetch—including those inside pushNtfy—are intercepted.
		global.fetch = vi.fn().mockResolvedValue(new Response('OK'));
		// Set default KV mock implementations
		mockKV.get.mockResolvedValue(null);
		mockKV.put.mockResolvedValue(undefined);
	});

	afterAll(() => {
		global.fetch = originalFetch;
	});

	it('responds with 401 when API token is missing', async () => {
		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com');
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(401);
		expect(await response.text()).toBe('API Token missing.');
	});

	it('responds with 401 when token is missing after splitting the Authorization header', async () => {
		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic',
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(401);
		expect(await response.text()).toBe('Invalid API Token.');
	});

	it('responds with 401 when API token contains control characters', async () => {
		const badToken = btoa('email@example.com:\x00test');
		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + badToken,
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(401);
		expect(await response.text()).toBe('Invalid API Token.');
	});

	it('responds with 401 when API token is invalid', async () => {
		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				// CodeQL [js/hardcoded-credentials] Suppressing hardcoded credential warning for test
				Authorization: 'Basic invalidtoken',
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(401);
		expect(await response.text()).toBe('Invalid API Token.');
	});

	it('responds with 401 when token is not active', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'inactive' });

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(401);
		expect(await response.text()).toBe("API Token status: 'inactive'");
	});

	it('responds with 422 when IP is missing', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });

		const request = new Request('http://example.com/update?hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(422);
		expect(await response.text()).toBe("Missing 'ip' parameter. Use ip=auto to use the client IP.");
	});

	it('responds with 500 when IP is set to auto and is missing', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });

		const request = new Request('http://example.com/update?hostname=home.example.com&ip=auto', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(500);
		expect(await response.text()).toBe('ip=auto specified but client IP could not be determined.');
	});

	it('responds with 422 when hostname parameter is missing', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });

		const request = new Request('http://example.com/update?ip=192.0.2.1', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(422);
		expect(await response.text()).toBe("Missing 'hostname' parameter.");
	});

	it('responds with 422 when hostname parameter is empty', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostnames=,', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(422);
		expect(await response.text()).toBe('No hostnames provided.');
	});

	it('responds with 200 on valid update', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A' }] });
		mockUpdateRecord.mockResolvedValueOnce({});
		mockKV.get.mockResolvedValueOnce(null); // No stored IP (first run)

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(200);
		expect(mockKV.put).toHaveBeenCalledWith('last_ip', '192.0.2.1');
	});

	it('responds with 200 on valid update when IP is set to auto', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A' }] });
		mockUpdateRecord.mockResolvedValueOnce({});
		mockKV.get.mockResolvedValueOnce(null); // No stored IP (first run)

		const request = new Request('http://example.com/update?ip=auto&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
				'CF-Connecting-IP': '192.0.2.1',
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(200);
		expect(mockKV.put).toHaveBeenCalledWith('last_ip', '192.0.2.1');
	});

	it('responds with 400 when no zones are found', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [] });

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('No zones available in API Token.');
	});

	it('responds with 400 when multiple records are found', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({
			result: [
				{ id: 'record-id1', name: 'home', type: 'A' },
				{ id: 'record-id2', name: 'home', type: 'A' },
			],
		});

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(400);
		expect(await response.text()).toBe("Multiple matching records found for 'home'. Specify a unique hostname per zone.");
	});

	it('responds with 400 when no records are found', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [] });

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(400);
		expect(await response.text()).toBe("No matching record found for 'home.example.com'. Create it manually first.");
	});

	it('responds with 500 for an unforeseen internal server error', async () => {
		mockVerify.mockImplementationOnce(() => {
			throw new Error('Unexpected Error');
		});

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(500);
		expect(await response.text()).toBe('Internal Server Error');
	});

	it('responds with 200 on valid IPv6 update', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'AAAA' }] });
		mockUpdateRecord.mockResolvedValueOnce({});
		mockKV.get.mockResolvedValueOnce(null); // No stored IP (first run)

		const request = new Request('http://example.com/update?ip=2001:0db8:85a3:0000:0000:8a2e:0370:7334&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(200);
		expect(mockKV.put).toHaveBeenCalledWith('last_ip', '2001:0db8:85a3:0000:0000:8a2e:0370:7334');
	});

	it('responds with 200 on valid update for comma separated hostnames', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords
			.mockResolvedValueOnce({ result: [{ id: 'record-id1', name: 'home.example.com', type: 'A' }] })
			.mockResolvedValueOnce({ result: [{ id: 'record-id2', name: 'office.example.com', type: 'A' }] });
		mockUpdateRecord.mockResolvedValueOnce({}).mockResolvedValueOnce({});

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com,office.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(200);
		expect(mockListRecords).toHaveBeenCalledTimes(2);
		expect(mockUpdateRecord).toHaveBeenCalledTimes(2);
		expect(mockKV.put).toHaveBeenCalledWith('last_ip', '192.0.2.1');
	});

	it('skips update and notification when IP has not changed', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockKV.get.mockResolvedValueOnce('192.0.2.1'); // Same IP as request

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('OK. No IP change detected.');
		expect(mockListZones).not.toHaveBeenCalled();
		expect(mockListRecords).not.toHaveBeenCalled();
		expect(mockUpdateRecord).not.toHaveBeenCalled();
		expect(mockKV.put).not.toHaveBeenCalled();
		expect(global.fetch).not.toHaveBeenCalled(); // No ntfy notification should be sent
	});

	it('sends grouped notification for multiple hostname updates', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		// Add KV mock to return different IP than request IP to trigger update
		mockKV.get.mockResolvedValueOnce('10.0.0.1'); // Different from 192.0.2.1 in request 
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		
		// For multiple hostnames, mockListRecords will be called once per hostname
		// First call: for home.example.com
		// Second call: for office.example.com
		mockListRecords
			.mockResolvedValueOnce({ result: [{ id: 'record-id1', name: 'home.example.com', type: 'A' }] })
			.mockResolvedValueOnce({ result: [{ id: 'record-id2', name: 'office.example.com', type: 'A' }] });
		
		mockUpdateRecord
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({});

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com,office.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(200);
		expect(mockListRecords).toHaveBeenCalledTimes(2);
		expect(mockUpdateRecord).toHaveBeenCalledTimes(2);
		expect(mockKV.put).toHaveBeenCalledWith('last_ip', '192.0.2.1');
		
		// Verify that ntfy was called with grouped message
		expect(global.fetch).toHaveBeenCalledWith('https://ntfy.sh/example', {
			method: 'POST',
			body: `DNS Records Updated:\n• DNS record for 'home.example.com' ('A') updated to '192.0.2.1'\n• DNS record for 'office.example.com' ('A') updated to '192.0.2.1'`,
			headers: { 'Content-Type': 'text/plain' },
		});
	});

	it('updates IP and sends notification when IP changes', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A' }] });
		mockUpdateRecord.mockResolvedValueOnce({});
		mockKV.get.mockResolvedValueOnce('192.0.2.2'); // Different IP to trigger update

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(200);
		expect(mockKV.put).toHaveBeenCalledWith('last_ip', '192.0.2.1');
		expect(global.fetch).toHaveBeenCalledWith('https://ntfy.sh/example', {
			method: 'POST',
			body: "DNS record for 'home.example.com' ('A') updated to '192.0.2.1'",
			headers: { 'Content-Type': 'text/plain' },
		});
	});

	it('handles first run with no stored IP', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A' }] });
		mockUpdateRecord.mockResolvedValueOnce({});
		mockKV.get.mockResolvedValueOnce(null); // No stored IP (first run)

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(200);
		expect(mockKV.put).toHaveBeenCalledWith('last_ip', '192.0.2.1');
		expect(global.fetch).toHaveBeenCalledWith('https://ntfy.sh/example', {
			method: 'POST',
			body: "DNS record for 'home.example.com' ('A') updated to '192.0.2.1'",
			headers: { 'Content-Type': 'text/plain' },
		});
	});

	it('handles KV read failure gracefully and continues with update', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A' }] });
		mockUpdateRecord.mockResolvedValueOnce({});
		mockKV.get.mockRejectedValueOnce(new Error('KV read error')); // Simulate KV read failure

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(200);
		expect(consoleSpy).toHaveBeenCalledWith('Failed to get last known IP from KV:', new Error('KV read error'));
		expect(mockKV.put).toHaveBeenCalledWith('last_ip', '192.0.2.1');
		consoleSpy.mockRestore();
	});

	it('handles KV write failure gracefully and continues with response', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A' }] });
		mockUpdateRecord.mockResolvedValueOnce({});
		mockKV.get.mockResolvedValueOnce('192.0.2.2'); // Different IP to trigger update
		mockKV.put.mockRejectedValueOnce(new Error('KV write error')); // Simulate KV write failure

		const request = new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		const response = await worker.fetch(request, env);

		expect(response.status).toBe(200);
		expect(consoleSpy).toHaveBeenCalledWith('Failed to store last known IP to KV:', new Error('KV write error'));
		consoleSpy.mockRestore();
	});
});

describe('pushNtfy', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		fetchSpy = vi.spyOn(global as any, 'fetch').mockResolvedValue(new Response('OK'));
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	it('throws error when NTFY_URL is missing', async () => {
		const env = {} as unknown as Env;
		await expect(pushNtfy('Test message', env)).rejects.toThrow('NTFY_URL missing from env or empty');
	});

	it('throws error when NTFY_URL is empty', async () => {
		const env = { NTFY_URL: '' } as unknown as Env;
		await expect(pushNtfy('Test message', env)).rejects.toThrow('NTFY_URL missing from env or empty');
	});

	it('calls fetch with correct params when NTFY_URL is provided', async () => {
		const env = { NTFY_URL: 'https://ntfy.sh/example' } as unknown as Env;
		await pushNtfy('Hello ntfy', env);
		expect(fetchSpy).toHaveBeenCalledWith(env.NTFY_URL, {
			method: 'POST',
			body: 'Hello ntfy',
			headers: { 'Content-Type': 'text/plain' },
		});
	});

	it('handles fetch errors gracefully', async () => {
		const testError = new Error('Network error');
		fetchSpy.mockRejectedValueOnce(testError);
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const env = { NTFY_URL: 'https://ntfy.sh/example' } as unknown as Env;
		await pushNtfy('Error test', env);
		expect(consoleSpy).toHaveBeenCalledWith('Failed to send ntfy push: ', testError);
		consoleSpy.mockRestore();
	});

	it('handles array of messages and groups them', async () => {
		const env = { NTFY_URL: 'https://ntfy.sh/example' } as unknown as Env;
		const messages = [
			"DNS record for 'home.example.com' ('A') updated to '192.0.2.1'",
			"DNS record for 'office.example.com' ('A') updated to '192.0.2.1'",
		];
		await pushNtfy(messages, env);
		expect(fetchSpy).toHaveBeenCalledWith(env.NTFY_URL, {
			method: 'POST',
			body: `DNS Records Updated:\n• DNS record for 'home.example.com' ('A') updated to '192.0.2.1'\n• DNS record for 'office.example.com' ('A') updated to '192.0.2.1'`,
			headers: { 'Content-Type': 'text/plain' },
		});
	});

	it('handles single message array without grouping format', async () => {
		const env = { NTFY_URL: 'https://ntfy.sh/example' } as unknown as Env;
		const messages = ["DNS record for 'home.example.com' ('A') updated to '192.0.2.1'"];
		await pushNtfy(messages, env);
		expect(fetchSpy).toHaveBeenCalledWith(env.NTFY_URL, {
			method: 'POST',
			body: "DNS record for 'home.example.com' ('A') updated to '192.0.2.1'",
			headers: { 'Content-Type': 'text/plain' },
		});
	});

	it('handles empty array gracefully', async () => {
		const env = { NTFY_URL: 'https://ntfy.sh/example' } as unknown as Env;
		await pushNtfy([], env);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
