#!/usr/bin/env bash
#
# Force a single DDNS update against a deployed worker (or a local `wrangler dev`).
#
# Every value is read from the environment first. Whatever is missing is prompted
# for, using gum (https://github.com/charmbracelet/gum) when it is installed and
# a terminal is attached; otherwise plain prompts are used. With no terminal and
# no environment variables the script fails fast, so it stays usable in CI.
#
# Usage:
#   ./scripts/force-update.sh
#
# Environment:
#   DDNS_WORKER_URL  Worker endpoint, for example
#                    https://unifi-ddns.<subdomain>.workers.dev/update
#                    Use http://localhost:8787/update against `pnpm run dev`.
#   DDNS_HOSTNAME    One record name, or several comma-separated.
#   DDNS_EMAIL       Cloudflare account email (Basic auth username).
#   DDNS_API_TOKEN   Cloudflare API token (Basic auth password).
#   DDNS_IP          IPv4 address, or "auto" to use the caller IP. Default "auto".
#                    "auto" requires Cloudflare, because it reads
#                    CF-Connecting-IP: pass an explicit address locally.
#   DDNS_IP6         IPv6 address, or "auto". Empty skips the AAAA record.
#
# Exit codes: 0 update accepted, 1 request failed or the worker rejected it,
# 2 missing or invalid configuration.

set -euo pipefail

has_gum=0
if command -v gum >/dev/null 2>&1; then
	has_gum=1
fi

# Prompts and decorations need a terminal; without one the script is env-only.
ui=0
if ((has_gum)) && [[ -t 0 ]]; then
	ui=1
fi

