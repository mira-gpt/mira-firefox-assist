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
    group.add_argument('--navigate', metavar='URL', help='Navigate within the current origin after visible approval.')
    group.add_argument('--click', metavar='SELECTOR', help='Click one visible page element after approval.')
    group.add_argument('--form', metavar='FILE', help='JSON form-and-submit action, shown fully before approval.')
    group.add_argument('--chat-send', nargs=2, metavar=('SELECTOR', 'TEXT'),
                       help='Set a visible contenteditable composer and submit it after approval.')
    group.add_argument('--script', metavar='FILE', help='Local JavaScript file to execute after visible approval.')
    args = parser.parse_args()

    if args.input:
        action = {'kind': 'input', 'selector': args.input[0], 'text': args.input[1]}
    elif args.navigate:
        action = {'kind': 'navigate', 'url': args.navigate}
    elif args.click:
        action = {'kind': 'click', 'selector': args.click}
    elif args.form:
        action = json.loads(Path(args.form).read_text(encoding='utf-8'))
        if action.get('kind') != 'form_submit' or not isinstance(action.get('fields'), dict) or not isinstance(action.get('submit'), str):
            parser.error('--form must contain form_submit with fields and submit')
    elif args.chat_send:
        action = {'kind': 'chat_send', 'selector': args.chat_send[0], 'text': args.chat_send[1]}
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
