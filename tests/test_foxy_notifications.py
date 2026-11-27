import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


FILE = Path(__file__).resolve().parents[1] / 'bridge' / 'mira_firefox_assist.py'
spec = importlib.util.spec_from_file_location('foxy_host', FILE)
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class NotificationTest(unittest.TestCase):
    def test_each_message_has_its_own_payload(self):
        session = '11111111-1111-4111-8111-111111111111'
        with tempfile.TemporaryDirectory() as directory:
            queue = Path(directory) / 'notifications'
            with patch.object(host, 'NOTIFICATIONS_DIR', queue):
                host.queue_foxy_notification(session, 'message', 'first')
                host.queue_foxy_notification(session, 'message', 'second')
            events = [json.loads(path.read_text()) for path in queue.iterdir()]
            self.assertEqual({'first', 'second'}, {event['message'] for event in events})
            self.assertTrue(all(event['sessionId'] == session for event in events))


if __name__ == '__main__':
    unittest.main()
