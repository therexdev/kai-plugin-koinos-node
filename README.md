# KAI Koinos Node

The full original Koinos Node workspace, installed separately in KAI Core. It reuses the original Node renderer, styles and native service implementation, with all seven sidebar sections: **Dashboard**, **Wallet**, **Fund node**, **Burn KOIN → VHP**, **Node**, **Reward returns**, and **Settings**.

## Capabilities

- Original dashboard, chain synchronization, producer activity, balances, profit projections and activity feed.
- Shared KAI wallet: create/import/unlock/lock/remove, KOIN/VHP/Mana, ETH/USDT/vKOIN funding balances, sends, backup, address QR and transaction history with pagination.
- Fund node: Coinbase onramp, ETH bridge, ETH/USDT/vKOIN routes, quotes, gas-aware maximums, tracked funding progress, recovery and transaction links.
- Node: guided WSL/Docker setup, startup and shutdown, logs, automatic recovery, service repair, verified quick sync, backup management and explicit data-folder selection/move.
- External producer custody: watch-only producer address, separate hot block key, Koin Vault pairing/QR and phone approval, Kondor unsigned JSON export/import, saved drafts, registration, burns, transfers and VHP production allowance.
- Reward returns: the original configuration, estimates, automatic burn/send behavior and return history. Existing password requirements apply when changing destinations.

## Install and use

In Core, open **Plugins → Koinos Node → Review update / Install**. Review the requested Node, wallet and funding permissions. Fully quit an older Alpha/Test KAI app before opening Core; all versions share the same wallet, models and profile.

Node uses the original `koinos-node` settings, state, financial journals and selected database location. Opening a plugin does not replace these with a second profile. Deliberate folder changes use the original checked move flow.

Closing the Node window leaves its supervisor and approved background work running in Core. Disabling or removing the plugin stops its managed node and drains pending native work before releasing the service. Quitting Core drains pending work and preserves Docker continuity, as in the original application; use **Stop node** when you intend to stop Docker containers as well. Core Local-Only pauses network actions and waits for the actively supervised node to stop. Installer downloads are cancelled before a late installer can launch.

## Plugin boundary

The plugin remains sandboxed: it has no Node.js, direct process/filesystem access or arbitrary network access. Its signed, publisher-pinned broker accepts only the original Node channel allowlists, separated into read, management, wallet and funding permissions. Native confirmations guard OS and financial changes. Wallet sends retain password proof and share the Core wallet spend lock with credit purchases and other wallet operations. Each operation rechecks its lifetime, selected wallet and network immediately before signing and submission, including queued Ethereum requests, Koinos RPC failover and external-wallet approvals.

Two transport adaptations preserve the original actions without giving a plugin privileged access:

- Private-key backup is displayed/copied in a password-verified native dialog. Private keys are never returned to plugin JavaScript.
- Unsigned producer JSON is saved through a native file picker, using the actual stored draft. Imports retain the original file/paste workflow and backend signature/draft comparison.

Guarded stores preserve unknown saved fields, reject corrupt or externally changed files, and never automatically restore payment journals. Configuration writes create private backups before changes; producer private-key files are not included in configuration backups.

## Development

`npm test` checks the packaged screens, controls, bridge and declared scopes. Host broker and native tests live in `therexdev/kai-core`. `node scripts/verify-package.js` verifies the signed package against the source after signing a new immutable release. Never commit publisher signing keys.
