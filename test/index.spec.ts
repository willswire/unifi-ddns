import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Cloudflare } from 'cloudflare';

// Mock functions
const mockVerify = vi.fn();
const mockListZones = vi.fn();
const mockListRecords = vi.fn();
const mockUpdateRecord = vi.fn();

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
	beforeEach(() => {
		// Clear all mocks before each test to prevent state leakage
		vi.clearAllMocks();
	});

	it('responds with 401 when API token is missing', async () => {
		const response = await SELF.fetch('http://example.com/update?ip=192.0.2.1&hostname=home.example.com');
		expect(response.status).toBe(401);
		expect(await response.text()).toBe('API token missing.');
	});

	it('responds with 401 when API token is invalid', async () => {
		const response = await SELF.fetch('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				// CodeQL [js/hardcoded-credentials] Suppressing hardcoded credential warning for test
				Authorization: 'Basic invalidtoken',
			},
		});
		expect(response.status).toBe(401);
		expect(await response.text()).toBe('Invalid API key or token.');
	});

	it('responds with 401 when token is not active', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'inactive' });

		const response = await SELF.fetch('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});

		expect(response.status).toBe(401);
		expect(await response.text()).toBe('This API Token is inactive');
	});

	it('responds with 422 when IP is missing', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		const response = await SELF.fetch('http://example.com/update?hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		expect(response.status).toBe(422);
		expect(await response.text()).toBe('The "ip" parameter is required and cannot be empty. Specify ip=auto to use the client IP.');
	});

	it('responds with 500 when IP is set to auto and is missing', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		const response = await SELF.fetch('http://example.com/update?hostname=home.example.com&ip=auto', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		expect(response.status).toBe(500);
		expect(await response.text()).toBe('Request asked for ip=auto but client IP address cannot be determined.');
	});

	it('responds with 422 when hostname is missing', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		const response = await SELF.fetch('http://example.com/update?ip=192.0.2.1', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		expect(response.status).toBe(422);
		expect(await response.text()).toBe('The "hostname" parameter is required and cannot be empty.');
	});

	it('responds with 200 on valid update', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A' }] });
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await SELF.fetch('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		expect(response.status).toBe(200);
	});

	it('responds with 200 on valid update when IP is set to auto', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A' }] });
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await SELF.fetch('http://example.com/update?ip=auto&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
				'CF-Connecting-IP': '192.0.2.1',
			},
		});
		expect(response.status).toBe(200);
	});

	it('responds with 400 when multiple zones are found', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id1' }, { id: 'zone-id2' }] });

		const response = await SELF.fetch('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('More than one zone was found! You must supply an API Token scoped to a single zone.');
	});

	it('responds with 400 when no zones are found', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [] });

		const response = await SELF.fetch('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('No zones found! You must supply an API Token scoped to a single zone.');
	});

	it('responds with 400 when multiple records are found', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({
			result: [
				{ id: 'record-id1', name: 'home.example.com', type: 'A' },
				{ id: 'record-id2', name: 'home.example.com', type: 'A' },
			],
		});

		const response = await SELF.fetch('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('More than one matching record found!');
	});

	it('responds with 400 when no records are found', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [] });

		const response = await SELF.fetch('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('No record found! You must first manually create the record.');
	});

	it('responds with 500 for an unforeseen internal server error', async () => {
		mockVerify.mockImplementationOnce(() => {
			throw new Error('Unexpected Error');
		});

		const response = await SELF.fetch('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});

		expect(response.status).toBe(500);
		expect(await response.text()).toBe('Internal Server Error');
	});

	it('responds with 200 on valid IPv6 update', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'AAAA' }] });
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await SELF.fetch('http://example.com/update?ip=2001:0db8:85a3:0000:0000:8a2e:0370:7334&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		});
		expect(response.status).toBe(200);
	});
});
