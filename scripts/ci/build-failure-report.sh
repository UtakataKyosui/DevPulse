#!/usr/bin/env bash
# run-logged.sh が残したログから失敗レポート(report.md)を作り、Step Summary にも出す。
# ログ内の秘匿値は、環境変数に渡された secret の値を伏せ字にしてから保存する。
set -uo pipefail

dir="${CI_REPORT_DIR:?CI_REPORT_DIR is required}"
tail_lines="${REPORT_TAIL_LINES:-80}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
mkdir -p "$dir"

mask() {
  local text
  text=$(cat)
  for name in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID REPORTS_TOKEN ACCESS_TEAM_DOMAIN ACCESS_AUD; do
    local value="${!name:-}"
    [ -n "$value" ] || continue
    text=$(SECRET="$value" awk '
      BEGIN { s = ENVIRON["SECRET"]; n = length(s) }
      { out = ""; line = $0
        while ((i = index(line, s)) > 0) { out = out substr(line, 1, i - 1) "***"; line = substr(line, i + n) }
        print out line }' <<<"$text")
  done
  printf '%s\n' "$text"
}

failed="unknown"
code="?"
if [ -s "$dir/failed-step" ]; then
  read -r failed code <"$dir/failed-step"
fi

{
  echo "# CI failure report"
  echo
  echo "| 項目 | 値 |"
  echo "|---|---|"
  echo "| workflow | ${GITHUB_WORKFLOW:-?} |"
  echo "| run | ${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-} (attempt ${GITHUB_RUN_ATTEMPT:-?}) |"
  echo "| ref | ${GITHUB_REF_NAME:-?} @ ${GITHUB_SHA:-?} |"
  echo "| event | ${GITHUB_EVENT_NAME:-?} |"
  echo "| failed step | ${failed} (exit ${code}) |"
  echo
  for log in "$dir"/*.log; do
    [ -e "$log" ] || continue
    step=$(basename "$log" .log)
    echo "## ${step}"
    echo
    echo '```text'
    # 失敗したステップは末尾を多めに、それ以外は要点だけ残す。
    if [ "$step" = "$failed" ]; then
      tail -n $((tail_lines * 3)) "$log" | mask
    else
      tail -n 10 "$log" | mask
    fi
    echo '```'
    echo
  done
} >"$dir/report.md"

cat "$dir/report.md" >>"$summary"
echo "Report written to $dir/report.md"
