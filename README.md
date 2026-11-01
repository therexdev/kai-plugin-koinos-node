# KAI Koinos Node

Koinos Node is a complete native plugin for KAI Foundation. The plugin owns its screens, Docker supervisor, chain services, encrypted wallet, funding engines, producer custody, reward returns, saved data and dependencies. Core supplies its lifecycle, the host window and consistent action reviews through the public Foundation API v1.

## Features

The seven sections remain: Dashboard, Wallet, Fund node, Burn KOIN → VHP, Node, Reward returns and Settings.

- Chain synchronization, producer activity, balances, profit projections and activity feed.
- Node wallet creation/import/unlock/lock/removal, KOIN/VHP/Mana, ETH/USDT/vKOIN balances and sends, native private-key backup, address QR and paginated transaction history.
- Coinbase onramp, ETH bridge, swap routes, gas-aware quotes and maximums, funding progress and recovery.
- WSL/Docker setup, logs, automatic recovery, service repair, verified quick sync, backups and checked data-directory moves.
- External producer custody: watch-only account, separate block key, Koin Vault pairing and phone approval, unsigned JSON export/import, saved drafts, registration, burns and transfers.
- Configurable reward returns, automatic burn/send and return history.

## Wallet and storage

**The Node wallet belongs to this plugin and is separate from Core's wallet.** Version 0.3 starts with fresh plugin storage. It does not copy old wallets, connected accounts, funding journals or databases. Old application data is left untouched. An existing wallet may be imported deliberately using its private-key backup; verify the address and chain before sending funds.

The wallet is encrypted with scrypt and AES-256-GCM. Sends and funding retain password proof and native confirmation. Private-key backup is shown in a native dialog rather than returned to the sandboxed renderer. A plugin-local spend lock serializes Node financial actions. Cancellation and identity checks run before asynchronous signing and broadcast.

Changing pages or closing KAI to its tray leaves the Node service running. Disable/remove stops its managed Docker node and drains work. Quitting KAI stops the plugin supervisor and pending installers, while already-running Docker containers retain their existing continuity behavior; use **Stop node** to stop those containers. Node's explicitly enabled blockchain networking is independent of AI Local-Only mode.

## Trust and public API

Installation requires **native.execute: full computer and application access**. The native service can use Node.js and Electron, manage Docker and files, and operate its own wallet. The UI is sandboxed; that does not sandbox native service code. Install native plugins only from publishers you trust.

The service uses public `api.plugin`, `api.signal`, scoped `api.settings`, and `api.desktop.hostWindowId/confirm`. It receives no private Core object or wallet key and exports no remote service. Other publishers can use the same native runtime and public API.

## Development

- `npm ci --ignore-scripts` installs the pinned author dependencies.
- `npm run build` copies the locked production dependency closure into the signed service bundle. No install scripts run on a user's computer.
- `npm test` exercises wallet ownership, all original channels, transaction cancellation, native reviews, custody, funding lifetime and node recovery.
- `node scripts/verify-package.js` checks a signed release against the entire checked-in source and bundled dependencies.

The version 0.3 package requires Foundation's schema 2 / API 3 plugin runtime. Older Core versions cannot install it. OS-specific installers, real Docker operations, live chain sends and paid funding require separate native verification; unit tests do not claim those operations succeeded.

## Foundation package publication

Requires KAI Core **0.7.0 or later**, manifest schema 2/API 3 and native API v1. Source lives in `plugin/`, including its service and all runtime dependencies. Runtime installation never runs npm or dependency hooks.

Before signing, install any author dependencies with `npm ci --ignore-scripts` when this repository has a lockfile, run `npm run build --if-present`, then `node scripts/verify-package.js --source` and `npm test`. The source-only check uses a temporary in-memory test signature; it does not claim a publisher release was signed.

Pack the complete plugin using Core's `scripts/core/pack-plugin.js`, keeping the publisher private key outside every repository. Place the new immutable signed asset at `dist/<repository-name>-<manifest-version>.kaiplugin`, then run `node scripts/verify-package.js`. The release verifier checks the actual publisher signature and exact source/assets/dependency contents against the same package rules as Core. Its standalone format snapshot and SHA-256 provenance are under `scripts/package-format-v3*`; it never imports or executes submitted plugin code.

CI tests source on `foundation-v1`, pull requests and `main` on Windows, macOS and Linux. It checks any signed asset present for the current version. Publication runs only from `main`, only when that exact signed asset exists, and only after every check passes. Existing release assets must match byte-for-byte and are never overwritten. Branch builds cannot publish releases. Native device/integration checks remain necessary before a release; unit tests do not replace them.

The large 0.3.0 signed asset is stored as bounded binary parts with SHA-256/size metadata in `dist/`. Run `node scripts/assemble-signed-package.js` before verifying it locally. CI assembles these exact bytes before signature verification and release; assembly cannot sign or modify the plugin. The released download remains one ordinary `.kaiplugin` file. `.gitattributes` preserves the signed bytes across operating systems.

## Community alternative: Teleno

[Teleno Koinos Node](community/teleno/README.md) is a separate Community plugin with a monolithic runtime, its own encrypted wallet and databases, and native backup controls. Install it independently from the KAI Core catalog. The existing regular Koinos Node package remains independent.
