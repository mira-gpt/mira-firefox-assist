#!/usr/bin/env python3
"""Firefox Native-Messaging host for an explicit, tab-scoped Mira session."""

import json
import os
import select
import struct
import subprocess
import sys
from pathlib import Path

MAX_MESSAGE_BYTES = 1_000_000
QUEUE_DIR = Path('/home/gizmore/www/pygdo/temp/mira_firefox_assist')
ACTIONS_DIR = QUEUE_DIR / 'actions'


def read_message():
    header = sys.stdin.buffer.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise ValueError('Truncated native-message header')
    length = struct.unpack('<I', header)[0]
    if length > MAX_MESSAGE_BYTES:
        raise ValueError(f'Message exceeds {MAX_MESSAGE_BYTES} bytes')
    payload = sys.stdin.buffer.read(length)
    if len(payload) != length:
        raise ValueError('Truncated native-message body')
    return json.loads(payload)


def write_message(message):
    payload = json.dumps(message, separators=(',', ':')).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def notify_mira(path: Path):
    """Only send a local file path to Mira's terminal, never untrusted page text."""
    try:
        subprocess.run(['tmux', 'send-keys', '-t', 'mira-codex:0.0', '-l', '--', f'$firefox_assist {path}  '], check=True)
        subprocess.run(['tmux', 'send-keys', '-t', 'mira-codex:0.0', 'Enter'], check=True)
        subprocess.run(['tmux', 'send-keys', '-t', 'mira-codex:0.0', 'Enter'], check=True)
    except (OSError, subprocess.CalledProcessError) as error:
        print(f'Could not notify Mira: {error}', file=sys.stderr)


def save_event(message):
    QUEUE_DIR.mkdir(mode=0o770, parents=True, exist_ok=True)
    session_id = message.get('sessionId', 'unknown')
    frame_id = message.get('frameId')
    suffix = f'.frame-{frame_id}' if message.get('type') == 'snapshot' and isinstance(frame_id, int) else ''
    path = QUEUE_DIR / f'{session_id}{suffix}.json'
    if message.get('type') == 'snapshot':
        try:
            session_path = QUEUE_DIR / f'{session_id}.json'
            previous = json.loads(session_path.read_text(encoding='utf-8'))
            if isinstance(previous.get('request'), str) and 'request' not in message:
                message['request'] = previous['request']
        except (OSError, json.JSONDecodeError):
            pass
    path.write_text(json.dumps(message, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    os.chmod(path, 0o660)
    notify_mira(path)


def send_pending_actions():
    """Forward locally queued actions; the tab still asks its user to allow each one."""
    ACTIONS_DIR.mkdir(mode=0o770, parents=True, exist_ok=True)
    for path in sorted(ACTIONS_DIR.glob('*.json')):
        try:
            action = json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(action.get('sessionId'), str) or not isinstance(action.get('action'), dict):
                raise ValueError('Expected sessionId and action')
            write_message({'type': 'action_request', **action})
            path.unlink()
        except (OSError, ValueError, json.JSONDecodeError) as error:
            print(f'Ignoring malformed action {path}: {error}', file=sys.stderr)
            path.unlink(missing_ok=True)


def main():
    write_message({'type': 'host_ready', 'mode': 'inspect_and_confirm_actions'})
    while True:
        readable, _, _ = select.select([sys.stdin.buffer], [], [], 0.5)
        if not readable:
            send_pending_actions()
            continue
        message = read_message()
        if message is None:
            return
        event = message.get('type')
        if event == 'probe':
            write_message({'type': 'ack', 'event': event})
        elif event in {'session_started', 'session_stopped', 'snapshot', 'action_result'}:
            save_event(message)
            write_message({'type': 'ack', 'event': event, 'sessionId': message.get('sessionId')})
        else:
            write_message({'type': 'error', 'error': 'unsupported_message'})


if __name__ == '__main__':
    main()
