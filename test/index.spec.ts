// test/index.spec.ts
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('UniFi DDNS Worker', () => {
	it('responds with 401 unauthorized', async () => {
		const response = await SELF.fetch('http://example.com/update?ip=192.0.2.1&hostname=home.example.com');
		expect(response.status).toMatchInlineSnapshot(`401`);
	});
});
