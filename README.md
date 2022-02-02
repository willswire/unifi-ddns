# Cloudflare Dynamic DNS backend for Inadyn

This is a small application that exposes an *inadyn* compatible API and uses Cloudflare's API to update the IP of one of your DNS A records.

[inadyn](https://github.com/troglobit/inadyn) is an open-source application that supports different dynamic DNS providers. It's used by the UDM/UDM-pro Unifi OS under the hood to update your public IP.

## Why?

I have an Unifi Dream Machine, and I want to update my home DNS when my IP changes. But the Unifi controller dynamic DNS service doesn't support Cloudflare as one of the providers.
I hope this is a temporary solution as [version 2.6](https://github.com/troglobit/inadyn/releases/tag/v2.6) of Inadyn already natively support Cloudflare.

## Create and deploy the worker

We'll use Cloudflare's wrangler CLI to build and deploy the service worker.

> You can run the following steps on your computer. You don't need to ssh into the UDM terminal.

1. Install. [Wrangler Installation](https://github.com/cloudflare/wrangler#installation)

    ```bash
    # Install
    npm install -g @cloudflare/wrangler

2. Config wrangler by following the instructions. You will need to create an API key with permissions to deploy a worker.

    ```bash
    wrangler config
    ```

   > TIP: Use the "Edit Cloudflare Workers" Template, choose "All accounts and the zone you will use.

    Copy the API key, and paste it in the terminal to complete the command above.

### Deploy the worker

You need to add your account id to the provided `wrangler.toml` file. You can get it from the Cloudflare manage worker page (on the sidebar)

1. Enable your workers subdomain. This is a subdomain on where the inadyn worker will be exposed.

    ```bash
    wrangler subdomain <worker-subdomain>
    ```

2. Publish the worker

    ```bash
    $ wrangler publish
    ✨  Built successfully, built project size is 12 KiB.
    ✨  Successfully published your script to
    https://dyndns.<worker-subdomain>.workers.dev
    ```

    > TIP: That hostname will be used on the next step on the Unifi UI

3. Create another API token so the worker can update your records. Go to https://dash.cloudflare.com/profile/api-tokens and select "Create custom token"

    On the permission section, select

   ![image](https://user-images.githubusercontent.com/228037/118659879-b2b66f80-b7bb-11eb-8321-d9be6537a751.png)

    > Copy the API key. You will use it as *password* in the next step

## Setup Unifi controller

Go to your unifi controller Dynamic Dns section and setup the following

- `service`: choose anything, it doesn't matter
- `hostname`: the name of the record you want to update (e.g. `subdomain.mydomain.com`)
- `username`: the name of the zone where the record is defined. (e.g. `mydomain.com`)
- `password`: a Cloudflare api token with `dns:edit` and `zone:read` permissions
- `server`: the Cloudflare Worker DNS plus the path `dyndns.<worker-subdomain>.workers.dev/update?hostname=%h&ip=%i`

![image](https://user-images.githubusercontent.com/228037/118659811-a3cfbd00-b7bb-11eb-8798-5a4a313c6188.png)


> Note: you might need to escape an extra slash between the hostname of your worker and the path due to a bug in the controller ui.
> `dyndns.<worker-subdomain>.workers.dev/\/update?hostname=%h&ip=%i`
> At least as of UDM controller version 6.1.71 you no longer need this

## Debugging

You can login into you UnifiOS terminal and run the following command to se how the configuration is working.

```
inadyn -1 -l debug -n -f /run/inadyn.conf
```

You can also look at the logs from the background process from the UDM

```
cat /var/log/messages | grep inadyn
```
