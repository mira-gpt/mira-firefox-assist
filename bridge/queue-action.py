#!/usr/bin/env python3
"""Queue one explicitly reviewed Firefox Assist action for a live session."""

import argparse
import json
import os
import secrets
from pathlib import Path

QUEUE_DIR = Path('/home/gizmore/www/pygdo/temp/mira_firefox_assist/actions')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--session', required=True, help='Session ID from the saved assist JSON.')
    parser.add_argument('--frame', type=int, help='Optional frame ID from a captured snapshot.')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--input', nargs=2, metavar=('SELECTOR', 'TEXT'))
    group.add_argument('--script', metavar='FILE', help='Local JavaScript file to execute after visible approval.')
    args = parser.parse_args()

    if args.input:
        action = {'kind': 'input', 'selector': args.input[0], 'text': args.input[1]}
    else:
        source = Path(args.script).read_text(encoding='utf-8')
        action = {'kind': 'script', 'source': source}

    QUEUE_DIR.mkdir(mode=0o770, parents=True, exist_ok=True)
    destination = QUEUE_DIR / f'{args.session}-{secrets.token_hex(8)}.json'
    payload = {'sessionId': args.session, 'action': action}
    if args.frame is not None:
        payload['frameId'] = args.frame
    destination.write_text(json.dumps(payload) + '\n', encoding='utf-8')
    os.chmod(destination, 0o660)
    print(destination)


if __name__ == '__main__':
    main()
