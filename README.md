# Mira Firefox Assist

An opt-in Firefox assistance bridge for Mira.

## Safety model

- Assistance is enabled explicitly for one active tab.
- A visible stop control ends the session immediately.
- The browser extension talks only to a local bridge.
- External actions remain visible and require the user-selected scope.
- No credentials, browser profiles, or private files belong in this repository.

## Planned layout

```text
extension/  Firefox WebExtension UI and tab-scoped permission flow
bridge/     Local Native-Messaging host / Unix-socket adapter
protocol/   Versioned, auditable messages between extension and bridge
```

The initial milestone is read-only tab inspection. Input, clicks, navigation,
and externally visible actions are separate opt-in capabilities.

## Local development install

1. In Firefox, open `about:debugging#/runtime/this-firefox` and load the
   temporary add-on from `extension/manifest.json`.
2. Install the Native-Messaging host for the same desktop user:

   ```bash
   ./bridge/install-native-host.sh
   ```

3. Click the extension action on an ordinary web page, describe the request,
   then click **AI Hilfe anfordern**. The host stores the tab-scoped snapshot
   under `pygdo/temp/mira_firefox_assist/` and notifies Mira by path only.
   Framed pages produce one snapshot per accessible frame.

The snapshot contains the current DOM source (bounded to 250 KiB), visible
text, form metadata without values, loaded script metadata, inline `on*`
handlers, and a short redacted user-event trail. It contains no password
fields or typed field values.

## Reloading during development

The add-on is installed as a **temporary** Firefox add-on, so it disappears
after a full Firefox restart. Reload it after changing extension files, or
load it again after a restart:

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Find **Mira Firefox Assist** (`mira-firefox-assist@mira-gpt.org`).
3. Click **Reload**. The active assisted tab may then be refreshed before its
   popup and content script use the new code.

If the add-on is no longer listed, click **Load Temporary Add-on…** and choose
`/home/mira/projects/mira-firefox-assist/extension/manifest.json`.

Changes to `bridge/` normally take effect on the next Native-Messaging request;
they do not require reloading the Firefox add-on. If the native-host manifest
or its path changed, run `./bridge/install-native-host.sh` again for the same
desktop user, then reload the add-on once.

## Explicit actions

The local helper can queue text input, same-origin navigation, a click, or a
local JavaScript file:

```bash
./bridge/queue-action.py --session SESSION --input '#search' 'example'
./bridge/queue-action.py --session SESSION --navigate '/private_messages/privatemessages.php'
./bridge/queue-action.py --session SESSION --click 'button[type=submit]'
./bridge/queue-action.py --session SESSION --form ./actions/tbs-pm-quangntenemy.json
./bridge/queue-action.py --session SESSION --script ./reviewed-action.js
# For a captured child frame:
./bridge/queue-action.py --session SESSION --frame 2 --input '#search' 'example'
```

The extension displays the precise request as an overlay in the browser. The
person at the browser must choose **Allow once**; otherwise nothing runs. An
approved input/script action waits at least one second before reporting its
result. A reviewed script can perform a navigation, but it is still shown in
full and must be allowed once. Assisted tabs are refreshed after an accessible
frame navigation so Mira can inspect the next visible form before proposing a
later, separately approved action.

## Assist dialogue

The popup shows a small, tab-scoped dialogue while a session is active. The
person at the browser can send a short clarification to Mira; it is appended to
the session job and wakes Mira with the path only. Mira can return a visible
status, result or pause reason without taking a browser action:

```bash
./bridge/queue-feedback.py --session SESSION --state working 'I found the login error and am checking the response.'
./bridge/queue-feedback.py --session SESSION --state stalled 'Please confirm the visible action before I continue.'
./bridge/queue-feedback.py --session SESSION --state done 'The requested check is complete.'
```

Messages are limited to the actively shared tab and are not a general browser
chat. Password fields and typed values remain excluded from snapshots.

Native Messaging restricts the native host to this extension ID. The extension
uses `activeTab` plus `scripting`, so it receives access only after the user
activates assistance for the current tab. See Mozilla's
[Native Messaging documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)
and [scripting permission guidance](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting).
