# 🌩️ Cloudflare DDNS for UniFi OS

[![CodeQL](https://github.com/zachthedev/ddns/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/zachthedev/ddns/actions/workflows/github-code-scanning/codeql)
[![CI](https://github.com/zachthedev/ddns/actions/workflows/ci.yml/badge.svg)](https://github.com/zachthedev/ddns/actions/workflows/ci.yml)
[![Dependabot Updates](https://github.com/zachthedev/ddns/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/zachthedev/ddns/actions/workflows/dependabot/dependabot-updates)
[![Deploy](https://github.com/zachthedev/ddns/actions/workflows/deploy.yml/badge.svg)](https://github.com/zachthedev/ddns/actions/workflows/deploy.yml)

A Cloudflare Worker script that enables UniFi devices (e.g., UDM-Pro, USG) to dynamically update DNS A/AAAA records on Cloudflare.

## Notice

This is a fork from [willswire](https://github.com/willswire/unifi-ddns) with the following enhancements:

- **Smart notifications** - Only sends [ntfy](https://ntfy.sh) alerts when your IP actually changes
- **API** - Returns structured JSON responses instead of plain text
- **Multi-hostname support** - Update multiple hostnames in a single request using comma-separated values
- **Multi-zone support** - API tokens can manage DNS records across multiple zones

## Why Use This?

UniFi devices do not natively support Cloudflare as a DDNS provider. This script bridges that gap, allowing your UniFi device to keep your DNS records updated with your public IP address.

## 🚀 **Setup Overview**

### 1. **Deploy the Cloudflare Worker**

#### **Option 1: Click to Deploy**

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zachthedev/ddns)

1. Click the button above.
2. Complete the deployment.
3. Note the `*.workers.dev` route.

#### **Option 2: Deploy with the CLI**

Requires [bun](https://bun.sh).

1. Clone this repository.
2. Install dependencies:
   ```sh
   bun install
   ```
3. Log in and run the interactive setup. It provisions the KV namespaces,
   writes their IDs to `.env.local` (gitignored), and optionally configures
   the ntfy notification secret:
   ```sh
   bun x wrangler login
   bun run setup
   ```
4. Deploy:
   ```sh
   bun run deploy
   ```
5. Note the `*.workers.dev` route.

#### **Option 3: Deploy on every push with GitHub Actions**

Fork this repository, run setup locally once (Option 2, steps 1 to 3), then add
these repository secrets; every push to `main` deploys automatically:

- `CLOUDFLARE_API_TOKEN` - API token with Workers deploy permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
- `KV_NAMESPACE_ID` - Production namespace ID (from `.env.local`)
- `KV_NAMESPACE_PREVIEW_ID` - Preview namespace ID (from `.env.local`)
- `NTFY_URL` - Optional ntfy topic URL for change notifications

The committed `wrangler.jsonc` only ever contains placeholders; real IDs are
injected at deploy time from the environment.

### 2. **Generate a Cloudflare API Token**

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Profile > API Tokens**
3. Create a token using the **Edit zone DNS** template.
4. Scope the token to **one** specific zone.
5. Save the token securely.

### 3. **Configure UniFi OS**

1. Log in to your [UniFi OS Controller](https://unifi.ui.com/).
2. Go to **Settings > Internet > WAN > Dynamic DNS**.
3. Create New Dynamic DNS with the following information:
   - **Service:** `custom`
   - **Hostname:** `subdomain.example.com` or `example.com`
   - **Username:** Cloudflare Account Email Address (e.g., `you@example.com`)
   - **Password:** Cloudflare User API Token _(not an Account API Token)_
   - **Server:** `<worker-name>.<worker-subdomain>.workers.dev/update?ip=%i&hostname=%h`
     _(Omit `https://`)_

## 🛠️ **Testing & Troubleshooting**

Using this script with various Ubiquiti devices and different UniFi software versions can introduce unique challenges. If you encounter issues, start by checking the FAQ in `/docs/faq.md`. If you don’t find a solution, you can ask a question on the [discussions page](https://github.com/zachthedev/ddns/discussions/new?category=q-a). If the problem persists, please raise an issue [here](https://github.com/zachthedev/ddns/issues).
