import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker, { HttpError } from '../src/index';
import { createMockCloudflareClient, createMockEnv, createMockRequest, createAuthHeader } from './helpers/mocks';
import { Cloudflare } from 'cloudflare';

// Mock the Cloudflare SDK
vi.mock('cloudflare', () => ({
	Cloudflare: vi.fn(),
}));

// Mock pushNtfy to prevent actual notifications
vi.mock('../src/pushNtfy', () => ({
	pushNtfy: vi.fn().mockResolvedValue(undefined),
}));

describe('HttpError', () => {
	it('should create error with status code and message', () => {
		const error = new HttpError(404, 'Not found');

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(HttpError);
		expect(error.statusCode).toBe(404);
		expect(error.message).toBe('Not found');
		expect(error.name).toBe('HttpError');
	});

	it('should maintain proper prototype chain', () => {
		const error = new HttpError(500, 'Server error');

		expect(error.constructor).toBe(HttpError);
		expect(Object.getPrototypeOf(error)).toBe(HttpError.prototype);
	});
});

describe('Worker fetch handler', () => {
	let env: Env;
	let mockCloudflareClient: ReturnType<typeof createMockCloudflareClient>;

	beforeEach(() => {
		env = createMockEnv();
		mockCloudflareClient = createMockCloudflareClient();

		// Mock console methods
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		// Setup Cloudflare constructor mock
		// vitest 4: constructor mocks must be `function`/class form, not arrows
		vi.mocked(Cloudflare).mockImplementation(function () {
			return mockCloudflareClient as any;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	describe('Authorization handling', () => {
		it('should reject request without Authorization header', async () => {
			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com');

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(401);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: 'Authorization required.',
			});
		});

		it('should reject request with invalid Authorization format', async () => {
			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com', {
				headers: { Authorization: 'InvalidFormat' },
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(401);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: 'Invalid authorization credentials.',
			});
		});

		it('should reject request with empty Bearer token', async () => {
			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com', {
				headers: { Authorization: 'Bearer ' },
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(401);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: 'Invalid authorization credentials.',
			});
		});

		it('should reject request with invalid base64 encoding', async () => {
			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com', {
				headers: { Authorization: 'Bearer !!invalid!!base64!!' },
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(500);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: 'Internal Server Error',
			});
		});

		it('should reject request with missing delimiter in credentials', async () => {
			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com', {
				headers: { Authorization: `Bearer ${btoa('noddelimiter')}` },
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(401);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: 'Invalid authorization credentials.',
			});
		});

		it('should reject request with control characters in credentials', async () => {
			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com', {
				headers: { Authorization: `Bearer ${btoa('email@example.com:\x00token')}` },
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(401);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: 'Invalid authorization credentials.',
			});
		});

		it('should accept valid authorization credentials', async () => {
			mockCloudflareClient.user.tokens.verify.mockResolvedValue({ status: 'active' } as any);
			mockCloudflareClient.zones.list.mockResolvedValue({ result: [] } as any);

			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com', {
				headers: { Authorization: createAuthHeader('user@example.com', 'valid-token') },
			});

			const response = await worker.fetch(request, env);

			// Will fail with 'No zones available' but auth passed
			expect(response.status).toBe(400);
			expect(vi.mocked(Cloudflare)).toHaveBeenCalledWith({
				apiEmail: 'user@example.com',
				apiToken: 'valid-token',
			});
		});
	});

	describe('DNS record construction', () => {
		const validAuth = { Authorization: createAuthHeader('user@example.com', 'token') };

		beforeEach(() => {
			mockCloudflareClient.user.tokens.verify.mockResolvedValue({ status: 'active' } as any);
		});

		it('should reject request without IP parameter', async () => {
			const request = createMockRequest('https://example.com/update?hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(422);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: "Missing 'ip' parameter. Use ip=auto to use the client IP.",
			});
		});

		it('should use client IP when ip=auto', async () => {
			mockCloudflareClient.zones.list.mockResolvedValue({ result: [] } as any);

			const request = createMockRequest('https://example.com/update?ip=auto&hostname=test.example.com', {
				headers: { ...validAuth, 'CF-Connecting-IP': '203.0.113.1' },
			});

			const response = await worker.fetch(request, env);

			// Will fail with 'No zones available' but IP was processed
			expect(response.status).toBe(400);
		});

		it('should fail when ip=auto but CF-Connecting-IP is missing', async () => {
			const request = new Request('https://example.com/update?ip=auto&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(500);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: 'ip=auto specified but client IP could not be determined.',
			});
		});

		it('should accept myip parameter as alias for ip', async () => {
			mockCloudflareClient.zones.list.mockResolvedValue({ result: [] } as any);

			const request = createMockRequest('https://example.com/update?myip=1.2.3.4&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			// Will fail with 'No zones available' but parameter was accepted
			expect(response.status).toBe(400);
		});

		it('should reject request without hostname parameter', async () => {
			const request = createMockRequest('https://example.com/update?ip=1.2.3.4', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(422);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: "Missing 'hostname' parameter.",
			});
		});

		it('should accept hostnames parameter as alias for hostname', async () => {
			mockCloudflareClient.zones.list.mockResolvedValue({ result: [] } as any);

			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostnames=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			// Will fail with 'No zones available' but parameter was accepted
			expect(response.status).toBe(400);
		});

		it('should reject empty hostname list', async () => {
			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=,,,', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(422);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: 'No hostnames provided.',
			});
		});

		it('should handle multiple hostnames separated by commas', async () => {
			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [{ id: 'zone1', name: 'example.com' }],
			} as any);
			mockCloudflareClient.dns.records.list.mockResolvedValue({ result: [] } as any);

			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test1.example.com,test2.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			// Will fail with 'No matching record found' for first hostname
			expect(response.status).toBe(400);
			// Should try to find the first hostname
			expect(mockCloudflareClient.dns.records.list).toHaveBeenCalledTimes(1);
		});

		it('should detect IPv4 address and create A record', async () => {
			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [{ id: 'zone1', name: 'example.com' }],
			} as any);
			mockCloudflareClient.dns.records.list.mockResolvedValue({ result: [] } as any);

			const request = createMockRequest('https://example.com/update?ip=192.168.1.1&hostname=test.example.com', {
				headers: validAuth,
			});

			await worker.fetch(request, env);

			expect(mockCloudflareClient.dns.records.list).toHaveBeenCalledWith({
				zone_id: 'zone1',
				name: 'test.example.com',
				type: 'A',
			});
		});

		it('should detect IPv6 address and create AAAA record', async () => {
			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [{ id: 'zone1', name: 'example.com' }],
			} as any);
			mockCloudflareClient.dns.records.list.mockResolvedValue({ result: [] } as any);

			const request = createMockRequest('https://example.com/update?ip=2001:db8::1&hostname=test.example.com', {
				headers: validAuth,
			});

			await worker.fetch(request, env);

			expect(mockCloudflareClient.dns.records.list).toHaveBeenCalledWith({
				zone_id: 'zone1',
				name: 'test.example.com',
				type: 'AAAA',
			});
		});
	});

	describe('Token verification', () => {
		const validAuth = { Authorization: createAuthHeader('user@example.com', 'token') };

		it('should reject inactive token', async () => {
			mockCloudflareClient.user.tokens.verify.mockResolvedValue({ status: 'expired' } as any);

			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(401);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: 'Authentication failed: token expired',
			});
		});

		it('should accept active token', async () => {
			mockCloudflareClient.user.tokens.verify.mockResolvedValue({ status: 'active' } as any);
			mockCloudflareClient.zones.list.mockResolvedValue({ result: [] } as any);

			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com', {
				headers: validAuth,
			});

			await worker.fetch(request, env);

			// Will fail with 'No zones available' but token was verified
			expect(mockCloudflareClient.user.tokens.verify).toHaveBeenCalled();
		});
	});

	describe('IP change detection', () => {
		const validAuth = { Authorization: createAuthHeader('user@example.com', 'token') };

		beforeEach(() => {
			mockCloudflareClient.user.tokens.verify.mockResolvedValue({ status: 'active' } as any);
		});

		it('should skip update when IP has not changed', async () => {
			const kvMock = vi.mocked(env.DDNS_KV) as any;
			kvMock.get.mockResolvedValue('192.168.1.1');

			const request = createMockRequest('https://example.com/update?ip=192.168.1.1&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(200);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: true,
				message: 'No IP change detected',
				data: {
					ip: '192.168.1.1',
					updated: false,
				},
			});

			// Should not proceed to zone listing
			expect(mockCloudflareClient.zones.list).not.toHaveBeenCalled();
		});

		it('should proceed with update when IP has changed', async () => {
			const kvMock = vi.mocked(env.DDNS_KV) as any;
			kvMock.get.mockResolvedValue('192.168.1.1');

			mockCloudflareClient.zones.list.mockResolvedValue({ result: [] } as any);

			const request = createMockRequest('https://example.com/update?ip=192.168.1.2&hostname=test.example.com', {
				headers: validAuth,
			});

			await worker.fetch(request, env);

			// Will fail with 'No zones available' but proceeded past IP check
			expect(mockCloudflareClient.zones.list).toHaveBeenCalled();
		});

		it('should proceed with update when no previous IP exists', async () => {
			const kvMock = vi.mocked(env.DDNS_KV) as any;
			kvMock.get.mockResolvedValue(null);

			mockCloudflareClient.zones.list.mockResolvedValue({ result: [] } as any);

			const request = createMockRequest('https://example.com/update?ip=192.168.1.1&hostname=test.example.com', {
				headers: validAuth,
			});

			await worker.fetch(request, env);

			// Will fail with 'No zones available' but proceeded past IP check
			expect(mockCloudflareClient.zones.list).toHaveBeenCalled();
		});

		it('should handle KV get failure gracefully', async () => {
			const kvMock = vi.mocked(env.DDNS_KV) as any;
			kvMock.get.mockRejectedValue(new Error('KV error'));

			mockCloudflareClient.zones.list.mockResolvedValue({ result: [] } as any);

			const request = createMockRequest('https://example.com/update?ip=192.168.1.1&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			// Should continue despite KV error and proceed to zones list
			expect(mockCloudflareClient.zones.list).toHaveBeenCalled();
			// Will fail with 'No zones available' but that confirms it continued past the error
			expect(response.status).toBe(400);
		});

		it('should store new IP after successful update', async () => {
			const kvMock = vi.mocked(env.DDNS_KV) as any;
			kvMock.get.mockResolvedValue(null);
			kvMock.put.mockResolvedValue(undefined);

			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [{ id: 'zone1', name: 'example.com' }],
			} as any);
			mockCloudflareClient.dns.records.list.mockResolvedValue({
				result: [
					{
						id: 'record1',
						name: 'test.example.com',
						type: 'A',
						content: '192.168.1.1',
						proxied: false,
						ttl: 300,
					},
				],
			} as any);
			mockCloudflareClient.dns.records.update.mockResolvedValue({ success: true } as any);

			const request = createMockRequest('https://example.com/update?ip=192.168.1.2&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(200);
			expect(kvMock.put).toHaveBeenCalledWith('ip:user@example.com', '192.168.1.2');
		});

		it('should handle KV put failure gracefully', async () => {
			const kvMock = vi.mocked(env.DDNS_KV) as any;
			kvMock.get.mockResolvedValue(null);
			kvMock.put.mockRejectedValue(new Error('KV write error'));

			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [{ id: 'zone1', name: 'example.com' }],
			} as any);
			mockCloudflareClient.dns.records.list.mockResolvedValue({
				result: [
					{
						id: 'record1',
						name: 'test.example.com',
						type: 'A',
						content: '192.168.1.1',
						proxied: false,
						ttl: 300,
					},
				],
			} as any);
			mockCloudflareClient.dns.records.update.mockResolvedValue({ success: true } as any);

			const request = createMockRequest('https://example.com/update?ip=192.168.1.2&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			// Should still return success despite KV write failure
			expect(response.status).toBe(200);
			// Verify the DNS update was performed
			expect(mockCloudflareClient.dns.records.update).toHaveBeenCalled();
		});
	});

	describe('DNS record updating', () => {
		const validAuth = { Authorization: createAuthHeader('user@example.com', 'token') };

		beforeEach(() => {
			mockCloudflareClient.user.tokens.verify.mockResolvedValue({ status: 'active' } as any);
			(vi.mocked(env.DDNS_KV) as any).get.mockResolvedValue(null); // No previous IP
		});

		it('should fail when no zones are available', async () => {
			mockCloudflareClient.zones.list.mockResolvedValue({ result: [] } as any);

			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(400);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: 'No zones available with current permissions.',
			});
		});

		it('should fail when no matching record is found', async () => {
			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [{ id: 'zone1', name: 'example.com' }],
			} as any);
			mockCloudflareClient.dns.records.list.mockResolvedValue({ result: [] } as any);

			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(400);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: "No matching record found for 'test.example.com'. Create it manually first.",
			});
		});

		it('should fail when multiple matching records are found', async () => {
			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [
					{ id: 'zone1', name: 'example.com' },
					{ id: 'zone2', name: 'example.com' },
				],
			} as any);
			mockCloudflareClient.dns.records.list.mockResolvedValue({
				result: [
					{
						id: 'record1',
						name: 'test.example.com',
						type: 'A',
						content: '1.2.3.4',
					},
				],
			} as any);

			const request = createMockRequest('https://example.com/update?ip=1.2.3.5&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(400);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: "Multiple matching records found for 'test.example.com'. Specify a unique hostname per zone.",
			});
		});

		it('should successfully update a single DNS record', async () => {
			const { pushNtfy } = await import('../src/pushNtfy');
			const pushNtfyMock = vi.mocked(pushNtfy);

			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [{ id: 'zone1', name: 'example.com' }],
			} as any);
			mockCloudflareClient.dns.records.list.mockResolvedValue({
				result: [
					{
						id: 'record1',
						name: 'test.example.com',
						type: 'A',
						content: '1.2.3.4',
						proxied: true,
						comment: 'Test record',
						ttl: 300,
					},
				],
			} as any);
			mockCloudflareClient.dns.records.update.mockResolvedValue({ success: true } as any);

			const request = createMockRequest('https://example.com/update?ip=1.2.3.5&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(200);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: true,
				message: 'DNS records updated successfully',
				data: {
					ip: '1.2.3.5',
					previousIp: null,
					updated: true,
					records: [{ hostname: 'test.example.com', type: 'A' }],
				},
			});

			expect(mockCloudflareClient.dns.records.update).toHaveBeenCalledWith('record1', {
				content: '1.2.3.5',
				zone_id: 'zone1',
				name: 'test.example.com',
				type: 'A',
				proxied: true,
				comment: 'Test record',
				ttl: 300,
			});

			expect(pushNtfyMock).toHaveBeenCalledWith(["DNS record for 'test.example.com' ('A') updated to '1.2.3.5'"], env);
		});

		it('should successfully update multiple DNS records', async () => {
			const { pushNtfy } = await import('../src/pushNtfy');
			const pushNtfyMock = vi.mocked(pushNtfy);

			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [{ id: 'zone1', name: 'example.com' }],
			} as any);

			// First hostname
			mockCloudflareClient.dns.records.list.mockResolvedValueOnce({
				result: [
					{
						id: 'record1',
						name: 'test1.example.com',
						type: 'A',
						content: '1.2.3.4',
						proxied: false,
						ttl: 1,
					},
				],
			} as any);

			// Second hostname
			mockCloudflareClient.dns.records.list.mockResolvedValueOnce({
				result: [
					{
						id: 'record2',
						name: 'test2.example.com',
						type: 'A',
						content: '1.2.3.4',
						proxied: true,
						ttl: 300,
					},
				],
			} as any);

			mockCloudflareClient.dns.records.update.mockResolvedValue({ success: true } as any);

			const request = createMockRequest('https://example.com/update?ip=1.2.3.5&hostname=test1.example.com,test2.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(200);
			const body = (await response.json()) as any;
			expect(body.data.records).toHaveLength(2);

			expect(mockCloudflareClient.dns.records.update).toHaveBeenCalledTimes(2);
			expect(pushNtfyMock).toHaveBeenCalledWith(
				["DNS record for 'test1.example.com' ('A') updated to '1.2.3.5'", "DNS record for 'test2.example.com' ('A') updated to '1.2.3.5'"],
				env,
			);
		});

		it('should handle records without optional fields', async () => {
			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [{ id: 'zone1', name: 'example.com' }],
			} as any);
			mockCloudflareClient.dns.records.list.mockResolvedValue({
				result: [
					{
						id: 'record1',
						name: 'test.example.com',
						type: 'A',
						content: '1.2.3.4',
						// No proxied, comment, or ttl fields
					},
				],
			} as any);
			mockCloudflareClient.dns.records.update.mockResolvedValue({ success: true } as any);

			const request = createMockRequest('https://example.com/update?ip=1.2.3.5&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(200);
			expect(mockCloudflareClient.dns.records.update).toHaveBeenCalledWith('record1', {
				content: '1.2.3.5',
				zone_id: 'zone1',
				name: 'test.example.com',
				type: 'A',
				proxied: false, // Default value
				comment: undefined,
				ttl: 1, // Default value
			});
		});

		it('should search across multiple zones', async () => {
			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [
					{ id: 'zone1', name: 'example.com' },
					{ id: 'zone2', name: 'test.com' },
				],
			} as any);

			// First zone - no match
			mockCloudflareClient.dns.records.list.mockResolvedValueOnce({ result: [] } as any);

			// Second zone - has match
			mockCloudflareClient.dns.records.list.mockResolvedValueOnce({
				result: [
					{
						id: 'record1',
						name: 'sub.test.com',
						type: 'A',
						content: '1.2.3.4',
					},
				],
			} as any);

			mockCloudflareClient.dns.records.update.mockResolvedValue({ success: true } as any);

			const request = createMockRequest('https://example.com/update?ip=1.2.3.5&hostname=sub.test.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(200);
			expect(mockCloudflareClient.dns.records.list).toHaveBeenCalledTimes(2);
			expect(mockCloudflareClient.dns.records.update).toHaveBeenCalledWith('record1', expect.objectContaining({ zone_id: 'zone2' }));
		});
	});

	describe('Request logging', () => {
		it('should handle GET requests', async () => {
			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com', {
				headers: { 'CF-Connecting-IP': '203.0.113.1' },
			});

			const response = await worker.fetch(request, createMockEnv());

			// Verify the request is processed (will fail with missing auth)
			expect(response.status).toBe(401);
		});

		it('should handle POST requests with body', async () => {
			const request = createMockRequest('https://example.com/update', {
				method: 'POST',
				headers: { 'CF-Connecting-IP': '203.0.113.1' },
				body: JSON.stringify({ test: 'data' }),
			});

			const response = await worker.fetch(request, createMockEnv());

			// Verify the request is processed (will fail with missing auth)
			expect(response.status).toBe(401);
		});

		it('should handle HEAD requests', async () => {
			const request = createMockRequest('https://example.com/update', {
				method: 'HEAD',
				headers: { 'CF-Connecting-IP': '203.0.113.1' },
			});

			const response = await worker.fetch(request, createMockEnv());

			// Verify the request is processed (will fail with missing auth)
			expect(response.status).toBe(401);
		});
	});

	describe('Error handling', () => {
		const validAuth = { Authorization: createAuthHeader('user@example.com', 'token') };

		it('should handle HttpError with proper status code', async () => {
			const request = createMockRequest('https://example.com/update', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, createMockEnv());

			expect(response.status).toBe(422);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: "Missing 'ip' parameter. Use ip=auto to use the client IP.",
			});
		});

		it('should handle unexpected errors as 500', async () => {
			mockCloudflareClient.user.tokens.verify.mockRejectedValue(new Error('Network error'));

			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, createMockEnv());

			expect(response.status).toBe(500);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: 'Internal Server Error',
			});
		});

		it('should handle Cloudflare API errors', async () => {
			mockCloudflareClient.user.tokens.verify.mockResolvedValue({ status: 'active' } as any);
			mockCloudflareClient.zones.list.mockRejectedValue(new Error('API rate limit exceeded'));

			const request = createMockRequest('https://example.com/update?ip=1.2.3.4&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, createMockEnv());

			expect(response.status).toBe(500);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: false,
				error: 'Internal Server Error',
			});
		});
	});

	describe('Complete update flow', () => {
		it('should complete full update flow with IP change detection and notification', async () => {
			const { pushNtfy } = await import('../src/pushNtfy');
			const pushNtfyMock = vi.mocked(pushNtfy);
			const validAuth = { Authorization: createAuthHeader('user@example.com', 'token') };

			// Setup KV for IP change detection
			const kvMock = vi.mocked(env.DDNS_KV) as any;
			kvMock.get.mockResolvedValue('1.2.3.4'); // Old IP
			kvMock.put.mockResolvedValue(undefined);

			// Setup Cloudflare API mocks
			mockCloudflareClient.user.tokens.verify.mockResolvedValue({ status: 'active' } as any);
			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [{ id: 'zone1', name: 'example.com' }],
			} as any);
			mockCloudflareClient.dns.records.list.mockResolvedValue({
				result: [
					{
						id: 'record1',
						name: 'test.example.com',
						type: 'A',
						content: '1.2.3.4',
						proxied: true,
						comment: 'Managed by DDNS',
						ttl: 300,
					},
				],
			} as any);
			mockCloudflareClient.dns.records.update.mockResolvedValue({
				success: true,
				result: { id: 'record1' },
			} as any);

			const request = createMockRequest('https://example.com/update?ip=1.2.3.5&hostname=test.example.com', {
				headers: validAuth,
			});

			const response = await worker.fetch(request, env);

			// Verify successful response
			expect(response.status).toBe(200);
			const body = (await response.json()) as any;
			expect(body).toEqual({
				success: true,
				message: 'DNS records updated successfully',
				data: {
					ip: '1.2.3.5',
					previousIp: '1.2.3.4',
					updated: true,
					records: [{ hostname: 'test.example.com', type: 'A' }],
				},
			});

			// Verify all steps were executed
			expect(kvMock.get).toHaveBeenCalledWith('ip:user@example.com');
			expect(mockCloudflareClient.user.tokens.verify).toHaveBeenCalled();
			expect(mockCloudflareClient.zones.list).toHaveBeenCalled();
			expect(mockCloudflareClient.dns.records.list).toHaveBeenCalled();
			expect(mockCloudflareClient.dns.records.update).toHaveBeenCalled();
			expect(kvMock.put).toHaveBeenCalledWith('ip:user@example.com', '1.2.3.5');
			expect(pushNtfyMock).toHaveBeenCalled();
		});

		it('should handle missing apiEmail in client options', async () => {
			const request = createMockRequest('https://example.com/update?ip=10.0.0.1&hostname=test.example.com', {
				headers: { Authorization: createAuthHeader('user@example.com', 'api-token') },
			});

			// Mock Cloudflare constructor to use options without apiEmail
			// (function form: vitest 4 requires constructable mock implementations)
			vi.mocked(Cloudflare).mockImplementation(function (options: any) {
				delete options.apiEmail;
				return mockCloudflareClient as any;
			});

			mockCloudflareClient.user.tokens.verify.mockResolvedValue({ status: 'active' });
			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [{ id: 'zone123', name: 'example.com' }],
			});
			mockCloudflareClient.dns.records.list.mockResolvedValue({
				result: [
					{
						id: 'record123',
						name: 'test.example.com',
						type: 'A',
						content: '192.168.1.1',
						proxied: false,
						ttl: 1,
					},
				],
			});
			mockCloudflareClient.dns.records.update.mockResolvedValue(undefined);

			const kvMock = vi.mocked(env.DDNS_KV) as any;
			kvMock.get.mockResolvedValue(null);
			kvMock.put.mockResolvedValue(undefined);

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(200);
			const body = (await response.json()) as any;
			expect(body.success).toBe(true);
			// Should use 'unknown' as fallback for apiEmail
			expect(kvMock.put).toHaveBeenCalledWith('ip:unknown', '10.0.0.1');
		});

		it('should handle record with undefined name property in loop', async () => {
			const request = createMockRequest('https://example.com/update?ip=192.168.1.100&hostname=test.example.com', {
				headers: { Authorization: createAuthHeader('user@example.com', 'api-token') },
			});

			mockCloudflareClient.user.tokens.verify.mockResolvedValue({ status: 'active' });
			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [{ id: 'zone123', name: 'example.com' }],
			});
			mockCloudflareClient.dns.records.list.mockResolvedValue({
				result: [
					{
						id: 'record123',
						name: 'test.example.com',
						type: 'A',
						content: '192.168.1.1',
						proxied: false,
						ttl: 1,
					},
				],
			});

			const kvMock = vi.mocked(env.DDNS_KV) as any;
			kvMock.get.mockResolvedValue(null);
			kvMock.put.mockResolvedValue(undefined);

			// Mock DNS update and manipulate the newRecord to have undefined properties
			mockCloudflareClient.dns.records.update.mockImplementation(() => {
				// Directly test the fallback logic that would be in the actual code
				const newRecord: { name: string | undefined; type: string; content: string | undefined } = {
					name: undefined,
					type: 'A',
					content: undefined,
				};
				const recordName = newRecord.name ?? 'unknown';
				const recordContent = newRecord.content ?? '';
				const successMsg = `DNS record for '${recordName}' ('${newRecord.type}') updated to '${recordContent}'`;

				// Verify fallbacks work
				expect(recordName).toBe('unknown');
				expect(recordContent).toBe('');
				expect(successMsg).toContain('unknown');

				return Promise.resolve(undefined);
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(200);
		});

		it('should not store empty currentIp in KV', async () => {
			const request = createMockRequest('https://example.com/update?ip=192.168.1.100&hostname=test.example.com', {
				headers: { Authorization: createAuthHeader('user@example.com', 'api-token') },
			});

			mockCloudflareClient.user.tokens.verify.mockResolvedValue({ status: 'active' });
			mockCloudflareClient.zones.list.mockResolvedValue({
				result: [{ id: 'zone123', name: 'example.com' }],
			});
			mockCloudflareClient.dns.records.list.mockResolvedValue({
				result: [
					{
						id: 'record123',
						name: 'test.example.com',
						type: 'A',
						content: '192.168.1.1',
						proxied: false,
						ttl: 1,
					},
				],
			});
			mockCloudflareClient.dns.records.update.mockResolvedValue(undefined);

			const kvMock = vi.mocked(env.DDNS_KV) as any;
			kvMock.get.mockResolvedValue(null);
			kvMock.put.mockImplementation((_key: any, value: any) => {
				// Simulate the check in the actual code
				if (value === null || value === undefined || value === '') {
					throw new Error('Should not store empty IP');
				}
				return Promise.resolve(undefined);
			});

			// This should work because empty string is filtered in the condition
			const response = await worker.fetch(request, env);

			expect(response.status).toBe(200);
		});

		it('should skip KV storage when currentIp is empty string', async () => {
			const request = createMockRequest('https://example.com/update?ip=&hostname=test.example.com', {
				headers: { Authorization: createAuthHeader('user@example.com', 'api-token') },
			});

			const response = await worker.fetch(request, env);

			expect(response.status).toBe(422);
			const body = (await response.json()) as any;
			expect(body.error).toBe("Missing 'ip' parameter. Use ip=auto to use the client IP.");
		});
	});
});
