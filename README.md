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
