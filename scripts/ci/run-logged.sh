#!/usr/bin/env bash
# Usage: run-logged.sh <name> <command...>
# コマンドの出力を $CI_REPORT_DIR/<name>.log に残し、終了コードはそのまま返す。
# 失敗したときは failed-step ファイルに名前と終了コードを記録する(失敗レポートの材料)。
set -uo pipefail

name="$1"
shift
dir="${CI_REPORT_DIR:?CI_REPORT_DIR is required}"
mkdir -p "$dir"

"$@" 2>&1 | tee "$dir/$name.log"
status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ] && [ ! -e "$dir/failed-step" ]; then
  echo "$name $status" >"$dir/failed-step"
fi
exit "$status"
