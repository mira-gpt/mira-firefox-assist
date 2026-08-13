#!/usr/bin/env python3
"""Show a short Mira status message in one active Firefox Assist dialogue."""

import argparse
import json
import os
import secrets
from pathlib import Path


QUEUE_DIR = Path('/home/gizmore/www/pygdo/temp/mira_firefox_assist/feedback')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--session', required=True, help='Session ID from the saved assist JSON.')
    parser.add_argument('--state', choices=('working', 'stalled', 'done'), default='working')
    parser.add_argument('text', help='Short, user-visible status or reply.')
    args = parser.parse_args()

    QUEUE_DIR.mkdir(mode=0o770, parents=True, exist_ok=True)
    path = QUEUE_DIR / f'{args.session}-{secrets.token_hex(8)}.json'
    path.write_text(json.dumps({
        'sessionId': args.session,
        'state': args.state,
        'text': args.text,
    }, ensure_ascii=False) + '\n', encoding='utf-8')
    os.chmod(path, 0o660)
    print(path)


if __name__ == '__main__':
    main()
