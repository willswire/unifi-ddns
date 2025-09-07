import { ClientOptions, Cloudflare } from 'cloudflare';
import { ARecord, AAAARecord } from 'cloudflare/src/resources/dns/records.js';
import { pushNtfy } from './pushNtfy';

type AddressableRecord = ARecord | AAAARecord;

export class HttpError extends Error {
	constructor(
		public readonly statusCode: number,
		message: string,
	) {
		super(message);
		this.name = new.target.name;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

function constructClientOptions(request: Request): ClientOptions {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader) {
		throw new HttpError(401, 'API Token missing.');
	}

	const [_, token] = authHeader.split(' ');
	if (!token) {
		throw new HttpError(401, 'Invalid API Token.');
	}

	const decoded = atob(token);
	const delimiterIndex = decoded.indexOf(':');
	if (delimiterIndex === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
		throw new HttpError(401, 'Invalid API Token.');
	}

	return {
		apiEmail: decoded.slice(0, delimiterIndex),
		apiToken: decoded.slice(delimiterIndex + 1),
	};
}

function constructDNSRecord(request: Request): AddressableRecord[] {
	const { searchParams } = new URL(request.url);
	let ip = searchParams.get('ip') || searchParams.get('myip');
	const hostnameParam = searchParams.get('hostnames') || searchParams.get('hostname');

	if (!ip) {
		throw new HttpError(422, "Missing 'ip' parameter. Use ip=auto to use the client IP.");
	} else if (ip === 'auto') {
		ip = request.headers.get('CF-Connecting-IP');
		if (!ip) {
			throw new HttpError(500, 'ip=auto specified but client IP could not be determined.');
		}
	}

	if (!hostnameParam) {
		throw new HttpError(422, "Missing 'hostname' parameter.");
	}
	const hostnames = hostnameParam
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	if (hostnames.length === 0) {
		throw new HttpError(422, 'No hostnames provided.');
	}

	// For each hostname, create the corresponding DNS record object.
	return hostnames.map((hostname) => ({
		content: ip,
		name: hostname,
		type: ip.includes('.') ? 'A' : 'AAAA',
		ttl: 1,
	}));
}

async function updateHostnames(clientOptions: ClientOptions, newRecords: AddressableRecord[], env: Env): Promise<Response> {
	const cloudflare = new Cloudflare(clientOptions);

	// Verify API token status
	const { status: tokenStatus } = await cloudflare.user.tokens.verify();
	if (tokenStatus !== 'active') {
		throw new HttpError(401, `API Token status: '${tokenStatus}'`);
	}

	// Expect exactly one zone
	const { result: zones } = await cloudflare.zones.list();
	if (zones.length === 0) {
		throw new HttpError(400, 'No zones available in API Token.');
	}

	for (const newRecord of newRecords) {
		// Retrieve matching DNS record
		let matches: { record: AddressableRecord & { id: string }; zoneId: string }[] = [];
		for (const zone of zones) {
			const { result: records } = await cloudflare.dns.records.list({
				zone_id: zone.id,
				name: newRecord.name as Cloudflare.DNS.Records.RecordListParams.Name,
				type: newRecord.type,
			});
			matches.push(
				...records.filter((rec) => rec.id).map((rec) => ({ record: rec as AddressableRecord & { id: string }, zoneId: zone.id })),
			);
		}

		if (matches.length === 0) {
			throw new HttpError(400, `No matching record found for '${newRecord.name}'. Create it manually first.`);
		}
		if (matches.length > 1) {
			throw new HttpError(400, `Multiple matching records found for '${newRecord.name}'. Specify a unique hostname per zone.`);
		}

		// Update the DNS record
		const { record, zoneId } = matches[0];
		const { proxied = false, comment, ttl = 1 } = record;
		await cloudflare.dns.records.update(record.id, {
			content: newRecord.content,
			zone_id: zoneId,
			name: newRecord.name,
			type: newRecord.type,
			proxied,
			comment,
			ttl,
		});

		const successMsg = `DNS record for '${newRecord.name}' ('${newRecord.type}') updated to '${newRecord.content}'`;
		console.log(successMsg);
		await pushNtfy(successMsg, env);
	}

	return new Response('OK', { status: 200 });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const logDetails = {
			ip: request.headers.get('CF-Connecting-IP'),
			method: request.method,
			url: request.url,
			body: await request.text(),
		};
		console.log('Incoming request:', logDetails);

		try {
			const clientOptions = constructClientOptions(request);
			const record = constructDNSRecord(request);
			return await updateHostnames(clientOptions, record, env);
		} catch (err: unknown) {
			const isHttpError = err instanceof HttpError;
			const message = isHttpError ? err.message : 'Internal Server Error';
			const statusCode = isHttpError ? err.statusCode : 500;
			console.error(`Error updating DNS record: ${message}`);
			return new Response(message, { status: statusCode });
		}
	},
} satisfies ExportedHandler<Env>;
