# Cloudflare DDNS for UniFi OS

A Cloudflare Worker script that provides a UniFi-compatible DDNS API to dynamically update the IP address of a DNS A record.

## Why?

UniFi Dream Machine Pro (UDM-Pro) or UniFi Security Gateway (USG) users may need to update Cloudflare domain name DNS records when their public IP address changes. UniFi does not natively support Cloudflare as a DDNS provider.

## Configuring Cloudflare

Ensure you have a Cloudflare account and your domain is configured to point to Cloudflare nameservers.

### Worker Setup

#### Deploy With Click To Deploy

1. Deploy the Worker: [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/workerforce/unifi-ddns)
2. Navigate to the Cloudflare Workers dashboard.
3. After deployment, note the `\*.workers.dev` route.

#### Deploy With Wrangler CLI

1. Clone or download this project.
2. Ensure you have [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed.
3. Log in with Wrangler and run `wrangler deploy`.
4. Note the `\*.workers.dev` route after creation.

### API Token for DNS Record Updates
An API Token will be needed for each UniFi client performing DDNS updates.
To create the token(s):
1. Tokens can now be created at the user level or account level

   User token:  
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Key differences:
     - Access to all accounts for which the user is a member and has permissions (unless explicitly limited in token settings)
     - Actions performed by this token are associated with the user
     - Viewable/Editable only by the creating user

   Account token: (Recommended)
   - On the [CloudFlare Dashboard](https://dash.cloudflare.com/), open the account which manages the target zone(s)
   - Select Manage Account > Account API Tokens 
   - Key differences:
     - Access limited to only the account for which it is created
     - Actions performed by this token are not attributed to a user
     - Viewable/Editable by all account members (with the appropriate permissions)
2. Click "Create Token"
3. Click "Use Template" for "Edit zone DNS"
4. Under "Zone Resources," include the target zone or select "All zones from an account."
   (If using a user token, "All zones" is also an option.)  
   Set a token name and/or additional restrictions as desired.
5. Click "Continue to summary" then "Create Token."  
   Copy and save the generated token for later use configuring the UniFi OS Controller.

## Configuring UniFi OS

1. Log in to your [UniFi OS Controller](https://unifi.ui.com/).
2. Navigate to Settings > Internet > WAN and scroll down to **Dynamic DNS**.
3. Click **Create New Dynamic DNS** and provide:
   - `Service`: Choose `custom` or `dyndns`.
   - `Hostname`: Full subdomain and hostname to update (e.g., `subdomain.mydomain.com` or `mydomain.com` for root domain).
   - `Username`: Domain name containing the record (e.g., `mydomain.com`).
   - `Password`: Cloudflare API Token.
   - `Server`: Cloudflare Worker route `<worker-name>.<worker-subdomain>.workers.dev/update?ip=%i&hostname=%h`.
     - For older UniFi devices, omit the URL path.
     - Remove `https://` from the URL.

### Testing Changes - UDM-Pro
To test the configuration and force an update on a UDM-Pro:

1. SSH into your UniFi device.
2. Run `ps aux | grep inadyn`.
3. Note the configuration file path.
4. Run `inadyn -n -1 --force -f <config-path>` (e.g., `inadyn -n -1 --force -f /run/ddns-eth4-inadyn.conf`).
5. Check `/var/log/messages` for related error messages.

### Testing Changes - USG
To test the configuration and force an update on a USG:

1. SSH into your USG device.
2. Run `ls /run/ddclient/` (e.g.: `/run/ddclient/ddclient_eth0.pid`)
3. Note the pid file path as this will tell you what configuration to use. (e.g.: `ddclient_eth0`)
4. Run `sudo ddclient -daemon=0 -verbose -noquiet -debug -file /etc/ddclient/<config>.conf` (e.g., `sudo ddclient -daemon=0 -verbose -noquiet -debug -file /etc/ddclient/ddclient_eth0.conf`).
5. This should output `SUCCESS` when the DNS record is set.

### Important Notes!

- For subdomains (`sub.example.com`), create an A record manually in Cloudflare dashboard first.
- If you encounter a hostname resolution error (`inadyn[2173778]: Failed resolving hostname https: Name or service not known`), remove `https://` from the `Server` field.
