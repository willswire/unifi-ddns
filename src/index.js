class BadRequestException extends Error {
	constructor(reason) {
		super(reason);
		this.status = 400;
		this.statusText = "Bad Request";
	}
}

class CloudflareApiException extends Error {
	constructor(reason) {
		super(reason);
		this.status = 500;
		this.statusText = "Internal Server Error";
	}
}

class Cloudflare {
	constructor(options) {
		this.cloudflare_url = "https://api.cloudflare.com/client/v4";
		this.token = options.token;
	}

	async findZone(name) {
		const response = await this._fetchWithToken(`zones?name=${name}`);
		const body = await response.json();
		if (!body.success || body.result.length === 0) {
			throw new CloudflareApiException(`Failed to find zone '${name}'`);
		}
		return body.result[0];
	}

	async findRecord(zone, name) {
		const response = await this._fetchWithToken(`zones/${zone.id}/dns_records?name=${name}`);
		const body = await response.json();
		if (!body.success || body.result.length === 0) {
			throw new CloudflareApiException(`Failed to find dns record '${name}'`);
		}
		return body.result[0];
	}

	async updateRecord(record, value) {
		record.content = value;
		const response = await this._fetchWithToken(
			`zones/${record.zone_id}/dns_records/${record.id}`,
			{
				method: "PUT",
				body: JSON.stringify(record),
			}
		);
		const body = await response.json();
		if (!body.success) {
			throw new CloudflareApiException("Failed to update dns record");
		}
		return body.result[0];
	}

	async _fetchWithToken(endpoint, options = {}) {
		const url = `${this.cloudflare_url}/${endpoint}`;
		options.headers = {
			...options.headers,
			"Content-Type": "application/json",
			Authorization: `Bearer ${this.token}`,
		};
		return fetch(url, options);
	}
}

function requireHttps(request) {
	const { protocol } = new URL(request.url);
	const forwardedProtocol = request.headers.get("x-forwarded-proto");

	if (protocol !== "https:" || forwardedProtocol !== "https") {
		throw new BadRequestException("Please use a HTTPS connection.");
	}
}

function parseBasicAuth(request) {
	const Authorization = request.headers.get("Authorization");
	const [scheme, encoded] = Authorization.split(" ");
	const buffer = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
	const decoded = new TextDecoder().decode(buffer).normalize();
	const index = decoded.indexOf(":");

	if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
		throw new BadRequestException("Invalid authorization value.");
	}

	return {
		username: decoded.substring(0, index),
		password: decoded.substring(index + 1),
	};
}

async function handleRequest(request) {
	requireHttps(request);
	const { pathname } = new URL(request.url);

	if (pathname === "/favicon.ico" || pathname === "/robots.txt") {
		return new Response(null, { status: 204 });
	}

	if (pathname !== "/nic/update" && pathname !== "/update") {
		return new Response("Not Found.", { status: 404 });
	}

	if (!request.headers.has("Authorization")) {
		throw new BadRequestException("Please provide valid credentials.");
	}

	const { username, password } = parseBasicAuth(request);
	const url = new URL(request.url);
	verifyParameters(url);

	const response = await informAPI(url, username, password);
	return response;
}

function verifyParameters(url) {
	const { searchParams } = url;

	if (!searchParams) {
		throw new BadRequestException("You must include proper query parameters");
	}

	if (!searchParams.get("hostname")) {
		throw new BadRequestException("You must specify a hostname");
	}

	if (!(searchParams.get("ip") || searchParams.get("myip"))) {
		throw new BadRequestException("You must specify an ip address");
	}
}

async function informAPI(url, name, token) {
	const hostnames = url.searchParams.get("hostname").split(",");
	const ip = url.searchParams.get("ip") || url.searchParams.get("myip");

	const cloudflare = new Cloudflare({ token });

	const zone = await cloudflare.findZone(name);
	for (const hostname of hostnames) {
		const record = await cloudflare.findRecord(zone, hostname);
		await cloudflare.updateRecord(record, ip);
	}

	return new Response("good", {
		status: 200,
		headers: {
			"Content-Type": "text/plain;charset=UTF-8",
			"Cache-Control": "no-store",
		},
	});
}

export default {
	async fetch(request, env, ctx) {
		return handleRequest(request).catch((err) => {
			console.error(err.constructor.name, err);
			const message = err.reason || err.stack || "Unknown Error";

			return new Response(message, {
				status: err.status || 500,
				statusText: err.statusText || null,
				headers: {
					"Content-Type": "text/plain;charset=UTF-8",
					"Cache-Control": "no-store",
					"Content-Length": message.length,
				},
			});
		});
	},
};
