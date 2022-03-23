# Cloudflare DDNS for UniFi OS

A Cloudflare Worker script that exposes a UniFi-compatible DDNS API to dynamically update the IP address of a DNS A record.

## Why?

I have a UniFi Dream Machine Pro (UDM-Pro), and I want to update my Cloudflare domain name DNS records when my public IP address changes. Unfortunately, UniFi does not come pre-configured to support Cloudflare as one of its DDNS providers.

## Configuring Cloudflare

1. Create a new [Cloudflare Worker](https://workers.cloudflare.com)
2. 'Quick Edit' the worker within your browser.
3. Copy and paste the contents of [index.js](https://github.com/willswire/unifi-cloudflare-ddns/blob/main/index.js) into the code editor for your worker. Ensure that you are replacing any boilerplate/code that is currently there. 
4. Once you have created the worker, take note of it's \*.workers.dev route. More on routes for Cloudflare Workers [here](https://developers.cloudflare.com/workers/platform/routes#routes-with-workersdev).
5. Create an API token so the Worker can update your DNS records. Go to https://dash.cloudflare.com/profile/api-tokens and select "Create custom token". Enable permissions for both **Zone:Read** and **DNS:Edit**. Copy your API Key - you will need it later when configuring your UniFi OS Controller.

## Configuring UniFi OS

1. Log on to your [UniFi OS Controller](https://unifi.ui.com/)
2. Navigate to Settings > Internet > WAN and scroll down to **Dynamic DNS**. 
3. Click **Create New Dynamic DNS** and enter the following information:
- `Service`: choose dyndns
- `Hostname`: the full subdomain and hostname of the record you want to update (e.g. `subdomain.mydomain.com`, `mydomain.com` for root domain)
- `Username`: the domain name containing the record (e.g. `mydomain.com`)
- `Password`: the Cloudflare API Token you created earlier
- `Server`: the Cloudflare Worker route `<worker-name>.<worker-subdomain>.workers.dev`

## Acknowledgements
- [inadyn](https://github.com/troglobit/inadyn) is an open-source application that supports different dynamic DNS providers. It's used by UniFi OS under-the-hood to update your public IP address. 
- [inadyn-cloudflare](https://github.com/blackjid/inadyn-cloudflare) much of the code for this project is taken from [blackjid](https://github.com/blackjid)'s project. 
- [Cloudflare Workers Basic Auth Example](https://developers.cloudflare.com/workers/examples/basic-auth)
