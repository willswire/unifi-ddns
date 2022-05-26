# Cloudflare DDNS for UniFi OS

A Cloudflare Worker script that exposes a UniFi-compatible DDNS API to dynamically update the IP address of a DNS A record. A plug-n-play, hosted implementaiton of this service is available for free (see `Solution 2` below).

## Why?

I have a UniFi Dream Machine Pro (UDM-Pro), and I want to update my Cloudflare domain name DNS records when my public IP address changes. Unfortunately, UniFi does not come pre-configured to support Cloudflare as one of its DDNS providers.

## Solution 1 - Manual Configuration

### Configuring Cloudflare
You must have a Cloudflare account and your domain must be configured to point to the Cloudflare nameservers before you continue. If you do not wish to create your own Cloudflare worker, please consider `Solution 2 - Hosted Configuration`.

1. Create a new [Cloudflare Worker](https://workers.cloudflare.com)
2. 'Quick Edit' the worker within your browser.
3. Copy and paste the contents of [index.js](https://github.com/willswire/unifi-cloudflare-ddns/blob/main/index.js) into the code editor for your worker. Ensure that you are replacing any boilerplate/code that is currently there. 
4. Once you have created the worker, take note of it's \*.workers.dev route. More on routes for Cloudflare Workers [here](https://developers.cloudflare.com/workers/platform/routes#routes-with-workersdev).
5. Create an API token so the Worker can update your DNS records. Go to https://dash.cloudflare.com/profile/api-tokens and select "Create custom token". Enable permissions for both **Zone:Read** and **DNS:Edit**. Copy your API Key - you will need it later when configuring your UniFi OS Controller.

### Configuring UniFi OS
1. Log on to your [UniFi OS Controller](https://unifi.ui.com/)
2. Navigate to Settings > Internet > WAN and scroll down to **Dynamic DNS**. 
3. Click **Create New Dynamic DNS** and enter the following information:
- `Service`: you must choose `dyndns`
- `Hostname`: the full subdomain and hostname of the record you want to update (e.g. `subdomain.mydomain.com`, `mydomain.com` for root domain)
- `Username`: the domain name containing the record (e.g. `mydomain.com`)
- `Password`: the Cloudflare API Token you created earlier
- `Server`: the Cloudflare Worker route `<worker-name>.<worker-subdomain>.workers.dev/update?ip=%i&hostname=`. 

#### Important Note!
On UniFi devices older than the UDM, the `Server` value should be configured as seen below, with no path suffix: 
- `<worker-name>.<worker-subdomain>.workers.dev`

## Solution 2 - Free Hosted Configuration (BETA)

### Overview
Because the Worker code makes requests to Cloudflare's API on your behalf using your designated domain name and API key, any worker running the code found in [index.js](https://github.com/willswire/unifi-cloudflare-ddns/blob/main/index.js) will process requestes and update your DNS records accordingly. In other words, use this solution if you prefer not to manually configure anything on Cloudflare yourself!

### Configuring UniFi OS
1. Log on to your [UniFi OS Controller](https://unifi.ui.com/)
2. Navigate to Settings > Internet > WAN and scroll down to **Dynamic DNS**. 
3. Click **Create New Dynamic DNS** and enter the following information:
- `Service`: you must choose `dyndns`
- `Hostname`: the full subdomain and hostname of the record you want to update (e.g. `subdomain.mydomain.com`, `mydomain.com` for root domain)
- `Username`: the domain name containing the record (e.g. `mydomain.com`)
- `Password`: the Cloudflare API Token you created earlier
- `Server`: the free, hosted Cloudflare Worker at `unificloudflareddns.com/update?ip=%i&hostname=`

#### Important Note!
On UniFi devices older than the UDM, the `Server` value should be configured as seen below, with no path suffix: 
- `unificloudflareddns.com`

## Acknowledgements
- [inadyn](https://github.com/troglobit/inadyn) is an open-source application that supports different dynamic DNS providers. It's used by UniFi OS on newer devices under-the-hood to update your public IP address. (UDM onwards)
- [ddclient](https://github.com/ddclient/ddclient) is an open-source application that supports different dynamic DNS providers. It's used by UniFi OS on older devices under-the-hood to update your public IP address. (such as the USG-3P)
- [inadyn-cloudflare](https://github.com/blackjid/inadyn-cloudflare) much of the code for this project is taken from [blackjid](https://github.com/blackjid)'s project. 
- [Cloudflare Workers Basic Auth Example](https://developers.cloudflare.com/workers/examples/basic-auth)
