#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
target_dir="$HOME/.mozilla/native-messaging-hosts"

if [[ ${EUID} -eq 0 ]]; then
    printf 'Run this installer as the desktop Firefox user, not as root.\n' >&2
    exit 1
fi

mkdir -p "$target_dir"

python3 - "$repo_dir" "$target_dir/org.mira.firefox_assist.json" <<'PY'
import json
import pathlib
import sys

repo = pathlib.Path(sys.argv[1])
target = pathlib.Path(sys.argv[2])
manifest = json.loads((repo / 'bridge/org.mira.firefox_assist.json').read_text())
manifest['path'] = str(repo / 'bridge/mira_firefox_assist.py')
target.write_text(json.dumps(manifest, indent=2) + '\n')
PY

chmod 700 "$repo_dir/bridge/mira_firefox_assist.py"
chmod 600 "$target_dir/org.mira.firefox_assist.json"
printf 'Installed Native-Messaging manifest: %s\n' "$target_dir/org.mira.firefox_assist.json"
