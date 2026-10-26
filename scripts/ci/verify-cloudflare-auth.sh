#!/usr/bin/env bash
# Cloudflare の認証情報をデプロイ前に確認する。トークンの値は出力しない。
set -uo pipefail

api=https://api.cloudflare.com/client/v4
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
failed=0

fail() {
  echo "::error title=Cloudflare credentials::$1"
  echo "- ❌ $1" >>"$summary"
  failed=1
}
ok() {
  echo "$1"
  echo "- ✅ $1" >>"$summary"
}

echo "### Cloudflare credentials" >>"$summary"

[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || fail "CLOUDFLARE_API_TOKEN secret is empty or not set"
[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || fail "CLOUDFLARE_ACCOUNT_ID secret is empty or not set"
[ "$failed" -eq 0 ] || exit 1

# call <label> <path>: prints "<http status> <cloudflare success> <error codes>".
call() {
  local body status
  body=$(mktemp)
  status=$(curl -sS -m 20 -o "$body" -w '%{http_code}' \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "$api$2" || echo 000)
  echo "$status $(jq -r '"\(.success // false) \([.errors[]?.code] | join(","))"' "$body" 2>/dev/null || echo 'false unparsable')"
  rm -f "$body"
}

# アカウント所有トークンとユーザートークンでは検証エンドポイントが異なる。
read -r account_status account_ok account_codes < <(call account "/accounts/${CLOUDFLARE_ACCOUNT_ID}/tokens/verify")
read -r user_status user_ok user_codes < <(call user "/user/tokens/verify")
echo "account token verify: HTTP ${account_status} success=${account_ok} errors=${account_codes:-none}"
echo "user token verify:    HTTP ${user_status} success=${user_ok} errors=${user_codes:-none}"

if [ "$account_ok" = true ]; then
  ok "Token is valid (account-owned)"
elif [ "$user_ok" = true ]; then
  ok "Token is valid (user-owned)"
else
  fail "Token was rejected (account: HTTP ${account_status} [${account_codes:-none}], user: HTTP ${user_status} [${user_codes:-none}]). Re-issue CLOUDFLARE_API_TOKEN, and check that CLOUDFLARE_ACCOUNT_ID belongs to the same account."
  exit 1
fi

read -r detail_status detail_ok detail_codes < <(call detail "/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts")
if [ "$detail_ok" = true ]; then
  ok "Token can list Workers scripts in account ${CLOUDFLARE_ACCOUNT_ID:0:4}…"
else
  fail "Token is valid but cannot access Workers in this account (HTTP ${detail_status} [${detail_codes:-none}]). Check the token's Workers Scripts permission and account resources."
  exit 1
fi
