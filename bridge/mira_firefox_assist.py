#!/usr/bin/env python3
"""Firefox Native-Messaging host for the read-only Mira assist milestone."""

import json
import os
import struct
import sys


MAX_MESSAGE_BYTES = 1_000_000


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


def main():
    # Milestone 1 deliberately only acknowledges tab snapshots. A later local
    # Mira adapter will consume these messages over a Unix socket.
    write_message({'type': 'host_ready', 'mode': 'read_only'})
    while message := read_message():
        event = message.get('type')
        if event in {'session_started', 'session_stopped', 'snapshot'}:
            sys.stderr.write(f'mira-firefox-assist: {event}\n')
            sys.stderr.flush()
            write_message({'type': 'ack', 'event': event, 'sessionId': message.get('sessionId')})
        else:
            write_message({'type': 'error', 'error': 'unsupported_message'})


if __name__ == '__main__':
    main()
