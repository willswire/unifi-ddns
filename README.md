# Cloudflare DDNS for UniFi OS

A Cloudflare Worker script that enables UniFi devices (e.g., UDM-Pro, USG) to dynamically update DNS A/AAAA records on Cloudflare.

## Why Use This?

UniFi devices do not natively support Cloudflare as a DDNS provider. This script bridges that gap, allowing your UniFi device to keep your DNS records updated with your public IP address.

---

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
   wrangler login
   wrangler deploy
   ```
4. Note the `*.workers.dev` route.

---

### 2. **Generate a Cloudflare API Token**

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Profile > API Tokens**
3. Create a token using the **Edit zone DNS** template.
4. Scope the token to **one** specific zone.
5. Save the token securely.

---

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

---

## 🛠️ **Testing & Troubleshooting**

### **UDM-Pro Testing**
1. SSH into your UDM-Pro.
2. Run:
   ```sh
   ps aux | grep inadyn
   inadyn -n -1 --force -f /run/ddns-eth4-inadyn.conf
   ```
3. Check `/var/log/messages` for errors.

### **USG Testing**
1. SSH into your USG.
2. Run:
   ```sh
   sudo ddclient -daemon=0 -verbose -noquiet -debug -file /etc/ddclient/ddclient_eth0.conf
   ```
3. Look for `SUCCESS` in the output.

---

## ⚠️ **Important Notes**

- Updates occur approximately every two minutes. You can tail the worker logs to validate updates from your UniFi device.
- For **subdomains** (`sub.example.com`), manually create an A record in Cloudflare first.
- Remove `https://` from the **Server** field.
- **Wildcard domains:** Use `*.example.com` in the **Hostname** field.
- UniFi OS may require recreating DDNS entries instead of editing them.
