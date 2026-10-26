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

# デプロイが使う権限を 1 つずつ確認し、足りないものを全部まとめて報告する。
# 形式: 表示名|必要な権限|パス
probes=(
  "Workers scripts|Workers Scripts Read/Edit|/workers/scripts"
  "Workers KV|Workers KV Storage Read/Edit|/storage/kv/namespaces?per_page=5"
  "D1|D1 Read/Edit|/d1/database?per_page=10"
  "Workers AI|Workers AI Read/Edit|/ai/models/search"
)
missing=()
for probe in "${probes[@]}"; do
  IFS='|' read -r label permission path <<<"$probe"
  read -r probe_status probe_ok probe_codes < <(call probe "/accounts/${CLOUDFLARE_ACCOUNT_ID}${path}")
  if [ "$probe_ok" = true ]; then
    ok "${label}: accessible"
  elif [ "$probe_status" = 401 ] || [ "$probe_status" = 403 ]; then
    fail "${label}: HTTP ${probe_status} [${probe_codes:-none}] - add \"${permission}\" for this account"
    missing+=("$permission")
  else
    # 権限以外の拒否(パラメータの不正など)ではデプロイを止めない。実際のデプロイが判断する。
    echo "::warning title=Cloudflare credentials::${label}: unexpected HTTP ${probe_status} [${probe_codes:-none}]; skipping this check"
    echo "- ⚠️ ${label}: unexpected HTTP ${probe_status} [${probe_codes:-none}], not treated as a permission error" >>"$summary"
  fi
done
[ "${#missing[@]}" -eq 0 ] || exit 1
