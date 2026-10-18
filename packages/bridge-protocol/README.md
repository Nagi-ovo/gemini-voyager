# @voyager-crew/bridge-protocol

The messages the [Voyager](https://github.com/voyager-crew/voyager) browser extension and
[voyager-cli](https://github.com/voyager-crew/voyager-cli) (`voyager serve`) exchange over the
Local Bridge: wire types, validators, protocol version negotiation and shared test fixtures.

This package is TypeScript source (`exports` point at `src/`), meant to be bundled by the
extension and the CLI rather than imported by Node at runtime.

Released from `packages/bridge-protocol` in the Voyager repository: raising `version` in this
`package.json` on `main` publishes it (`.github/workflows/publish-bridge-protocol.yml`).

MIT licensed, unlike the GPL-3.0 extension around it.
