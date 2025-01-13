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
		console.log('Request missing API token')
		throw new HttpError(401, 'API token missing.');
	}

	const [, data] = authorization.split(' ');
	const decoded = atob(data);
	const index = decoded.indexOf(':');

	if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
		console.log('Invalid API token')
		throw new HttpError(401, 'Invalid API key or token.');
	}

	return {
		apiEmail: decoded.substring(0, index),
		apiToken: decoded.substring(index + 1),
	};
}

function constructDNSRecord(request: Request): AddressableRecord {
	const url = new URL(request.url);
	const params = url.searchParams;
	const ip = params.get('ip');
	const hostname = params.get('hostname');

	if (ip === null || ip === undefined) {
		console.log('Request missing ip parameter')
		throw new HttpError(422, 'The "ip" parameter is required and cannot be empty.');
	}

	if (hostname === null || hostname === undefined) {
		console.log('Request missing hostname parameter')
		throw new HttpError(422, 'The "hostname" parameter is required and cannot be empty.');
	}

	return {
		content: ip,
		name: hostname,
		type: ip.includes('.') ? 'A' : 'AAAA',
		ttl: 1,
	};
}

async function update(clientOptions: ClientOptions, newRecord: AddressableRecord): Promise<Response> {
	const cloudflare = new Cloudflare(clientOptions);

	const tokenStatus = (await cloudflare.user.tokens.verify()).status;
	if (tokenStatus !== 'active') {
		console.log("The API token is" + tokenStatus)
		throw new HttpError(401, 'This API Token is ' + tokenStatus);
	}

	const zones = (await cloudflare.zones.list()).result;
	if (zones.length > 1) {
		console.log('More than one zone was found! You must supply an API Token scoped to a single zone.')
		throw new HttpError(400, 'More than one zone was found! You must supply an API Token scoped to a single zone.');
	} else if (zones.length === 0) {
		console.log('No zones found! You must supply an API Token scoped to a single zone.')
		throw new HttpError(400, 'No zones found! You must supply an API Token scoped to a single zone.');
	}

	const zone = zones[0];

	const records = (
		await cloudflare.dns.records.list({
			zone_id: zone.id,
			name: newRecord.name,
			type: newRecord.type,
		})
	).result;

	if (records.length > 1) {
		console.log('More than one matching record found!')
		throw new HttpError(400, 'More than one matching record found!');
	} else if (records.length === 0 || records[0].id === undefined) {
		console.log('No record found! You must first manually create the record.')
		throw new HttpError(400, 'No record found! You must first manually create the record.');
	}

	// Extract the current `proxied` status
	const currentRecord = records[0] as AddressableRecord;
	const proxied = currentRecord.proxied ?? false; // Default to `false` if `proxied` is undefined

	await cloudflare.dns.records.update(records[0].id, {
		content: newRecord.content,
		zone_id: zone.id,
		name: newRecord.name,
		type: newRecord.type,
		proxied, // Pass the existing "proxied" status
	});

	console.log(' DNS record for ' + newRecord.name + '(' + newRecord.type +') updated successfully to ' + newRecord.content);

	return new Response('OK', { status: 200 });
}

export default {
	async fetch(request): Promise<Response> {
		try {
			// Construct client options and DNS record
			const clientOptions = constructClientOptions(request);
			const record = constructDNSRecord(request);

			// Run the update function
			return await update(clientOptions, record);
		} catch (error) {
			if (error instanceof HttpError) {
				console.log('Error updating DNS record: ' + error.message);
				return new Response(error.message, { status: error.statusCode });
			} else {
				console.log('Error updating DNS record: ' + error);
				return new Response('Internal Server Error', { status: 500 });
			}
		}
	},
} satisfies ExportedHandler<Env>;
