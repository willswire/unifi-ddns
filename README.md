# Cloudflare DDNS for UniFi OS

This is a small Cloudflare Workers application that exposes an UniFi-compatible DDNS API to update the IP address of your DNS A records.

## Why?

I have an UniFi Dream Machine Pro (UDM-Pro), and I want to update my Cloudflare domain name DNS records when my IP changes. Unfortunately, UniFi does not come pre-configured to support Cloudflare as one of its DDNS providers.

## Configuring Cloudflare

1. Create a [Cloudflare Worker](https://workers.cloudflare.com)
2. 'Quick Edit' the worker within your browser
3. Copy and paste the contents of [index.js](https://github.com/willswire/unifi-cloudflare-ddns/blob/main/index.js) into the code editor for your worker. Ensure that you are replacing any boilerplate/code that is currently there. 
4. Create an API token so the worker can update your records. Go to https://dash.cloudflare.com/profile/api-tokens and select "Create custom token". Enable permissions for both **Zone:Read** and **DNS:Edit**. Copy your API Key - you will need it when configuring your UniFi OS Controller.

## Configuring UniFi OS

1. Log on to your [UniFi Network Controller](https://unifi.ui.com/)
2. Navigate to Settings > Internet > WAN and scroll down to **Dynamic DNS**. Click **Create New Dynamic DNS**.
3. Enter the following information:
- `Service`: choose any service from the drop-down menu
- `Hostname`: the full subdomain and hostname of the record you want to update (e.g. `subdomain.mydomain.com`)
- `Username`: the domain name containing the record (e.g. `mydomain.com`)
- `Password`: the Cloudflare API Token you created earlier
- `Server`: the Cloudflare Worker route `ddns.<worker-subdomain>.workers.dev/update?hostname=%h&ip=%i`

## Acknowledgements
- [inadyn](https://github.com/troglobit/inadyn) is an open-source application that supports different dynamic DNS providers. It's used by UniFi OS under-the-hood to update your public IP address. 
- [inadyn-cloudflare](https://github.com/blackjid/inadyn-cloudflare) much of the code for this project is taken from [blackjid](https://github.com/blackjid)'s project. 
- [Cloudflare Workers Basic Auth Example](https://developers.cloudflare.com/workers/examples/basic-auth)
