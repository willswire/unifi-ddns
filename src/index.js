var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var BadRequestException = /* @__PURE__ */ __name(class extends Error {
  constructor(reason) {
    super(reason);
    this.status = 400;
    this.statusText = "Bad Request";
  }
}, "BadRequestException");
__name2(BadRequestException, "BadRequestException");
var CloudflareApiException = /* @__PURE__ */ __name(class extends Error {
  constructor(reason) {
    super(reason);
    this.status = 500;
    this.statusText = "Internal Server Error";
  }
}, "CloudflareApiException");
__name2(CloudflareApiException, "CloudflareApiException");
var Cloudflare = /* @__PURE__ */ __name(class {
  constructor(options) {
    this.cloudflare_url = "https://api.cloudflare.com/client/v4";
    this.token = options.token;
  }
  // Find zone by name
  async findZone(name) {
    const response = await this._fetchWithToken(`zones?name=${name}`);
    const body = await response.json();
    if (!body.success || body.result.length === 0) {
      throw new CloudflareApiException(`Failed to find zone '${name}'`);
    }
    return body.result[0];
  }
  // Find record by zone and name
  async findRecord(zone, name, isIPV4 = true) {
    const rrType = isIPV4 ? "A" : "AAAA";
    const response = await this._fetchWithToken(`zones/${zone.id}/dns_records?name=${name}`);
    const body = await response.json();
    if (!body.success || body.result.length === 0) {
      throw new CloudflareApiException(`Failed to find DNS record '${name}'`);
    }
    return body.result?.filter((rr) => rr.type === rrType)?.[0] || null;
  }
  // Update DNS record
  async updateRecord(record, value) {
    if (!record) {
      throw new CloudflareApiException("Record is undefined, cannot update.");
    }
    console.log("Updating record:", record, "with value:", value);
    record.content = value;
    const response = await this._fetchWithToken(
      `zones/${record.zone_id}/dns_records/${record.id}`,
      {
        method: "PUT",
        body: JSON.stringify(record)
      }
    );
    const body = await response.json();
    if (!body.success) {
      throw new CloudflareApiException("Failed to update DNS record");
    }
    return body.result[0];
  }
  // Helper to make requests with token authentication
  async _fetchWithToken(endpoint, options = {}) {
    const url = `${this.cloudflare_url}/${endpoint}`;
    options.headers = {
      ...options.headers,
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`
    };
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const error = await response.json();
        throw new CloudflareApiException(error.errors?.[0]?.message || "API request failed");
      }
      return response;
    } catch (err) {
      throw new CloudflareApiException(`Network error: ${err.message}`);
    }
  }
}, "Cloudflare");
__name2(Cloudflare, "Cloudflare");
function requireHttps(request) {
  const { protocol } = new URL(request.url);
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  if (protocol !== "https:" || forwardedProtocol !== "https") {
    throw new BadRequestException("Please use a HTTPS connection.");
  }
}
__name(requireHttps, "requireHttps");
__name2(requireHttps, "requireHttps");
function parseBasicAuth(request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization)
    return {};
  const [, data] = authorization?.split(" ");
  const decoded = atob(data);
  const index = decoded.indexOf(":");
  if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
    throw new BadRequestException("Invalid authorization value.");
  }
  return {
    username: decoded?.substring(0, index),
    password: decoded?.substring(index + 1)
  };
}
__name(parseBasicAuth, "parseBasicAuth");
__name2(parseBasicAuth, "parseBasicAuth");
async function handleRequest(request) {
  requireHttps(request);
  const { pathname } = new URL(request.url);
  if (pathname === "/favicon.ico" || pathname === "/robots.txt") {
    return new Response(null, { status: 204 });
  }
  if (!pathname.endsWith("/update")) {
    return new Response("Not Found.", { status: 404 });
  }
  const { username, password } = parseBasicAuth(request);
  const url = new URL(request.url);
  const params = url.searchParams;
  const token = params?.get("token") || password || "";
  if (!token) {
    throw new BadRequestException("Authorization token missing.");
  }
  const hostnameParam = params?.get("hostname") || params?.get("host") || params?.get("domains");
  const hostnames = hostnameParam?.split(",");
  const ipsParam = params.get("ips") || params.get("ip") || params.get("myip") || request.headers?.get("Cf-Connecting-Ip");
  const ips = ipsParam?.split(",");
  if (!hostnames || !ips || hostnames.length === 0 || ips.length === 0) {
    throw new BadRequestException("You must specify both hostname(s) and IP address(es)");
  }
  await Promise.all(
    ips.map(
      (ip) => informAPI(hostnames, ip.trim(), username, token)
    )
  );
  return new Response("good", {
    status: 200,
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}
__name(handleRequest, "handleRequest");
__name2(handleRequest, "handleRequest");
async function informAPI(hostnames, ip, name, token) {
  const cloudflare = new Cloudflare({ token });
  const isIPV4 = ip.includes(".");
  const zones = /* @__PURE__ */ new Map();
  await Promise.all(
    hostnames.map(async (hostname) => {
      const domainName = name && hostname.endsWith(name) ? name : hostname.replace(/.*?([^.]+\.[^.]+)$/, "$1");
      if (!zones.has(domainName)) {
        zones.set(domainName, await cloudflare.findZone(domainName));
      }
      const zone = zones.get(domainName);
      const record = await cloudflare.findRecord(zone, hostname, isIPV4);
      if (!record) {
        throw new CloudflareApiException(`Record not found for hostname '${hostname}'`);
      }
      await cloudflare.updateRecord(record, ip);
    })
  );
}
__name(informAPI, "informAPI");
__name2(informAPI, "informAPI");
var src_default = {
  async fetch(request, env, ctx) {
    return handleRequest(request).catch((err) => {
      console.error(`[Error]: ${err.constructor.name} - ${err.message}`);
      return new Response(err.message || "Unknown Error", {
        status: err.status || 500,
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
          "Cache-Control": "no-store"
        }
      });
    });
  }
};
export {
  src_default as default
};
//# sourceMappingURL=index.js.map
