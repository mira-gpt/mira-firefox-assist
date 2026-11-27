import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

FILE = Path(__file__).resolve().parents[1] / 'bridge' / 'foxy-events.py'
spec = importlib.util.spec_from_file_location('foxy_events', FILE)
events = importlib.util.module_from_spec(spec)
spec.loader.exec_module(events)


class HandoffTest(unittest.TestCase):
    def test_only_delivers_once_when_idle_and_not_paused(self):
        session = '11111111-1111-4111-8111-111111111111'
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            queue = root / 'foxy_notifications'
            queue.mkdir()
            notice = queue / 'event.json'
            notice.write_text(json.dumps({'sessionId': session, 'reason': 'start'}))
            base = root / f'{session}.json'
            base.write_text(json.dumps({'type': 'session_started', 'humanControl': False}))
            (root / f'{session}.frame-0.json').write_text('{}')
            with patch.object(events, 'ROOT', root), patch.object(events, 'QUEUE', queue), patch.object(events.subprocess, 'run') as run:
                run.return_value.stdout = '• Working (2s)\n› Ask Codex to do anything'
                events.deliver_once()
                self.assertTrue(notice.exists())
                self.assertEqual(run.call_count, 1)
                run.reset_mock()
                base.write_text(json.dumps({'type': 'control_state', 'humanControl': True}))
                events.deliver_once()
                self.assertTrue(notice.exists())
                run.assert_not_called()
                base.write_text(json.dumps({'type': 'control_state', 'humanControl': False}))
                run.return_value.stdout = '› Ask Codex to do anything'
                events.deliver_once()
                self.assertFalse(notice.exists())
                commands = [c.args[0] for c in run.call_args_list]
                self.assertEqual(len(commands), 4)
                self.assertIn(f'$foxy --session {session}', commands[1])
                self.assertEqual(commands[2][-1], 'Enter')
                self.assertEqual(commands[3][-1], 'Enter')
                self.assertFalse(any('C-c' in command for command in commands))
                run.reset_mock()
                events.deliver_once()
                run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
