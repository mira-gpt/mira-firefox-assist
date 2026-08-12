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

3. Click the extension action on an ordinary web page, then click **AI Hilfe
   anfordern**. The first milestone sends a redacted snapshot to the local
   host and does not click, fill, submit, or navigate.

Native Messaging restricts the native host to this extension ID. The extension
uses `activeTab` plus `scripting`, so it receives access only after the user
activates assistance for the current tab. See Mozilla's
[Native Messaging documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)
and [scripting permission guidance](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting).
