// Exceptions
class BadRequestException extends Error {
	status: number;
	statusText: string;

	constructor(reason: string) {
		super(reason);
		this.status = 400;
		this.statusText = 'Bad Request';
	}
}

class CloudflareApiException extends Error {
	status: number;
	statusText: string;

	constructor(reason: string) {
		super(reason);
		this.status = 500;
		this.statusText = 'Internal Server Error';
	}
}

// Cloudflare API Handler
interface CloudflareOptions {
	token: string;
}

interface DNSRecord {
	id: string;
	zone_id: string;
	type: string;
	content: string;
}

interface Zone {
	id: string;
	name: string;
}

class Cloudflare {
	private cloudflare_url: string;
	private token: string;

	constructor(options: CloudflareOptions) {
		this.cloudflare_url = 'https://api.cloudflare.com/client/v4';
		this.token = options.token;
	}

	async findZone(name: string): Promise<Zone> {
		const response = await this._fetchWithToken(`zones?name=${name}`);
		const body = (await response.json()) as any;

		if (!body.success || body.result.length === 0) {
			throw new CloudflareApiException(`Failed to find zone '${name}'`);
		}
		return body.result[0];
	}

	async findRecord(zone: Zone, name: string, isIPV4: boolean = true): Promise<DNSRecord> {
		const rrType = isIPV4 ? 'A' : 'AAAA';
		const response = await this._fetchWithToken(`zones/${zone.id}/dns_records?name=${name}`);
		const body = (await response.json()) as any;

		if (!body.success || body.result.length === 0) {
			throw new CloudflareApiException(`Failed to find DNS record '${name}'`);
		}
		return body.result.filter((rr: DNSRecord) => rr.type === rrType)[0];
	}

	async updateRecord(record: DNSRecord, value: string): Promise<DNSRecord> {
		record.content = value;
		const response = await this._fetchWithToken(`zones/${record.zone_id}/dns_records/${record.id}`, {
			method: 'PUT',
			body: JSON.stringify(record),
		});
		const body = (await response.json()) as any;

		if (!body.success) {
			throw new CloudflareApiException('Failed to update DNS record');
		}
		return body.result[0];
	}

	private async _fetchWithToken(endpoint: string, options: RequestInit = {}): Promise<Response> {
		const url = `${this.cloudflare_url}/${endpoint}`;
		options.headers = {
			...options.headers,
			'Content-Type': 'application/json',
			Authorization: `Bearer ${this.token}`,
		};
		return fetch(url, options);
	}
}

// HTTPS Enforcement
function requireHttps(request: Request): void {
	const { protocol } = new URL(request.url);
	const forwardedProtocol = request.headers.get('x-forwarded-proto');

	if (protocol !== 'https:' || forwardedProtocol !== 'https') {
		throw new BadRequestException('Please use a HTTPS connection.');
	}
}

// Basic Auth Parsing
interface AuthCredentials {
	username?: string;
	password?: string;
}

function parseBasicAuth(request: Request): AuthCredentials {
	const authorization = request.headers.get('Authorization');
	if (!authorization) return {};

	const [, data] = authorization.split(' ');
	const decoded = atob(data);
	const index = decoded.indexOf(':');

	if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
		throw new BadRequestException('Invalid authorization value.');
	}

	return {
		username: decoded.substring(0, index),
		password: decoded.substring(index + 1),
	};
}

// Handle Request
async function handleRequest(request: Request): Promise<Response> {
	requireHttps(request);
	const { pathname } = new URL(request.url);

	if (pathname === '/favicon.ico' || pathname === '/robots.txt') {
		return new Response(null, { status: 204 });
	}

	if (!pathname.endsWith('/update')) {
		return new Response('Not Found.', { status: 404 });
	}

	if (!request.headers.has('Authorization') && !request.url.includes('token=')) {
		return new Response('Not Found.', { status: 404 });
	}

	const { username, password } = parseBasicAuth(request);
	const url = new URL(request.url);
	const params = url.searchParams;

	const token = password || params.get('token');

	const hostnameParam = params.get('hostname') || params.get('host') || params.get('domains');
	const hostnames = hostnameParam?.split(',');

	const ipsParam = params.get('ips') || params.get('ip') || params.get('myip') || request.headers.get('Cf-Connecting-Ip');
	const ips = ipsParam?.split(',');

	if (!hostnames || hostnames.length === 0 || !ips || ips.length === 0) {
		throw new BadRequestException('You must specify both hostname(s) and IP address(es)');
	}

	for (const ip of ips) {
		await informAPI(hostnames, ip.trim(), username || '', token || '');
	}

	return new Response('good', {
		status: 200,
		headers: {
			'Content-Type': 'text/plain;charset=UTF-8',
			'Cache-Control': 'no-store',
		},
	});
}

// Inform Cloudflare API
async function informAPI(hostnames: string[], ip: string, name: string, token: string): Promise<void> {
	const cloudflare = new Cloudflare({ token });

	const isIPV4 = ip.includes('.'); // Simple IPv4 check
	const zones = new Map<string, Zone>();

	for (const hostname of hostnames) {
		const domainName = name && hostname.endsWith(name) ? name : hostname.replace(/.*?([^.]+\.[^.]+)$/, '$1');

		if (!zones.has(domainName)) {
			zones.set(domainName, await cloudflare.findZone(domainName));
		}

		const zone = zones.get(domainName)!;
		const record = await cloudflare.findRecord(zone, hostname, isIPV4);
		await cloudflare.updateRecord(record, ip);
	}
}

export default {
	async fetch(request): Promise<Response> {
		return handleRequest(request).catch((err: any) => {
			console.error(err.constructor.name, err);
			const message = err.message || err.stack || 'Unknown Error';

			return new Response(message, {
				status: err.status || 500,
				statusText: err.statusText || 'Internal Server Error',
				headers: {
					'Content-Type': 'text/plain;charset=UTF-8',
					'Cache-Control': 'no-store',
					'Content-Length': String(message.length),
				},
			});
		});
	},
} satisfies ExportedHandler<Env>;
