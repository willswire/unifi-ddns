# 🌩️ Cloudflare DDNS for UniFi OS

[![CodeQL](https://github.com/willswire/unifi-ddns/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/willswire/unifi-ddns/actions/workflows/github-code-scanning/codeql)
[![Code Coverage](https://github.com/willswire/unifi-ddns/actions/workflows/coverage.yml/badge.svg)](https://github.com/willswire/unifi-ddns/actions/workflows/coverage.yml)
[![Dependabot Updates](https://github.com/willswire/unifi-ddns/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/willswire/unifi-ddns/actions/workflows/dependabot/dependabot-updates)
[![Deploy](https://github.com/willswire/unifi-ddns/actions/workflows/deploy.yml/badge.svg)](https://github.com/willswire/unifi-ddns/actions/workflows/deploy.yml)

A Cloudflare Worker script that enables UniFi devices (e.g., UDM-Pro, USG) to dynamically update DNS A/AAAA records on Cloudflare.

## Why Use This?

UniFi devices do not natively support Cloudflare as a DDNS provider. This script bridges that gap, allowing your UniFi device to keep your DNS records updated with your public IP address.

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
   - **Password:** Cloudflare User API Token *(not an Account API Token)*
   - **Server:** `<worker-name>.<worker-subdomain>.workers.dev/update?ip=%i&hostname=%h`
     *(Omit `https://`)*

## 🛠️ **Testing & Troubleshooting**

Using this script with various Ubiquiti devices and different UniFi software versions can introduce unique challenges. If you encounter issues, start by checking the FAQ in `/docs/faq.md`. If you don’t find a solution, you can ask a question on the [discussions page](https://github.com/willswire/unifi-ddns/discussions/new?category=q-a). If the problem persists, please raise an issue [here](https://github.com/willswire/unifi-ddns/issues).
