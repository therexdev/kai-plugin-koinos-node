# Teleno Koinos Node — Community

An independently installable KAI Core plugin for [Teleno](https://github.com/koinos/teleno), the monolithic Koinos-compatible node. Plugin ID: `community.teleno-node`. This integration is maintained by **therexdev**, not endorsed by the upstream project.

Install **Teleno Koinos Node** from KAI Core's Community catalog. Its signed package is independent from the regular node, even though both source trees live in this repository. Requires KAI Core 0.7.17 or later.

The Docker-free Windows runtime is included from **1.1.0**. Version **1.1.1** puts
a three-step setup guide at the top of Overview: finish WSL2/Ubuntu setup and
choose **Check setup**, install Teleno (or switch an existing Docker profile),
then **Start observer**. Later steps stay disabled until their prerequisites are
ready. The guide disappears once Ubuntu and the runtime have been verified.
A Core application update is not required.

From **1.1.2**, **Set up WSL2** reopens Ubuntu when it is already installed,
including after interrupted username/password setup. Complete any prompts, or
return to **Check setup** if Ubuntu already opens at a command prompt. Existing
Ubuntu files are preserved; restarting setup does not reinstall the distribution.

## Differences from the regular node

| | Teleno Community | Regular KAI Koinos Node |
| --- | --- | --- |
| Runtime | Complete upstream Teleno executable; Docker optional | Docker microservice stack |
| Wallet | Its own encrypted wallet and separate block-signing hot key | Its own Node wallet |
| Native platform | Linux x64, GLIBC 2.38+; Windows x64 through WSL2 / Ubuntu 24.04 | Docker-based runtime |
| Optional Docker platform | Existing x64 Windows profiles, Intel macOS, Linux | Multi-service Docker setup |
| ARM / Raspberry Pi | Not supported by the pinned upstream artifacts | Separate regular-node support |
| Chain data | Separate per-network Teleno databases | Legacy Koinos database layout |
| Backups | Native snapshots, preflight, restore, public bootstrap | Regular-node quick sync / migration |
| Funding | Receive, send KOIN/VHP, and explicit manual burn | Also bridge funding and external-signing flows |
| Automation | Optional observer startup with Core | Recovery and reward automation |
| Rewards | Ordinary Koinos proof-of-burn block rewards | Ordinary block rewards; optional reward automation |

The plugin does not provide AI capacity, distribute the KAI reward pool, import Alpha node databases, bridge assets, or automatically reburn earnings. Holding VHP does not guarantee a block reward.

## Pages and setup

1. **Overview** — Windows defaults to **Native through WSL2 (no Docker)**. Follow the guide at the top: **Set up WSL2**, finish Ubuntu's username/password setup and restart Windows if requested, then **Check setup → Install Teleno → Start observer**. Opening the Ubuntu installer alone does not complete setup. The guide is hidden only after successful runtime verification; failed or interrupted downloads leave the next step available to retry. Linux runs the executable directly. Existing Windows Docker profiles show **Switch to Docker-free runtime** in step 2, which copies this plugin’s chain data and producer keys into Linux storage and preserves the originals. Existing Docker controls remain in a collapsed section below the guide.
2. **Wallet** — create a new wallet with a password, save its private-key backup offline, receive KOIN, view KOIN/VHP/Mana and activity, send tokens, or burn a chosen amount into VHP. Import is for deliberately restoring this wallet's backup; do not reuse Core, regular-node, or Master-node keys. No automatic wallet discovery or migration occurs.
3. **Producer** — create a separate hot key while stopped, register that public key with the Teleno wallet, then start and validate an observer. Production needs an advancing recent head, a current peer reading, VHP, matching on-chain registration, and explicit native review. Each chain mutation requires the wallet password. A locked spending wallet does not stop an active producer.
4. **Backups** — stop the node, create/list snapshots, check a restore, restore a local snapshot, or fetch the upstream network's public HTTPS bootstrap. Native restore preserves previous databases under `.pre-restore/`. It never imports a legacy snapshot or enables production. Start and validate an observer afterward. Chain snapshots exclude wallet and producer keys: back those up separately.
5. **Logs** — bounded, redacted runtime and backup output.
6. **Settings** — Mainnet/Harbinger, native/WSL2/optional Docker, WSL distribution, independent RPC/P2P ports, optional local gRPC, log level, account-history indexing and optional observer startup.
7. **About & differences** — platform limitations, the comparison above and upstream links.

Default RPC is **127.0.0.1:18085** and P2P is **18890**. RPC is never published on all host interfaces. Docker mounts only the selected Teleno chain directory, not the encrypted wallet. gRPC is optional and loopback-bound; backup-admin endpoints remain disabled. Each network has its own database and block-signing key; the plugin wallet address is the same on both networks, whose balances are separate.

Starting Core can resume an observer only when explicitly enabled. A node crash preserves the database and displays an error; Stop checks ownership before retiring a stale process. It does not delete chain data or repeatedly restart a producer. Stop a running node before changing runtime or network. Disabling/uninstalling the plugin stops its process and retains its saved data.

Transactions are password-reviewed and serialized. A signed submission is recorded before transport. An uncertain submission remains pending and blocks another spend or network change. **Check pending transaction** verifies canonical irreversible inclusion and receipts; it never resubmits or substitutes a new transaction. If the selected RPC has no transaction history, the journal remains preserved until that service is available.

## Runtime provenance and validation limits

This package pins Teleno **1.3.0**, source `2c11229267cff2f9ee39ed8e56ab70af391d85ce`. Archive, native executable and Docker image hashes are in [`plugin/service/runtime.json`](plugin/service/runtime.json). Downloads are checked before execution; no rolling `latest` tag is used. New upstream binaries require a reviewed plugin release. Upstream artifacts are unsigned; checksum pins here are covered by the KAI publisher's package signature.

Upstream has published observer qualification, not a guarantee of unlimited mainnet producer uptime. See [release evidence and remaining work](https://github.com/koinos/teleno/releases/tag/teleno-node-v1.3.0). Local checks cover the real Linux executable's offline startup, genesis identity, clean reopen, backup configuration/listing and refusal of an empty-chain backup, plus wallet/lifecycle tests.

The [actual Windows Server 2025 / Ubuntu 24.04 WSL2 test](https://github.com/therexdev/kai-plugin-koinos-node/actions/runs/43452980942/job/131979740683) passed for both Mainnet and Harbinger offline databases: exact binary installation, preserving Windows-to-Linux data copy, JSON-RPC, a complete HTTP/2 gRPC health request, clean reopen, process-identity checks, immediate cancellation and backup validation/list/refusal. The Linux transport simulation additionally verifies launcher crashes and orphan recovery. All 31 plugin tests and package-source verification passed on Windows, Linux and macOS. This does not qualify every Windows desktop configuration. Windows/macOS Docker operation and live funded mainnet production still need hardware/operator testing. No live wallet, burn, registration or production is exercised by the test suite.

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
node scripts/wsl-smoke.js /path/to/teleno_node --local-transport
# On Windows with Ubuntu-24.04 installed as WSL2:
node scripts/wsl-smoke.js C:/path/to/teleno_node
```

Wallet, keystore, chain and history helpers are copied under this plugin's own service directory from the regular Node implementation at `b95cddd`. There are no imports from the other installed plugin. Locked dependencies are vendored at author build time; installation runs no npm hooks. The release workflow validates and assembles an already signed immutable package; it never has the publisher's private key.

Teleno's MIT license and the regular plugin's MIT license are retained. Teleno runtime provenance is separate from this integration's version.

## Windows native runtime

The released upstream artifact is an ELF Linux x64 executable, not a Windows
`.exe`. WSL2 supplies Linux; it does not run a Docker daemon or container. The
plugin downloads the identical pinned upstream archive and checks both archive
and executable hashes before running it. Python 3 (included in Ubuntu 24.04)
supervises the Linux process and holds a filesystem lock inherited by the node.

The encrypted spending wallet and settings remain in the KAI plugin profile.
Node databases, native backups and the separate producer hot key live under
`~/.local/share/kai-teleno/<profile-id>/chains/<network>` inside the selected
WSL distribution. Windows accesses those files through `\\wsl.localhost`.
Linux execution never uses a Windows/NTFS database directory. RPC and optional
gRPC use WSL localhost forwarding. For gRPC, the supervisor relays IPv4 loopback
to the upstream IPv6 loopback listener, avoiding WSL's IPv4-mapped IPv6 forwarding
limitation. The byte relay preserves HTTP/2, caps connections at 32 and buffers at
64 KiB per direction, and shuts down with the node. P2P connects outbound without a public port
forward. Inbound P2P reachability depends on the operator’s WSL networking and
firewall configuration.

A profile switch never enables production, changes its wallet, merges unrelated
databases, or deletes the original chain data. Existing Docker databases require
a verified stopped container before copying. Copies are streamed and verified,
recorded for resume, and refused if the source changes. An interrupted migration
blocks startup until **Resume data switch** completes. A fresh profile does not
invoke Docker at any step.

Stop signals only the recorded Teleno child after checking its owner, token,
Linux PID start time, executable and basedir. It never calls `wsl --shutdown` or
terminates another Linux distribution. Unexpected launcher exits retain recovery
records; a subsequent Stop recovers the owned Linux process. Unsupported or
missing WSL installations return setup instructions instead of a Docker error.

## Upstream functionality

This integration runs the complete, unmodified Teleno 1.3.0 executable, pinned
to the release above. It does not substitute the legacy Koinos service stack.
The desktop controls cover observer syncing, explicitly enabled block production,
JSON-RPC, optional gRPC, supported history indexing, logs, local snapshots,
backup validation, public snapshot listing/download, restore and observer-first
recovery. Upstream verification and recovery holds remain active.

The [full upstream manual](https://github.com/koinos/teleno/blob/main/docs/README.md)
also describes advanced CLI deployments, private SFTP backup publishing, backup
scheduling and a token-protected admin server. Those are capabilities of the
included executable, not additional configuration pages provided by this plugin.
Do not start a separately managed process against this plugin's active database.
The plugin regenerates its managed config for desktop operations.
