import { Cloudflare, type ClientOptions } from 'cloudflare';
import type { AAAARecord, ARecord } from 'cloudflare/resources/dns/records';
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

interface UpdateResponseBody {
	success: boolean;
	message: string;
	data: {
		ip: string;
		previousIp?: string | null;
		updated: boolean;
		records?: { hostname: string | undefined; type: string | undefined }[];
	};
}

function jsonResponse(body: UpdateResponseBody | { success: false; error: string }, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function constructClientOptions(request: Request): ClientOptions {
	const authHeader = request.headers.get('Authorization');
	if (authHeader === null || authHeader === '') {
		throw new HttpError(401, 'Authorization required.');
	}

	const [, token] = authHeader.split(' ');
	if (token === undefined || token === '') {
		throw new HttpError(401, 'Invalid authorization credentials.');
	}

	const decoded = atob(token);
	const delimiterIndex = decoded.indexOf(':');
	// eslint-disable-next-line no-control-regex
	if (delimiterIndex === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
		throw new HttpError(401, 'Invalid authorization credentials.');
	}

	return {
		apiEmail: decoded.slice(0, delimiterIndex),
		apiToken: decoded.slice(delimiterIndex + 1),
	};
}

function constructDNSRecord(request: Request): AddressableRecord[] {
	const { searchParams } = new URL(request.url);
	let ip = (searchParams.get('ip') ?? searchParams.get('myip'))?.trim() ?? null;
	const hostnameParam = (searchParams.get('hostnames') ?? searchParams.get('hostname'))?.trim() ?? null;

	if (ip === null || ip === '') {
		throw new HttpError(422, "Missing 'ip' parameter. Use ip=auto to use the client IP.");
	} else if (ip === 'auto') {
		ip = request.headers.get('CF-Connecting-IP');
		if (ip === null || ip === '') {
			throw new HttpError(500, 'ip=auto specified but client IP could not be determined.');
		}
	}

	if (hostnameParam === null || hostnameParam === '') {
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

	// Verify token status
	const { status: tokenStatus } = await cloudflare.user.tokens.verify();
	if (tokenStatus !== 'active') {
		throw new HttpError(401, `Authentication failed: token ${tokenStatus}`);
	}

	// Track last known IP per user so unchanged IPs skip the update and
	// notification entirely.
	const userEmail = clientOptions.apiEmail ?? 'unknown';
	const userKey = `ip:${userEmail}`;

	const firstRecord = newRecords[0];
	const currentIp = firstRecord?.content;
	if (currentIp === undefined || currentIp === '') {
		throw new HttpError(500, 'Unexpected error: no records provided');
	}

	let lastKnownIp: string | null = null;
	try {
		lastKnownIp = await env.DDNS_KV.get(userKey);
	} catch (error) {
		console.error(`Failed to get last known IP for user ${userEmail} from KV:`, error);
		// Continue with the update if KV access fails
	}

	if (lastKnownIp === currentIp) {
		console.log(`IP address ${currentIp} hasn't changed for user ${userEmail}. Skipping DNS update and notification.`);
		return jsonResponse(
			{
				success: true,
				message: 'No IP change detected',
				data: { ip: currentIp, updated: false },
			},
			200,
		);
	}

	const { result: zones } = await cloudflare.zones.list();
	if (zones.length === 0) {
		throw new HttpError(400, 'No zones available with current permissions.');
	}

	const updateMessages: string[] = [];

	for (const newRecord of newRecords) {
		// Retrieve the matching DNS record across all visible zones
		const matches: { record: AddressableRecord & { id: string }; zoneId: string }[] = [];
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

		const match = matches[0];
		if (match === undefined) {
			throw new HttpError(400, `No matching record found for '${newRecord.name ?? ''}'. Create it manually first.`);
		}
		if (matches.length > 1) {
			throw new HttpError(400, `Multiple matching records found for '${newRecord.name ?? ''}'. Specify a unique hostname per zone.`);
		}

		const { record, zoneId } = match;
		// The SDK types mark proxied/ttl required, but the live API can omit
		// them; default at the boundary instead of trusting the declaration.
		const { comment } = record;
		const proxied = record.proxied ?? false;
		const ttl = record.ttl ?? 1;
		await cloudflare.dns.records.update(record.id, {
			content: newRecord.content,
			zone_id: zoneId,
			name: newRecord.name,
			type: newRecord.type,
			proxied,
			comment,
			ttl,
		});

		const successMsg = `DNS record for '${newRecord.name ?? ''}' ('${newRecord.type ?? ''}') updated to '${newRecord.content ?? ''}'`;
		console.log(successMsg);
		updateMessages.push(successMsg);
	}

	// Store the new IP address as the last known IP for this user
	try {
		await env.DDNS_KV.put(userKey, currentIp);
	} catch (error) {
		console.error(`Failed to store last known IP for user ${userEmail} to KV:`, error);
		// Continue even if KV storage fails
	}

	// Send one grouped notification for all updates
	await pushNtfy(updateMessages, env);

	return jsonResponse(
		{
			success: true,
			message: 'DNS records updated successfully',
			data: {
				ip: currentIp,
				previousIp: lastKnownIp,
				updated: true,
				records: newRecords.map((r) => ({ hostname: r.name, type: r.type })),
			},
		},
		200,
	);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Clone before reading so the original body stays available downstream
		const clonedRequest = request.clone();
		const logDetails = {
			ip: request.headers.get('CF-Connecting-IP'),
			method: request.method,
			url: request.url,
			body: request.method !== 'GET' && request.method !== 'HEAD' ? await clonedRequest.text() : undefined,
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
			console.error(`Error updating DNS record: ${message}`, err);
			return jsonResponse({ success: false, error: message }, statusCode);
		}
	},
} satisfies ExportedHandler<Env>;
