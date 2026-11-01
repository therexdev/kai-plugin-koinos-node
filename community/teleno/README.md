# Teleno Koinos Node — Community

An independently installable KAI Core plugin for [Teleno](https://github.com/koinos/teleno), the monolithic Koinos-compatible node. Plugin ID: `community.teleno-node`. This integration is maintained by **therexdev**, not endorsed by the upstream project.

Install **Teleno Koinos Node** from KAI Core's Community catalog. Its signed package is independent from the regular node, even though both source trees live in this repository. Requires KAI Core 0.7.3 or later.

## Differences from the regular node

| | Teleno Community | Regular KAI Koinos Node |
| --- | --- | --- |
| Runtime | One Teleno process; optionally one Linux container | Docker microservice stack |
| Wallet | Its own encrypted wallet and separate block-signing hot key | Its own Node wallet |
| Native platform | Linux x64, GLIBC 2.38+; upstream release 1.3.0 | Docker-based runtime |
| Docker platform | x64 Windows, Intel macOS, Linux with Docker installed | Multi-service Docker setup |
| ARM / Raspberry Pi | Not supported by the pinned upstream artifacts | Separate regular-node support |
| Chain data | Separate per-network Teleno databases | Legacy Koinos database layout |
| Backups | Native snapshots, preflight, restore, public bootstrap | Regular-node quick sync / migration |
| Funding | Receive, send KOIN/VHP, and explicit manual burn | Also bridge funding and external-signing flows |
| Automation | Optional observer startup with Core | Recovery and reward automation |
| Rewards | Ordinary Koinos proof-of-burn block rewards | Ordinary block rewards; optional reward automation |

The plugin does not provide AI capacity, distribute the KAI reward pool, import Alpha node databases, bridge assets, or automatically reburn earnings. Holding VHP does not guarantee a block reward.

## Pages and setup

1. **Overview** — choose the runtime in Settings, install/verify the pinned executable or container, then start an observer. Docker must already be installed and running in Linux-container mode. Linux users can select Docker if their native libraries are too old.
2. **Wallet** — create a new wallet with a password, save its private-key backup offline, receive KOIN, view KOIN/VHP/Mana and activity, send tokens, or burn a chosen amount into VHP. Import is for deliberately restoring this wallet's backup; do not reuse Core, regular-node, or Master-node keys. No automatic wallet discovery or migration occurs.
3. **Producer** — create a separate hot key while stopped, register that public key with the Teleno wallet, then start and validate an observer. Production needs an advancing recent head, a current peer reading, VHP, matching on-chain registration, and explicit native review. Each chain mutation requires the wallet password. A locked spending wallet does not stop an active producer.
4. **Backups** — stop the node, create/list snapshots, check a restore, restore a local snapshot, or fetch the upstream network's public HTTPS bootstrap. Native restore preserves previous databases under `.pre-restore/`. It never imports a legacy snapshot or enables production. Start and validate an observer afterward. Chain snapshots exclude wallet and producer keys: back those up separately.
5. **Logs** — bounded, redacted runtime and backup output.
6. **Settings** — Mainnet/Harbinger, native/Docker, independent RPC/P2P ports, log level, account-history indexing and optional observer startup.
7. **About & differences** — platform limitations, the comparison above and upstream links.

Default RPC is **127.0.0.1:18085** and P2P is **18890**. RPC is never published on all host interfaces. Docker mounts only the selected Teleno chain directory, not the encrypted wallet. gRPC and backup-admin endpoints are disabled. Each network has its own database and block-signing key; the plugin wallet address is the same on both networks, whose balances are separate.

Starting Core can resume an observer only when explicitly enabled. A node crash preserves the database and displays an error; Stop checks ownership before retiring a stale process. It does not delete chain data or repeatedly restart a producer. Stop a running node before changing runtime or network. Disabling/uninstalling the plugin stops its process and retains its saved data.

Transactions are password-reviewed and serialized. A signed submission is recorded before transport. An uncertain submission remains pending and blocks another spend or network change. **Check pending transaction** verifies canonical irreversible inclusion and receipts; it never resubmits or substitutes a new transaction. If the selected RPC has no transaction history, the journal remains preserved until that service is available.

## Runtime provenance and validation limits

This package pins Teleno **1.3.0**, source `2c11229267cff2f9ee39ed8e56ab70af391d85ce`. Archive, native executable and Docker image hashes are in [`plugin/service/runtime.json`](plugin/service/runtime.json). Downloads are checked before execution; no rolling `latest` tag is used. New upstream binaries require a reviewed plugin release. Upstream artifacts are unsigned; checksum pins here are covered by the KAI publisher's package signature.

Upstream has published observer qualification, not a guarantee of unlimited mainnet producer uptime. See [release evidence and remaining work](https://github.com/koinos/teleno/releases/tag/teleno-node-v1.3.0). Local checks cover the real Linux executable's offline startup, genesis identity, clean reopen, backup configuration/listing and refusal of an empty-chain backup, plus wallet/lifecycle tests. Windows/macOS Docker operation and live funded mainnet production need hardware/operator testing. No live wallet, burn, registration or production is exercised by the test suite.

This is a full-trust native plugin. A separate data directory is not an operating-system security sandbox. It uses the public Foundation SDK and bundles its own dependencies. It does not read Core internals, another installed plugin, legacy wallets, or OS account secrets.

## Build and verify

```sh
cd community/teleno
npm ci --ignore-scripts
npm run build
npm test
node scripts/verify-package.js --source
# On Linux x64 with the exact verified release executable:
node scripts/native-smoke.js /path/to/teleno_node
```

Wallet, keystore, chain and history helpers are copied under this plugin's own service directory from the regular Node implementation at `b95cddd`. There are no imports from the other installed plugin. Locked dependencies are vendored at author build time; installation runs no npm hooks. The release workflow validates and assembles an already signed immutable package; it never has the publisher's private key.

Teleno's MIT license and the regular plugin's MIT license are retained. Teleno runtime provenance is separate from this integration's version.
