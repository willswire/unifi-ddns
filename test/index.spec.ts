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
		// Clear all mocks before each test to prevent state leakage
		vi.clearAllMocks();
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

	// The suite level beforeEach calls vi.clearAllMocks(), which clears call history but
	// not mock implementations (including mockResolvedValue defaults and leftover
	// mockResolvedValueOnce queues set by earlier tests). The specs below exercise the
	// proxied query param behaviour and must start from a fully clean mock slate, so they
	// call resetCfMocks() explicitly to avoid disturbing the mock setup patterns the
	// existing tests rely on.
	function resetCfMocks() {
		mockVerify.mockReset();
		mockListZones.mockReset();
		mockListRecords.mockReset();
		mockUpdateRecord.mockReset();
	}

	it('preserves existing proxied status when proxied query param is absent', async () => {
		resetCfMocks();
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({
			result: [{ id: 'record-id', name: 'home.example.com', type: 'A', proxied: true }],
		});
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await worker.fetch(new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
			},
		}));

		expect(response.status).toBe(200);
		expect(mockUpdateRecord).toHaveBeenCalledWith(
			'record-id',
			expect.objectContaining({ proxied: true }),
		);
	});

	it('forces proxied=true when proxied=true is passed, overriding an existing unproxied record', async () => {
		resetCfMocks();
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({
			result: [{ id: 'record-id', name: 'home.example.com', type: 'A', proxied: false }],
		});
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com&proxied=true', {
				headers: {
					Authorization: 'Basic ' + btoa('email@example.com:validtoken'),
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(mockUpdateRecord).toHaveBeenCalledWith(
			'record-id',
			expect.objectContaining({ proxied: true }),
		);
	});

	it('accepts proxied=1 as an alias for proxied=true', async () => {
		resetCfMocks();
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({
			result: [{ id: 'record-id', name: 'home.example.com', type: 'A', proxied: false }],
		});
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com&proxied=1', {
				headers: { Authorization: 'Basic ' + btoa('email@example.com:validtoken') },
			}),
		);

		expect(response.status).toBe(200);
		expect(mockUpdateRecord).toHaveBeenCalledWith(
			'record-id',
			expect.objectContaining({ proxied: true }),
		);
	});

	it('applies proxied=true override to every record in a comma-separated multi-hostname update', async () => {
		resetCfMocks();
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords
			.mockResolvedValueOnce({ result: [{ id: 'record-id-1', name: 'example.com', type: 'A', proxied: false }] })
			.mockResolvedValueOnce({ result: [{ id: 'record-id-2', name: '*.example.com', type: 'A', proxied: false }] });
		mockUpdateRecord.mockResolvedValue({});

		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&hostname=example.com,*.example.com&proxied=true', {
				headers: { Authorization: 'Basic ' + btoa('email@example.com:validtoken') },
			}),
		);

		expect(response.status).toBe(200);
		expect(mockUpdateRecord).toHaveBeenCalledTimes(2);
		expect(mockUpdateRecord).toHaveBeenNthCalledWith(1, 'record-id-1', expect.objectContaining({ proxied: true }));
		expect(mockUpdateRecord).toHaveBeenNthCalledWith(2, 'record-id-2', expect.objectContaining({ proxied: true }));
	});

	it('forces proxied=false when proxied=false is passed, overriding an existing proxied record', async () => {
		resetCfMocks();
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({
			result: [{ id: 'record-id', name: 'home.example.com', type: 'A', proxied: true }],
		});
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com&proxied=false', {
				headers: { Authorization: 'Basic ' + btoa('email@example.com:validtoken') },
			}),
		);

		expect(response.status).toBe(200);
		expect(mockUpdateRecord).toHaveBeenCalledWith(
			'record-id',
			expect.objectContaining({ proxied: false }),
		);
	});

	it('accepts proxied=0 as an alias for proxied=false', async () => {
		resetCfMocks();
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({
			result: [{ id: 'record-id', name: 'home.example.com', type: 'A', proxied: true }],
		});
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com&proxied=0', {
				headers: { Authorization: 'Basic ' + btoa('email@example.com:validtoken') },
			}),
		);

		expect(response.status).toBe(200);
		expect(mockUpdateRecord).toHaveBeenCalledWith(
			'record-id',
			expect.objectContaining({ proxied: false }),
		);
	});

	it('ignores unrecognized proxied values and preserves existing state', async () => {
		resetCfMocks();
		mockVerify.mockResolvedValueOnce({ status: 'active' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({
			result: [{ id: 'record-id', name: 'home.example.com', type: 'A', proxied: true }],
		});
		mockUpdateRecord.mockResolvedValueOnce({});

		const response = await worker.fetch(
			new Request('http://example.com/update?ip=192.0.2.1&hostname=home.example.com&proxied=garbage', {
				headers: { Authorization: 'Basic ' + btoa('email@example.com:validtoken') },
			}),
		);

		expect(response.status).toBe(200);
		expect(mockUpdateRecord).toHaveBeenCalledWith(
			'record-id',
			expect.objectContaining({ proxied: true }),
		);
	});
});
