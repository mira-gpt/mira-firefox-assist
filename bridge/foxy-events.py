#!/usr/bin/env python3
"""Deliver explicit Firefox handoffs once, without interrupting Codex."""
import json
import subprocess
import time
import uuid
from pathlib import Path

ROOT = next((p for p in Path(__file__).resolve().parents if (p / 'gdo/base/Application.py').is_file()), Path('/home/gizmore/www/pygdo')) / 'temp/mira_firefox_assist'
QUEUE = ROOT / 'foxy_notifications'
TARGET = 'mira-codex:0.0'
TYPE_DELAY = 0.03


def deliver_once():
    if not QUEUE.is_dir():
        return
    for path in sorted(QUEUE.glob('*.json')):
        try:
            event = json.loads(path.read_text(encoding='utf-8'))
            session = str(uuid.UUID(event['sessionId']))
            if event['reason'] not in {'start', 'continue', 'message'}:
                continue
            base = json.loads((ROOT / f'{session}.json').read_text(encoding='utf-8'))
            if base.get('type') == 'session_stopped':
                path.unlink()
                continue
            if base.get('humanControl') is True:
                continue
            if not list(ROOT.glob(f'{session}.frame-*.json')):
                continue
            capture = subprocess.run(['tmux', 'capture-pane', '-p', '-t', TARGET],
                                     capture_output=True, text=True, check=True).stdout
            # Only submit at Codex's empty idle prompt. Never cancel a turn or
            # replace text that a person may already be typing.
            if '› Ask Codex to do anything' not in capture or '• Working (' in capture:
                return
            command = f'$foxy --session {session}'
            if 'message' in event:
                if not isinstance(event['message'], str):
                    continue
                command += ' --message=' + json.dumps(event['message'][:4000], ensure_ascii=True)
            for character in command:
                subprocess.run(['tmux', 'send-keys', '-t', TARGET, '-l', '--', character], check=True)
                time.sleep(TYPE_DELAY)
            subprocess.run(['tmux', 'send-keys', '-t', TARGET, 'Enter'], check=True)
            time.sleep(0.05)
            subprocess.run(['tmux', 'send-keys', '-t', TARGET, 'Enter'], check=True)
            path.unlink()
            return
        except (OSError, ValueError, KeyError, json.JSONDecodeError, subprocess.SubprocessError):
            continue


if __name__ == '__main__':
    while True:
        deliver_once()
        time.sleep(2)
