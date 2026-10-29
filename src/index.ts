import { ClientOptions, Cloudflare } from 'cloudflare';
import { AAAARecord, ARecord } from 'cloudflare/src/resources/dns/records.js';
type AddressableRecord = AAAARecord | ARecord;

class HttpError extends Error {
	constructor(
		public statusCode: number,
		message: string,
	) {
		super(message);
		this.name = 'HttpError';
	}
}

function constructClientOptions(request: Request): ClientOptions {
	const authorization = request.headers.get('Authorization');
	if (!authorization) {
		throw new HttpError(401, 'API token missing.');
	}

	const [, data] = authorization.split(' ');
	let decoded: string;
	try {
		decoded = atob(data);
	} catch {
		throw new HttpError(401, 'Invalid API key or token.');
	}
	const index = decoded.indexOf(':');

	if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
		throw new HttpError(401, 'Invalid API key or token.');
	}

	return {
		apiEmail: decoded.substring(0, index),
		apiToken: decoded.substring(index + 1),
	};
}

function constructDNSRecords(request: Request, env: Env): AddressableRecord[] {
	const url = new URL(request.url);
	const params = url.searchParams;
	let ip = (params.get('ip') || params.get('myip'))?.trim() || null;
	let ip6 = params.get('ip6')?.trim() || null;
	const hostname = params.get('hostname')?.trim() || null;

	if (ip === null || ip === undefined) {
		throw new HttpError(422, 'The "ip" parameter is required and cannot be empty. Specify ip=auto to use the client IP.');
	} else if (ip == 'auto') {
		ip = request.headers.get('CF-Connecting-IP');
		if (ip === null) {
			throw new HttpError(500, 'Request asked for ip=auto but client IP address cannot be determined.');
		}
	}

	if (hostname === null || hostname === undefined) {
		throw new HttpError(422, 'The "hostname" parameter is required and cannot be empty.');
	}

	if (ip6 === 'auto') {
		const connectingIp = request.headers.get('CF-Connecting-IP');
		if (connectingIp === null || !connectingIp.includes(':')) {
			throw new HttpError(422, 'Request asked for ip6=auto but client IPv6 address cannot be determined.');
		}
		ip6 = connectingIp;
	}

	// The UniFi controller sends its configured DDNS hostname verbatim. When a
	// TARGET_HOSTNAME binding is present it wins: the record actually updated is
	// the binding, so the controller can keep pointing at any legacy hostname.
	const targetHostname = env?.TARGET_HOSTNAME?.trim() || null;

	const hostnames = hostname.split(',').map((h) => h.trim()).filter(Boolean);
	if (hostnames.length === 0) {
		throw new HttpError(422, 'The "hostname" parameter is required and cannot be empty.');
	}

	const names = (targetHostname !== null ? [targetHostname] : hostnames);

	const records: AddressableRecord[] = [];

	for (const name of names) {
		records.push({
			content: ip,
			name,
			type: ip.includes('.') ? 'A' : 'AAAA',
			ttl: 1,
		});

		if (ip6 !== null && ip6 !== undefined) {
			if (!ip6.includes(':')) {
				throw new HttpError(422, 'The "ip6" parameter must be a valid IPv6 address.');
			}
			records.push({
				content: ip6,
				name,
				type: 'AAAA',
				ttl: 1,
			});
		}
	}

	return records;
}

async function update(clientOptions: ClientOptions, newRecords: AddressableRecord[]): Promise<Response> {
	const cloudflare = new Cloudflare(clientOptions);
	const lines: string[] = [];

	const tokenStatus = (await cloudflare.user.tokens.verify()).status;
	if (tokenStatus !== 'active') {
		throw new HttpError(401, 'This API Token is ' + tokenStatus);
	}

	const zones = (await cloudflare.zones.list()).result;
	if (zones.length > 1) {
		throw new HttpError(400, 'More than one zone was found! You must supply an API Token scoped to a single zone.');
	} else if (zones.length === 0) {
		throw new HttpError(400, 'No zones found! You must supply an API Token scoped to a single zone.');
	}

	const zone = zones[0];

	for (const newRecord of newRecords) {
		const records = (
			await cloudflare.dns.records.list({
				zone_id: zone.id,
				name: newRecord.name as any,
				type: newRecord.type,
			})
		).result;

		if (records.length > 1) {
			throw new HttpError(400, 'More than one matching record found!');
		} else if (records.length === 0 || records[0].id === undefined) {
			throw new HttpError(400, 'No record found! You must first manually create the record.');
		}

		const currentRecord = records[0] as AddressableRecord;

		// DynDNS2 contract: an update that would not change the record is
		// reported as `nochg` and the API call is skipped.
		if (currentRecord.content === newRecord.content) {
			lines.push(`nochg ${newRecord.content}`);
			continue;
		}

		// Extract current properties
		const proxied = currentRecord.proxied ?? false; // Default to `false` if `proxied` is undefined
		const comment = currentRecord.comment;

		await cloudflare.dns.records.update(records[0].id, {
			content: newRecord.content,
			zone_id: zone.id,
			name: newRecord.name as any,
			type: newRecord.type,
			ttl: currentRecord.ttl,
			proxied, // Pass the existing "proxied" status
			comment, // Pass the existing "comment"
		});

		console.log('DNS record for ' + newRecord.name + '(' + newRecord.type + ') updated successfully to ' + newRecord.content);
		lines.push(`good ${newRecord.content}`);
	}

	// DynDNS2 status tokens (`good <ip>` / `nochg <ip>`), one line per record;
	// inadyn-based clients (including UniFi) parse these instead of `OK`.
	return new Response(lines.join('\n'), { status: 200 });
}

export default {
	async fetch(request, env): Promise<Response> {
		try {
			// UniFi's inadyn client only ever speaks DynDNS2 over GET; reject
			// every other verb before touching credentials or parameters.
			if (request.method !== 'GET') {
				return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
			}

			// Construct client options and DNS records
			const clientOptions = constructClientOptions(request);
			const records = constructDNSRecords(request, env);

			// Run the update function
			return await update(clientOptions, records);
		} catch (error) {
			if (error instanceof HttpError) {
				console.error('Error updating DNS record: ' + error.message);
				return new Response(error.message, { status: error.statusCode });
			} else {
				console.error('Error updating DNS record: ' + error);
				return new Response('Internal Server Error', { status: 500 });
			}
		}
	},
} satisfies ExportedHandler<Env>;
