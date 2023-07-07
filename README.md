# Cloudflare DDNS for UniFi OS

A Cloudflare Worker script that exposes a UniFi-compatible DDNS API to dynamically update the IP address of a DNS A record.

## Why?

I have a UniFi Dream Machine Pro (UDM-Pro), and I want to update my Cloudflare domain name DNS records when my public IP address changes. Unfortunately, UniFi does not come pre-configured to support Cloudflare as one of its DDNS providers.

### Configuring Cloudflare
You must have a Cloudflare account and your domain must be configured to point to the Cloudflare nameservers before you continue.

1. Clone or download this project
2. Ensure you have the [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed on your system
3. Log in with wrangler, and run `wrangler deploy`.
4. Once you have created the worker, take note of it's \*.workers.dev route. More on routes for Cloudflare Workers [here](https://developers.cloudflare.com/workers/platform/routes#routes-with-workersdev).
5. Create an API token so the Worker can update your DNS records. Go to https://dash.cloudflare.com/profile/api-tokens and select "Create token". On the next page, scroll down and click the "Get Started" button next to the "Create Custom Token" label. Select **Zone:DNS:Edit** for the "Permissions" drop-down, and include your target zone under the "Zone Resources" drop-down. Copy your API Key - you will need it later when configuring your UniFi OS Controller.

### Configuring UniFi OS
1. Log on to your [UniFi OS Controller](https://unifi.ui.com/)
2. Navigate to Settings > Internet > WAN and scroll down to **Dynamic DNS**. 
3. Click **Create New Dynamic DNS** and enter the following information:
- `Service`: you must choose `dyndns`
- `Hostname`: the full subdomain and hostname of the record you want to update (e.g. `subdomain.mydomain.com`, `mydomain.com` for root domain)
- `Username`: the domain name containing the record (e.g. `mydomain.com`)
- `Password`: the Cloudflare API Token you created earlier
- `Server`: the Cloudflare Worker route `<worker-name>.<worker-subdomain>.workers.dev/update?ip=%i&hostname=%h`. 

#### Important Notes!
- If you are attempting to update a subdomain (`sub.example.com`), you must manually create an A record for it **first** in your Cloudflare dashboard.
- On UniFi devices older than the UDM, the `Server` value should be configured as seen below, with no path suffix: `<worker-name>.<worker-subdomain>.workers.dev`