trim() {
	local s=$1
	s=${s#"${s%%[![:space:]]*}"}
	s=${s%"${s##*[![:space:]]}"}
	printf '%s' "$s"
}

set_var() {
	printf -v "$1" '%s' "$(trim "$2")"
}

usage() {
	cat <<'EOF'
Force a single DDNS update against a worker.

Run it without arguments: each value is read from the environment when set and
prompted for otherwise (gum is used for the prompts when installed).

Environment variables:
  DDNS_WORKER_URL  Worker endpoint, e.g. https://unifi-ddns.<subdomain>.workers.dev/update
  DDNS_HOSTNAME    Record name, or several comma-separated names
  DDNS_EMAIL       Cloudflare account email
  DDNS_API_TOKEN   Cloudflare API token
  DDNS_IP          IPv4 address or "auto" (default: auto)
  DDNS_IP6         IPv6 address or "auto" (default: empty, skips the AAAA record)

Examples:
  ./scripts/force-update.sh
  DDNS_IP=203.0.113.10 ./scripts/force-update.sh
EOF
}

fail_usage() {
	printf 'error: %s\n\n' "$1" >&2
	usage >&2
	exit 2
}

warn() {
	if ((ui)); then
		gum style --foreground 214 "  $1" >&2
	else
		printf '%s\n' "$1" >&2
	fi
}

ask() {
	local header=$1 placeholder=$2 initial=$3
	if ((ui)); then
		gum input --header "$header" --placeholder "$placeholder" --value "$initial"
		return 0
	fi
	local reply=''
	printf '%s: ' "$header" >&2
	IFS= read -r reply || true
	printf '%s' "$(trim "${reply:-$initial}")"
}

ask_secret() {
	local header=$1
	if ((ui)); then
		gum input --password --header "$header"
		return 0
	fi
	local reply=''
	printf '%s: ' "$header" >&2
	IFS= read -rs reply || true
	printf '\n' >&2
	printf '%s' "$(trim "$reply")"
}

resolve_required() {
	local name=$1 header=$2 placeholder=$3
	local value=''
	set_var "$name" "${!name:-}"
	if [[ -n "${!name}" ]]; then
		return 0
	fi
	if ((!ui)); then
		fail_usage "$name is required when no terminal is attached"
	fi
	while :; do
		value=$(ask "$header" "$placeholder" "")
		set_var "$name" "$value"
		if [[ -n "${!name}" ]]; then
			return 0
		fi
		warn "A value is required."
	done
}

resolve_secret() {
	local name=$1 header=$2
	local value=''
	set_var "$name" "${!name:-}"
	if [[ -n "${!name}" ]]; then
		return 0
	fi
	if ((!ui)); then
		fail_usage "$name is required when no terminal is attached"
	fi
	while :; do
		value=$(ask_secret "$header")
		set_var "$name" "$value"
		if [[ -n "${!name}" ]]; then
			return 0
		fi
		warn "A value is required."
	done
}

resolve_optional() {
	local name=$1 header=$2 placeholder=$3 default=$4
	local value=''
	set_var "$name" "${!name:-}"
	if [[ -n "${!name}" ]]; then
		return 0
	fi
	if ((!ui)); then
		set_var "$name" "$default"
		return 0
	fi
	value=$(ask "$header" "$placeholder" "$default")
	set_var "$name" "${value:-$default}"
}

run_request() {
	if ((ui)); then
		gum spin --spinner dot --title "Calling the worker..." --show-output -- curl "$@"
		return 0
	fi
	curl "$@"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
	usage
	exit 0
fi

if ((ui)); then
	gum style --foreground 212 --bold "UniFi DDNS - forced update"
	gum style --foreground 240 "Press Enter to accept a default or a pre-set value."
	printf '\n'
fi

resolve_required DDNS_WORKER_URL "Worker endpoint (DDNS_WORKER_URL)" "https://unifi-ddns.<subdomain>.workers.dev/update"
resolve_required DDNS_HOSTNAME "Record name(s) (DDNS_HOSTNAME)" "home.example.com"
resolve_required DDNS_EMAIL "Cloudflare account email (DDNS_EMAIL)" "you@example.com"
resolve_secret DDNS_API_TOKEN "Cloudflare API token (DDNS_API_TOKEN)"
resolve_optional DDNS_IP "IPv4 address or auto (DDNS_IP)" "auto" "auto"
resolve_optional DDNS_IP6 "IPv6 address or auto (DDNS_IP6, empty to skip)" "" ""

if [[ "$DDNS_WORKER_URL" == *"?"* ]]; then
	printf 'error: DDNS_WORKER_URL must be the bare endpoint, without a query string\n' >&2
	printf '       drop the "?ip=%%i&hostname=%%h" part from the UniFi server URL\n' >&2
	exit 2
fi

curl_args=(
	--silent
	--show-error
	--globoff
	--get "$DDNS_WORKER_URL"
	--user "$DDNS_EMAIL:$DDNS_API_TOKEN"
	--data-urlencode "hostname=$DDNS_HOSTNAME"
	--data-urlencode "ip=$DDNS_IP"
	--write-out '\n%{http_code}'
)

if [[ -n "$DDNS_IP6" ]]; then
	curl_args+=(--data-urlencode "ip6=$DDNS_IP6")
fi

output=$(run_request "${curl_args[@]}") || true

http_code="${output##*$'\n'}"
body="${output%$'\n'*}"

if [[ ! "$http_code" =~ ^[0-9]{3}$ ]]; then
	printf 'error: request to %s failed\n' "$DDNS_WORKER_URL" >&2
	exit 1
fi

report=(
	"Worker:   $DDNS_WORKER_URL"
	"Hostname: $DDNS_HOSTNAME"
	"IPv4:     $DDNS_IP"
)
if [[ -n "$DDNS_IP6" ]]; then
	report+=("IPv6:     $DDNS_IP6")
fi
report+=("Status:   $http_code")
if [[ -n "$body" ]]; then
	report+=("Response: $body")
fi

if ((ui)); then
	gum style --border rounded --border-foreground 240 --padding "0 2" "${report[@]}"
else
	printf '%s\n' "${report[@]}"
fi

if [[ "$http_code" == 2* ]]; then
	if ((ui)); then
		gum style --foreground 42 --bold "Update accepted."
	else
		printf '\nUpdate accepted.\n'
	fi
	exit 0
fi

if ((ui)); then
	gum style --foreground 196 --bold "Update rejected by the worker." >&2
else
	printf '\nUpdate rejected by the worker.\n' >&2
fi
exit 1
