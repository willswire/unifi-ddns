# 🌩️ Cloudflare DDNS for UniFi OS

[![CodeQL](https://github.com/willswire/unifi-ddns/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/willswire/unifi-ddns/actions/workflows/github-code-scanning/codeql)
[![Code Coverage](https://github.com/willswire/unifi-ddns/actions/workflows/coverage.yml/badge.svg)](https://github.com/willswire/unifi-ddns/actions/workflows/coverage.yml)
[![Dependabot Updates](https://github.com/willswire/unifi-ddns/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/willswire/unifi-ddns/actions/workflows/dependabot/dependabot-updates)
[![Deploy](https://github.com/willswire/unifi-ddns/actions/workflows/deploy.yml/badge.svg)](https://github.com/willswire/unifi-ddns/actions/workflows/deploy.yml)

A Cloudflare Worker script that enables UniFi devices (e.g., UDM-Pro, USG) to dynamically update DNS A/AAAA records on Cloudflare.

## Why Use This?

> **Note:** UniFi Network Application 9.1.92+ includes native Cloudflare DDNS support. If your gateway runs this firmware or newer, you may not need this worker. However, the native implementation does not support multi-hostname updates, dual-stack (IPv4 + IPv6), or preserving proxy status — this worker remains useful for those use cases and for older firmware.

UniFi devices running older firmware do not natively support Cloudflare as a DDNS provider. This script bridges that gap, allowing your UniFi device to keep your DNS records updated with your public IP address.

## 🚀 **Setup Overview**

### 1. **Deploy the Cloudflare Worker**

#### **Option 1: Click to Deploy**
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/willswire/unifi-ddns)

1. Click the button above.
2. Complete the deployment.
3. Note the `*.workers.dev` route.

#### **Option 2: Deploy with Wrangler CLI**
1. Clone this repository.
2. Install [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/).
3. Run:
   ```sh
   npm i
   wrangler login
   wrangler deploy
   ```
4. Note the `*.workers.dev` route.

### 2. **Update an Existing Deployment**

Your DDNS configuration (UniFi settings and DNS records) is not affected by redeploying the Worker — it lives in your Cloudflare zone and UniFi controller, not in the Worker itself. Only the Worker code changes.

1. Pull the latest changes from this repository:
   ```sh
   git pull
   ```
2. Update dependencies in case they changed:
   ```sh
   npm i
   ```
3. Deploy the new version:
   ```sh
   wrangler deploy
   ```

`wrangler deploy` overwrites the Worker in the same account and keeps the same `*.workers.dev` route as defined in [wrangler.toml](wrangler.toml), so no UniFi configuration changes are needed after the update. If your existing deployment used a different Worker name, edit the `name` field in `wrangler.toml` before deploying — deploying with a different name would create a new Worker instead of updating the existing one, and the old Worker would keep receiving updates with the previous code.

To verify which version is deployed, compare it with your local copy or stream live logs during a DDNS update:

```sh
wrangler tail
```

### 3. **Generate a Cloudflare API Token**

This token is created in Cloudflare, but you will **not** enter it anywhere in the Worker. The Worker never holds credentials — your UniFi gateway sends the token to it on every DDNS update.

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Click the profile icon (top right) and go to **My Profile > API Tokens** (or go directly to <https://dash.cloudflare.com/profile/api-tokens>).
3. Click **Create Token** and use the **Edit zone DNS** template.
4. Under **Zone Resources**, scope the token to **one** specific zone (the domain that holds the record to update). Tokens with access to multiple zones are rejected — see [FAQ #8](docs/faq.md).
5. Click **Continue to summary**, then **Create Token**, and copy the token value. It is shown only once.

### 4. **Configure UniFi OS**

This is where the credentials are configured. The Cloudflare API token from the previous step goes into the **Password** field of the Dynamic DNS entry — nowhere else.

1. Log in to your [UniFi OS Controller](https://unifi.ui.com/).
2. Go to **Settings > Internet > WAN > Dynamic DNS**.
3. Create a new Dynamic DNS entry with the following information:

   | UniFi field | Value to enter |
   |---|---|
   | **Service** | `custom` |
   | **Hostname** | `subdomain.example.com` or `example.com` |
   | **Username** | Your Cloudflare account email address (e.g., `you@example.com`) — the one that owns the API token |
   | **Password** | The Cloudflare **API Token** created in step 3 (the 40-character string starting with something like `v1.0-...`, **not** your Cloudflare account password and **not** a Global API Key) |
   | **Server** | `<worker-name>.<worker-subdomain>.workers.dev/update?ip=%i&hostname=%h` *(omit `https://`)* |

   > For IPv6/AAAA updates, append `&ip6=auto` to the server URL so the worker derives your WAN IPv6 from the incoming connection — see [FAQ #15](docs/faq.md).

## 🛠️ **Testing & Troubleshooting**

### Force an update manually

Dynamic DNS clients back off after a successful update, so the fastest way to confirm the worker works is to call it yourself:

```sh
DDNS_WORKER_URL=https://unifi-ddns.<subdomain>.workers.dev/update \
DDNS_HOSTNAME=home.example.com \
DDNS_EMAIL=you@example.com \
DDNS_API_TOKEN=v1.0-... \
./scripts/force-update.sh
```

`scripts/force-update.sh` (also available as `npm run force-update`) sends the same request the UniFi controller sends — Basic auth with your Cloudflare account email and API token, plus the `hostname` and `ip` query parameters — then prints the status code and the worker response. It exits non-zero when the worker rejects the request.

`DDNS_IP` defaults to `auto`, which resolves to your public address from `CF-Connecting-IP`. Against `npm run dev` that header is not present, so pass an explicit address instead (`DDNS_IP=203.0.113.10`). Add `DDNS_IP6=auto` to also update the AAAA record. Run `./scripts/force-update.sh --help` for the full list of variables.

Using this script with various Ubiquiti devices and different UniFi software versions can introduce unique challenges. If you encounter issues, start by checking the FAQ in `/docs/faq.md`. If you don’t find a solution, you can ask a question on the [discussions page](https://github.com/willswire/unifi-ddns/discussions/new?category=q-a). If the problem persists, please raise an issue [here](https://github.com/willswire/unifi-ddns/issues).
