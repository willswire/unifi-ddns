import worker from '../src/index';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock functions
const mockVerify = vi.fn();
const mockListZones = vi.fn();
const mockListRecords = vi.fn();
const mockUpdateRecord = vi.fn();

vi.mock('cloudflare', () => {
	return {
		Cloudflare: vi.fn().mockImplementation(function () {
			return {
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
			};
		}),
	};
});

describe('UniFi DDNS Worker', () => {
	beforeEach(() => {
		// Clear all mocks before each test to prevent state leakage.
		// mockReset also discards queued mockResolvedValueOnce/mockImplementationOnce
		// values left unconsumed by tests that exit before calling the API,
		// which clearAllMocks alone does not remove.
		vi.clearAllMocks();
		mockVerify.mockReset();
		mockListZones.mockReset();
		mockListRecords.mockReset();
		mockUpdateRecord.mockReset();
	});

	it('responds with 401 when API token is missing', async () => {
		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com'));
		expect(response.status).toBe(401);
		expect(await response.text()).toBe('API token missing.');
	});

	it('responds with 401 when API token is invalid', async () => {
		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				// CodeQL [js/hardcoded-credentials] Suppressing hardcoded credential warning for test
				Authorization: 'Basic invalidtoken',
			},
		}));
		expect(response.status).toBe(401);
		expect(await response.text()).toBe('Invalid API key or token.');
	});

	it('responds with 401 when token is not active', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'inactive' });

		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));

		expect(response.status).toBe(401);
		expect(await response.text()).toBe('This API Token is inactive');
	});

	it('responds with 422 when IP is missing', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		const response = await worker.fetch(new Request('http://example.com/update?hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));
		expect(response.status).toBe(422);
		expect(await response.text()).toBe('The "ip" parameter is required and cannot be empty. Specify ip=auto to use the client IP.');
	});

	it('responds with 500 when IP is set to auto and is missing', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		const response = await worker.fetch(new Request('http://example.com/update?hostname=home.example.com&ip=auto', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));
		expect(response.status).toBe(500);
		expect(await response.text()).toBe('Request asked for ip=auto but client IP address cannot be determined.');
	});

	it('responds with 422 when hostname is missing', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));
		expect(response.status).toBe(422);
		expect(await response.text()).toBe('The "hostname" parameter is required and cannot be empty.');
	});

	it('responds with 200 on valid update', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A' }] });
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));
		expect(response.status).toBe(200);
	});

	it('remaps the requested hostname to the TARGET_HOSTNAME binding when set', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A' }] });
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
				headers: {
					Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
				},
			}),
			{ TARGET_HOSTNAME: 'home.example.net' },
		);
		expect(response.status).toBe(200);
		expect(mockListRecords).toHaveBeenCalledWith(expect.objectContaining({ name: 'home.example.net' }));
		expect(mockUpdateRecord).toHaveBeenCalledWith(
			'record-id',
			expect.objectContaining({ name: 'home.example.net', content: '192.0.2.1' }),
		);
	});

	it('responds with 200 on valid update when IP is set to auto', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A' }] });
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await worker.fetch(new Request('http://example.com/update?ip=auto&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
				'CF-Connecting-IP': '192.0.2.1',
			},
		}));
		expect(response.status).toBe(200);
	});

	it('responds with 200 on valid multi-hostname update', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords
			.mockResolvedValueOnce({ result: [{ id: 'record-id-1', name: 'example.com', type: 'A' }] })
			.mockResolvedValueOnce({ result: [{ id: 'record-id-2', name: '*.example.com', type: 'A' }] });
		mockUpdateRecord.mockResolvedValue({});

		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&hostname=example.com,*.example.com', {
				headers: {
					Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
				},
			}),
		);
		expect(response.status).toBe(200);
		expect(mockUpdateRecord).toHaveBeenCalledTimes(2);
	});

	it('responds with 200 on multi-hostname dual-stack update', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords
			.mockResolvedValueOnce({ result: [{ id: 'record-id-a1', name: 'example.com', type: 'A' }] })
			.mockResolvedValueOnce({ result: [{ id: 'record-id-aaaa1', name: 'example.com', type: 'AAAA' }] })
			.mockResolvedValueOnce({ result: [{ id: 'record-id-a2', name: 'sub.example.com', type: 'A' }] })
			.mockResolvedValueOnce({ result: [{ id: 'record-id-aaaa2', name: 'sub.example.com', type: 'AAAA' }] });
		mockUpdateRecord.mockResolvedValue({});

		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&ip6=2001:0db8:85a3:0000:0000:8a2e:0370:7334&hostname=example.com,sub.example.com', {
				headers: {
					Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
				},
			}),
		);
		expect(response.status).toBe(200);
		expect(mockUpdateRecord).toHaveBeenCalledTimes(4);
	});

	it('responds with 400 when multiple zones are found', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id1' }, { id: 'zone-id2' }] });

		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('More than one zone was found! You must supply an API Token scoped to a single zone.');
	});

	it('responds with 400 when no zones are found', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [] });

		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));

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

		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('More than one matching record found!');
	});

	it('responds with 400 when no records are found', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [] });

		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('No record found! You must first manually create the record.');
	});

	it('responds with 500 for an unforeseen internal server error', async () => {
		mockVerify.mockImplementationOnce(() => {
			throw new Error('Unexpected Error');
		});

		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));

		expect(response.status).toBe(500);
		expect(await response.text()).toBe('Internal Server Error');
	});

	it('responds with 200 on valid IPv6 update', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'AAAA' }] });
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await worker.fetch(new Request('http://example.com/update?ip=2001:0db8:85a3:0000:0000:8a2e:0370:7334&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));
		expect(response.status).toBe(200);
	});

	it('responds with 200 on valid dual-stack update with ip6 parameter', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords
			.mockResolvedValueOnce({ result: [{ id: 'record-id-a', name: 'home.example.com', type: 'A' }] })
			.mockResolvedValueOnce({ result: [{ id: 'record-id-aaaa', name: 'home.example.com', type: 'AAAA' }] });
		mockUpdateRecord.mockResolvedValue({});

		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&ip6=2001:0db8:85a3:0000:0000:8a2e:0370:7334&hostname=home.example.com', {
				headers: {
					Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
				},
			}),
		);
		expect(response.status).toBe(200);
		expect(mockUpdateRecord).toHaveBeenCalledTimes(2);
	});

	it('responds with 200 on valid update and preserves the existing TTL', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A', ttl: 300 }] });
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));
		expect(response.status).toBe(200);
		expect(mockUpdateRecord).toHaveBeenCalledWith('record-id', expect.objectContaining({ ttl: 300 }));
	});

	it('responds with 200 when ip6 is set to auto over an IPv6 connection', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords
			.mockResolvedValueOnce({ result: [{ id: 'record-id-a', name: 'home.example.com', type: 'A' }] })
			.mockResolvedValueOnce({ result: [{ id: 'record-id-aaaa', name: 'home.example.com', type: 'AAAA' }] });
		mockUpdateRecord.mockResolvedValue({});

		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&ip6=auto&hostname=home.example.com', {
				headers: {
					Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
					'CF-Connecting-IP': '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
				},
			}),
		);
		expect(response.status).toBe(200);
		expect(mockUpdateRecord).toHaveBeenCalledTimes(2);
		expect(mockUpdateRecord).toHaveBeenCalledWith('record-id-aaaa', expect.objectContaining({
			type: 'AAAA',
			content: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
		}));
	});

	it('responds with 422 when ip6 is set to auto but the connection is IPv4', async () => {
		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&ip6=auto&hostname=home.example.com', {
				headers: {
					Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
					'CF-Connecting-IP': '192.0.2.1',
				},
			}),
		);
		expect(response.status).toBe(422);
		expect(await response.text()).toBe('Request asked for ip6=auto but client IPv6 address cannot be determined.');
	});

	it('responds with 422 when ip6 is set to auto but no client IP header is present', async () => {
		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&ip6=auto&hostname=home.example.com', {
				headers: {
					Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
				},
			}),
		);
		expect(response.status).toBe(422);
		expect(await response.text()).toBe('Request asked for ip6=auto but client IPv6 address cannot be determined.');
	});

	it('responds with 422 when ip6 parameter is not a valid IPv6 address', async () => {
		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&ip6=not-an-ipv6&hostname=home.example.com', {
				headers: {
					Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
				},
			}),
		);
		expect(response.status).toBe(422);
		expect(await response.text()).toBe('The "ip6" parameter must be a valid IPv6 address.');
	});

	it('responds with 401 when Authorization payload is not valid base64', async () => {
		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				// "!!!!" is not decodable base64 and must not surface as a 500.
				Authorization: 'Basic !!!!',
			},
		}));
		expect(response.status).toBe(401);
		expect(await response.text()).toBe('Invalid API key or token.');
	});

	it('responds with 401 when Authorization header has no payload', async () => {
		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic',
			},
		}));
		expect(response.status).toBe(401);
		expect(await response.text()).toBe('Invalid API key or token.');
	});

	it('responds with 405 for POST requests', async () => {
		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			method: 'POST',
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));
		expect(response.status).toBe(405);
		expect(response.headers.get('Allow')).toBe('GET');
		expect(mockVerify).not.toHaveBeenCalled();
	});

	it('responds with 405 for DELETE requests', async () => {
		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			method: 'DELETE',
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));
		expect(response.status).toBe(405);
		expect(response.headers.get('Allow')).toBe('GET');
		expect(mockVerify).not.toHaveBeenCalled();
	});

	it('responds with a DynDNS2 "good <ip>" body on a changed record', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A', content: '203.0.113.1' }] });
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('good 192.0.2.1');
		expect(mockUpdateRecord).toHaveBeenCalledTimes(1);
	});

	it('responds with a DynDNS2 "nochg <ip>" body and skips the update when the record is unchanged', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id', name: 'home.example.com', type: 'A', content: '192.0.2.1' }] });

		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('nochg 192.0.2.1');
		expect(mockUpdateRecord).not.toHaveBeenCalled();
	});

	it('responds with one DynDNS2 line per hostname on a multi-hostname update', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords
			.mockResolvedValueOnce({ result: [{ id: 'record-id-1', name: 'example.com', type: 'A', content: '203.0.113.1' }] })
			.mockResolvedValueOnce({ result: [{ id: 'record-id-2', name: '*.example.com', type: 'A', content: '203.0.113.1' }] });
		mockUpdateRecord.mockResolvedValue({});

		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&hostname=example.com,*.example.com', {
				headers: {
					Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
				},
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('good 192.0.2.1\ngood 192.0.2.1');
		expect(mockUpdateRecord).toHaveBeenCalledTimes(2);
	});
});
