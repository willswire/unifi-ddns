# Frequently Asked Questions

This FAQ addresses common issues and solutions for configuring UniFi devices to update Cloudflare DNS records using DDNS, based on discussions from [issues](https://github.com/willswire/unifi-ddns/issues/) and [discussions](https://github.com/willswire/unifi-ddns/discussions).

## 1. What is the correct server configuration for UniFi devices when using Cloudflare DDNS?

The server configuration depends on your UniFi device model:

- **Older Gateways (e.g., USG, USG Pro):**
  - **Server:** `unifi-cloudflare-ddns.<your_worker_subdomain>.workers.dev`
  - **Note:** Do **not** include the path with variables.

- **Newer Gateways (e.g., UDM series, UXG series):**
  - **Server:** `unifi-cloudflare-ddns.<your_worker_subdomain>.workers.dev/update?ip=%i&hostname=%h`
  - **Note:** Include the full path with variables.

This distinction is crucial to ensure the DDNS updates function correctly.

## 2. How do I configure DDNS on my UniFi device?

1. **Access UniFi Controller:**
   - Navigate to **Settings** > **Internet** > **WAN** > **Dynamic DNS**.

2. **Create New Dynamic DNS Entry:**
   - **Service:** Select `custom`.
   - **Hostname:** Enter your desired hostname (e.g., `subdomain.example.com`).
   - **Username:** Enter your Cloudflare account email.
   - **Password:** Enter your Cloudflare API token.
   - **Server:** Enter the appropriate server address based on your device model (see FAQ #1).

3. **Save Configuration:**
   - Click **Save** to apply the settings.

## 3. How should I format the server field when configuring DDNS on my UniFi device?

Remove `https://` from the **Server** field before inputting the server address.

## 4. What should I do if I encounter the error: "Failed to find zone '%h/nic/update?system=dyndns'"?

This error typically occurs due to incorrect server configuration. Ensure that:

- For **older gateways**, the server field contains only the FQDN without the path.
- For **newer gateways**, the server field includes the full path with variables.

Double-check your device model and adjust the server configuration accordingly.

## 5. How can I verify if my DDNS configuration is working correctly?

For **UDM-Pro** devices:

1. **SSH into your UDM-Pro:**
   - Use an SSH client to access your device.

2. **Run the following command:**
   ```bash
   ps aux | grep inadyn
   inadyn -n -1 --force -f /run/ddns-eth4-inadyn.conf
   ```

3. **Check Logs:**
   - Review `/var/log/messages` for any errors or confirmation messages indicating successful updates.

For **USG** devices:

1. **SSH into your USG:**
   - Use an SSH client to access your device.

2. **Run the following command:**
   ```bash
   sudo ddclient -daemon=0 -verbose -noquiet -debug -file /etc/ddclient/ddclient_eth0.conf
   ```

3. **Check Output:**
   - Look for `SUCCESS` messages indicating that the DDNS update was successful.

## 6. Do I need to pre-create DNS records in Cloudflare before configuring DDNS on my UniFi device?

Yes, for subdomains (e.g., `sub.example.com`), you should manually create an A record in Cloudflare before configuring DDNS on your UniFi device.

## 7. How do I configure DDNS for wildcard domains in Cloudflare?

For wildcard domains, use `*.example.com` in the **Hostname** field when setting up DDNS in your UniFi device.

## 8. What permissions are required for the Cloudflare API token used in DDNS configuration?

You need **two** API tokens with different scopes:

**Worker Deployment Token** (used once to deploy the worker):
- Account — Workers KV Storage: Edit
- Account — Workers Scripts: Edit
- User — Memberships: Read
- User — User Details: Read
- Zone — Zone: Read
- Zone — DNS: Edit

**DDNS Update Token** (used as the password in UniFi DDNS settings):
- Zone — Zone: Read
- Zone — DNS: Edit

The DDNS update token **must** be scoped to only one specific zone (domain). If the token has access to multiple zones, the worker will return an error. This is a User API Token, not an Account API Token.

## 9. How frequently does the UniFi device update the DDNS record?

UniFi devices typically check for IP changes and update DDNS records approximately every two minutes.

## 10. How can I configure DDNS for dual WAN setups on my UniFi device?

In dual WAN configurations, UniFi devices may not natively support configuring DDNS for both WAN interfaces simultaneously. To manage DDNS updates for both connections **use different DDNS providers**.

Assign separate DDNS providers to each WAN interface if supported. Using the `custom` DDNS provider for one WAN connection and `dyndns` for the other is recommended.

## 11. How can I use UniFi devices behind NAT or CGNAT?

If your UniFi router is behind a NAT gateway (e.g., cable modem in router mode, 5G modem, or CGNAT from your ISP), it will have a non-routable RFC 1918 address on its external interface. Using `ip=%i` would incorrectly update DNS to this private address.

Use `ip=auto` instead of `ip=%i` in your server URL to have the Cloudflare Worker determine your actual public IP address from the `CF-Connecting-IP` header. This works regardless of how many layers of NAT exist between your router and the internet.

**Example server configuration for NAT/CGNAT:**
`<worker-name>.<worker-subdomain>.workers.dev/update?ip=auto&hostname=%h`

Note that UniFi devices check for DDNS updates on a timer (approximately every two minutes), not only when the WAN IP changes. This means `ip=auto` will work even if your router's local IP never changes — the worker will still resolve your public IP on each request.

## 12. How do I troubleshoot common deployment errors?

**"Missing entry-point" error:**
Make sure you run `wrangler deploy` from inside the cloned `unifi-ddns` directory, not from a parent directory.

**"Could not resolve 'cloudflare'" error:**
Run `npm install` before `wrangler deploy`. The Cloudflare SDK must be installed locally.

**"Could not read package.json" when using Click to Deploy:**
The Click to Deploy button may fail if your Cloudflare Pages build settings are misconfigured. Try deploying via the Wrangler CLI instead (Option 2 in the README).

## 13. How can I check worker logs for debugging?

1. Install [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) if you haven't already.
2. Run `wrangler tail` to stream real-time logs from your deployed worker.
3. The worker logs the requester IP, request method/URL, and any errors encountered during the update process.
4. You can also view logs in the Cloudflare Dashboard under **Workers & Pages > your worker > Logs**.

Common error messages and their meanings:
- **"API token missing"** — The Authorization header is not being sent. Check your UniFi DDNS username/password configuration.
- **"No zones found"** or **"More than one zone"** — Your API token is not scoped to exactly one zone. Create a new token with the correct scope.
- **"No record found"** — The DNS record must already exist in Cloudflare before the worker can update it. Manually create an A or AAAA record first.

## 14. What should I do if I continue to experience issues with DDNS updates?

- **Verify Configuration:**
  - Double-check all entries in your DDNS settings for accuracy.

- **Check Logs:**
  - Review system logs on your UniFi device for error messages.
  - Use `wrangler tail` to check Cloudflare Worker logs (see FAQ #13).

- **Seek Community Assistance:**
  - Engage with the community by posting issues or questions on relevant GitHub repositories or forums.
