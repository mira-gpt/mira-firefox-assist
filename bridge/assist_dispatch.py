#!/usr/bin/env python3
"""Wake Mira for newly open or stalled Firefox Assist jobs."""

import argparse
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

ROOT = Path('/home/gizmore/www/pygdo/temp/mira_firefox_assist')
STATE_FILE = ROOT / '.assist-dispatch-state.json'
ACTIVE_SECONDS = 60 * 60
STALL_SECONDS = 90
WORKING_TIMEOUT_SECONDS = 5 * 60
STALL_RETRY_SECONDS = 60
TMUX_TARGET = 'mira-codex:0.0'
WATCH_INTERVAL_SECONDS = 3.14


def load_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return fallback


def save_json(path, data):
    existed = path.exists()
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    if not existed:
        os.chmod(path, 0o660)


def latest_snapshot(session):
    files = list(ROOT.glob(f'{session}.frame-*.json'))
    snapshots = [(path, load_json(path, {})) for path in files]
    snapshots = [(path, data) for path, data in snapshots if data.get('type') == 'snapshot']
    return max(snapshots, key=lambda item: item[0].stat().st_mtime, default=(None, None))


def classify(session, base, now):
    """Return (state, path) only for a human request that still needs attention."""
    snap_path, snapshot = latest_snapshot(session)
    request = base.get('request') or (snapshot or {}).get('request')
    if not isinstance(request, str) or not request.strip() or base.get('type') == 'session_stopped':
        return None, None
    base_path = ROOT / f'{session}.json'
    if now - base_path.stat().st_mtime > ACTIVE_SECONDS:
        return None, None
    if base.get('type') == 'action_result':
        result = base.get('result') or {}
        if not result.get('ok'):
            return 'stalled', base_path
        if not snap_path or snap_path.stat().st_mtime <= base_path.stat().st_mtime:
            if now - base_path.stat().st_mtime >= STALL_SECONDS:
                return 'stalled', base_path
            return None, None
    if snap_path:
        return 'open', snap_path
    return 'open', base_path


def signature(state, path):
    content = path.read_bytes()
    return f'{state}:{path.name}:{hashlib.sha256(content).hexdigest()}'


def wake(path):
    subprocess.run(['tmux', 'send-keys', '-t', TMUX_TARGET, '-l', '--', f'$assist {path}  '], check=True)
    for _ in range(2):
        subprocess.run(['tmux', 'send-keys', '-t', TMUX_TARGET, 'C-m'], check=True)
    time.sleep(0.042)
    for _ in range(2):
        subprocess.run(['tmux', 'send-keys', '-t', TMUX_TARGET, 'C-m'], check=True)


def scan_once():
    ROOT.mkdir(mode=0o770, parents=True, exist_ok=True)
    state = load_json(STATE_FILE, {'jobs': {}})
    jobs = state.setdefault('jobs', {})
    now = time.time()
    active = set()
    for path in ROOT.glob('*.json'):
        if '.frame-' in path.name or path.name.startswith('.'):
            continue
        session = path.stem
        base = load_json(path, {})
        active.add(session)
        previous = jobs.get(session, {})
        previous_status = previous.get('status')
        if previous_status == 'done':
            continue
        if previous_status == 'working':
            age = now - previous.get('updated_at', now)
            if age < WORKING_TIMEOUT_SECONDS:
                continue
            previous_status = 'stalled'
        status, job_path = classify(session, base, now)
        if not status:
            continue
        if previous_status == 'stalled':
            status = 'stalled'
        sig = signature(status, job_path)
        if previous.get('signature') == sig and previous.get('status') == status:
            # A stalled job deliberately returns to Mira's queue. A working
            # assistant changes it back to working immediately; otherwise a
            # once-per-minute retry keeps a genuine pause from being lost.
            if status != 'stalled' or now - previous.get('notified_at', 0) < STALL_RETRY_SECONDS:
                continue
        try:
            wake(job_path)
            jobs[session] = {**previous, 'signature': sig, 'status': status, 'notified_at': int(now)}
        except (OSError, subprocess.CalledProcessError) as error:
            print(f'Could not dispatch {session}: {error}')
    # Keep only live jobs so re-used IDs or future sessions do not inherit state.
    state['jobs'] = {key: value for key, value in jobs.items() if key in active}
    save_json(STATE_FILE, state)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true', help='Run one dispatch scan (the default).')
    parser.add_argument('--watch', action='store_true', help='Keep scanning until interrupted.')
    parser.add_argument('--interval', type=float, default=WATCH_INTERVAL_SECONDS,
                        help=f'Watch interval in seconds (default: {WATCH_INTERVAL_SECONDS}).')
    args = parser.parse_args()
    if args.watch:
        if args.interval <= 0:
            parser.error('--interval must be positive')
        while True:
            scan_once()
            time.sleep(args.interval)
    else:
        scan_once()


if __name__ == '__main__':
    main()
