#!/usr/bin/env python3
"""Firefox Native-Messaging host for an explicit, tab-scoped Mira session."""

import json
import os
import select
import secrets
import struct
import sys
import time
from pathlib import Path

MAX_MESSAGE_BYTES = 1_000_000
QUEUE_DIR = Path('/home/gizmore/www/pygdo/temp/mira_firefox_assist')
ACTIONS_DIR = QUEUE_DIR / 'actions'
FEEDBACK_DIR = QUEUE_DIR / 'feedback'
NOTIFICATIONS_DIR = QUEUE_DIR / 'foxy_notifications'


def queue_foxy_notification(session_id, reason):
    """Notify only for explicit user handoffs, without sending page content."""
    import uuid
    try:
        session_id = str(uuid.UUID(session_id))
    except (ValueError, TypeError, AttributeError):
        return
    NOTIFICATIONS_DIR.mkdir(mode=0o770, parents=True, exist_ok=True)
    os.chmod(NOTIFICATIONS_DIR, 0o770)
    path = NOTIFICATIONS_DIR / f'{secrets.token_hex(16)}.json'
    with path.open('x', encoding='utf-8') as stream:
        json.dump({'sessionId': session_id, 'reason': reason}, stream)
    os.chmod(path, 0o660)


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


def save_event(message):
    QUEUE_DIR.mkdir(mode=0o770, parents=True, exist_ok=True)
    session_id = message.get('sessionId', 'unknown')
    frame_id = message.get('frameId')
    suffix = f'.frame-{frame_id}' if message.get('type') == 'snapshot' and isinstance(frame_id, int) else ''
    path = QUEUE_DIR / f'{session_id}{suffix}.json'
    if message.get('type') != 'session_started':
        try:
            session_path = QUEUE_DIR / f'{session_id}.json'
            previous = json.loads(session_path.read_text(encoding='utf-8'))
            for key in ('request', 'notes', 'last_user_note_at', 'yolo', 'humanControl'):
                if key in previous and key not in message:
                    message[key] = previous[key]
        except (OSError, json.JSONDecodeError):
            pass
    path.write_text(json.dumps(message, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    os.chmod(path, 0o660)
    # Stored for explicit inspection; the bridge does not wake the assistant.


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


def send_pending_feedback():
    """Deliver short Mira status messages to the explicitly assisted tab."""
    FEEDBACK_DIR.mkdir(mode=0o770, parents=True, exist_ok=True)
    for path in sorted(FEEDBACK_DIR.glob('*.json')):
        try:
            feedback = json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(feedback.get('sessionId'), str) or not isinstance(feedback.get('text'), str):
                raise ValueError('Expected sessionId and text')
            write_message({
                'type': 'assist_feedback',
                'sessionId': feedback['sessionId'],
                'text': feedback['text'][:4000],
                'state': feedback.get('state', ''),
            })
            path.unlink()
        except (OSError, ValueError, json.JSONDecodeError) as error:
            print(f'Ignoring malformed feedback {path}: {error}', file=sys.stderr)
            path.unlink(missing_ok=True)


def save_user_note(message):
    """Append a browser user's note without replacing the active session record."""
    session_id = message.get('sessionId', 'unknown')
    path = QUEUE_DIR / f'{session_id}.json'
    data = {}
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        pass
    notes = data.setdefault('notes', [])
    notes.append({
        'role': 'user', 'text': str(message.get('text', ''))[:4000],
        'time': int(time.time()),
    })
    data['last_user_note_at'] = int(time.time())
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    os.chmod(path, 0o660)


def main():
    write_message({'type': 'host_ready', 'mode': 'inspect_and_confirm_actions'})
    while True:
        readable, _, _ = select.select([sys.stdin.buffer], [], [], 0.5)
        if not readable:
            send_pending_actions()
            send_pending_feedback()
            continue
        message = read_message()
        if message is None:
            return
        event = message.get('type')
        if event == 'probe':
            write_message({'type': 'ack', 'event': event})
        elif event in {'session_started', 'session_stopped', 'snapshot', 'action_result', 'control_state'}:
            previous = {}
            if event == 'control_state':
                try:
                    previous = json.loads((QUEUE_DIR / f'{message.get("sessionId")}.json').read_text(encoding='utf-8'))
                except (OSError, json.JSONDecodeError):
                    pass
            save_event(message)
            write_message({'type': 'ack', 'event': event, 'sessionId': message.get('sessionId')})
            if event == 'session_started':
                queue_foxy_notification(message.get('sessionId'), 'start')
            elif event == 'control_state' and previous.get('humanControl') is True and message.get('humanControl') is False:
                queue_foxy_notification(message.get('sessionId'), 'continue')
        elif event == 'user_note':
            save_user_note(message)
            write_message({'type': 'ack', 'event': event, 'sessionId': message.get('sessionId')})
        else:
            write_message({'type': 'error', 'error': 'unsupported_message'})


if __name__ == '__main__':
    main()
