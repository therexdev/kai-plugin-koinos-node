# Teleno Koinos Node — Community

An independently installable KAI Core plugin for [Teleno](https://github.com/koinos/teleno), the monolithic Koinos-compatible node. Plugin ID: `community.teleno-node`. This integration is maintained by **therexdev**, not endorsed by the upstream project.

Install **Teleno Koinos Node** from KAI Core's Community catalog. Its signed package is independent from the regular node, even though both source trees live in this repository. Requires KAI Core 0.7.17 or later.

The Docker-free Windows runtime is included from **1.1.0**. **1.1.3** adds a
complete front-page checklist with verified progress. Follow the highlighted
step; completed steps collapse and the guide closes after setup. Choose
**Observer only** to sync without a wallet, signing key or funds, or use the
**Block producer guide** for the full sequence below. A Core update is not required.

On Windows, **Set up WSL2** reopens an existing Ubuntu installation, including
after interrupted username/password setup. Complete any prompts, or return to
**Check setup** if Ubuntu opens at a command prompt. Ubuntu files are preserved.

### Overview startup

**1.3.1** loads the first node status even while Core is opening the embedded
view. If status cannot be read, the page shows a reason and **Retry connection**
after at most 20 seconds. Retry reads status again; it does not start production
or repeat a wallet transaction. Update in place to retain your wallet and node
data. Core **0.7.33** is sufficient for this plugin patch.

### Mining overview

Version **1.3.0** brings the selected wallet and balances, node health, chain
progress, confirmed produced blocks, KOIN rewards and VHP consumed to Overview.
The recent reward feed includes block heights and local dates/times. Use
**Show more blocks** for up to 40 recent indexed blocks. Deposits and transfers
are excluded from mining rewards. Counts cover the wallet on the selected
network, including production by another machine using the same wallet.

Older history is indexed in bounded batches and resumes after restart. The
newest confirmed rewards are fetched separately so they appear while totals
are still marked partial. Network or history errors are displayed; previously
loaded figures are clearly marked out of date. History requires an available
account-history RPC service (local history on Harbinger). A recent head and
peers show chain progress, not a guarantee that this machine will find a block.

The overview refreshes node health every five seconds and wallet/mining details
every 30 seconds while visible. It never unlocks a wallet or enables production.
For the Pi AppImage extraction error, update **KAI Core to 0.7.33**; fully quit
Core including its tray instance and reopen once if the old app already errored.

### Complete setup order

1. **Set up WSL2 and Ubuntu** (Windows only), finish the Ubuntu prompts and any requested restart, then **Check setup**.
2. **Install Teleno**, or use the preserving switch for an existing Docker profile.
3. **Create your Teleno wallet** with a password, or deliberately restore your own Teleno backup. The wallet is separate from Core and other node plugins.
4. **Save your wallet backup**: enter the password in Wallet, choose **Show backup key**, save it privately offline, and choose **Saved offline** in the native dialog. Merely opening the dialog does not complete the step. The password alone cannot recover a lost wallet.
5. **Create a block-signing key** while the node is stopped. This separate hot key signs blocks; it is not the spending-wallet backup key.
6. **Start an observer and sync** until the head is recent and advancing with connected peers. Optional public bootstrap instructions are in Backups.
7. **Fund your wallet and get VHP** on the selected network. Receive KOIN at the displayed Teleno address, keep KOIN available for mana, and review any chosen irreversible burn into VHP. Receiving VHP is also supported; the guide recognizes existing balances.
8. **Register your signing key** in Producer using the wallet password, review the network/address/public key, and wait for irreversible confirmation.
9. **Enable block production** through a separate native review. This requires a synced observer, peers, VHP and matching registration. Locking the wallet does not stop production; use **Stop node**. Restarting Core can start only an observer, so production needs a new review after restart.

If an observer is already running before a wallet or key has been created, the
guide offers **Stop node** before that step. Wallet backup confirmation is tied
to the wallet; balances and registration are checked separately for each network
and key. Unavailable RPC results are shown as unverified, not zero balances.

## Raspberry Pi / Linux ARM64 (1.2.0)

Use the same **Teleno Koinos Node** Community plugin on a Raspberry Pi with
64-bit Raspberry Pi OS Bookworm or newer and the ARM64 build of KAI Core.
The plugin selects the ARM64 engine automatically. In Settings, use
**Native Linux (x64 / ARM64)**, then follow **Install Teleno** and the existing
observer or producer guide. Docker and an Android installation are unnecessary.
A 32-bit OS is refused with instructions to install the 64-bit OS.

The engine is a separate Linux GLIBC build of the same pinned Teleno 1.3.0
source, not the Android executable. It is maintained by therexdev and is not
an official upstream ARM64 release. The Debian 12 build includes a syntax-only
cpp-libp2p compatibility patch for GCC 12; its checksum and test evidence are
recorded in the [ARM64 validation notes](docs/ARM64_VALIDATION.md). Both the
downloaded archive and extracted
executable must match architecture-specific SHA-256 pins before execution.
A failed download, checksum or native loader check preserves an existing engine.
Windows and Linux x64 keep their existing upstream engine and image hashes.
The optional Docker image remains x64 only; ARM64 uses the native runtime.

Chain snapshots require space for the download, restored database and retained
recovery data. Resource or disk-space refusals remain visible in Backups and
Logs; the platform change does not bypass Teleno's readiness checks.
Actual Pi hardware, sustained mainnet sync and funded block production still
require operator testing. Native ARM64 runner tests are not a Pi uptime claim.

## Differences from the regular node

| | Teleno Community | Regular KAI Koinos Node |
| --- | --- | --- |
| Runtime | Complete upstream Teleno executable; Docker optional | Docker microservice stack |
| Wallet | Its own encrypted wallet and separate block-signing hot key | Its own Node wallet |
| Native platform | Linux x64 (GLIBC 2.38+), Linux ARM64 (GLIBC 2.36+); Windows x64 through WSL2 / Ubuntu 24.04 | Docker-based runtime |
| Optional Docker platform | Existing x64 Windows profiles, Intel macOS, Linux | Multi-service Docker setup |
| ARM / Raspberry Pi | Native Linux ARM64 community build; 64-bit OS and ARM64 KAI Core required | Separate regular-node support |
| Chain data | Separate per-network Teleno databases | Legacy Koinos database layout |
| Backups | Native snapshots, preflight, restore, public bootstrap | Regular-node quick sync / migration |
| Funding | Receive, send KOIN/VHP, and explicit manual burn | Also bridge funding and external-signing flows |
| Automation | Optional observer startup with Core | Recovery and reward automation |
| Rewards | Ordinary Koinos proof-of-burn block rewards | Ordinary block rewards; optional reward automation |

The plugin does not provide AI capacity, distribute the KAI reward pool, import Alpha node databases, bridge assets, or automatically reburn earnings. Holding VHP does not guarantee a block reward.

## Pages and setup

1. **Overview** — the complete checklist above appears first on Windows and Linux, highlights the next action and links directly to the relevant page. Completed steps collapse. Missing prerequisites, failed downloads and interrupted migrations remain retryable. Existing Windows Docker profiles use **Switch to Docker-free runtime**, which preserves original data and keys. Observer-only instructions omit wallet and production requirements.
2. **Wallet** — create a new wallet with a password, save its private-key backup offline, receive KOIN, view KOIN/VHP/Mana and activity, send tokens, or burn a chosen amount into VHP. Import is for deliberately restoring this wallet's backup; do not reuse Core, regular-node, or Master-node keys. No automatic wallet discovery or migration occurs.
3. **Producer** — create a separate hot key while stopped, register that public key with the Teleno wallet, then start and validate an observer. Production needs an advancing recent head, a current peer reading, VHP, matching on-chain registration, and explicit native review. Each chain mutation requires the wallet password. A locked spending wallet does not stop an active producer.
4. **Backups** — stop the node, then follow the download → restore → observer steps. A live panel shows the current stage, measured bytes and percentage, elapsed time, speed and estimated time remaining where available. Snapshot lists, completion, cancellation and actionable errors appear here without opening Logs. Select a snapshot from the table; the completion button restores that exact downloaded ID after native review. Local snapshot creation/listing, restore checks and technical details remain available below. Native restore preserves previous databases under `.pre-restore/`. It never imports a legacy snapshot or enables production. Start and validate an observer afterward. Chain snapshots exclude wallet and producer keys: back those up separately.
5. **Logs** — bounded, redacted runtime and backup output.
6. **Settings** — Mainnet/Harbinger, native/WSL2/optional Docker, WSL distribution, independent RPC/P2P ports, optional local gRPC, log level, account-history indexing and optional observer startup.
7. **About & differences** — platform limitations, the comparison above and upstream links.

Default RPC is **127.0.0.1:18085** and P2P is **18890**. RPC is never published on all host interfaces. Docker mounts only the selected Teleno chain directory, not the encrypted wallet. gRPC is optional and loopback-bound; backup-admin endpoints remain disabled. Each network has its own database and block-signing key; the plugin wallet address is the same on both networks, whose balances are separate.

Starting Core can resume an observer only when explicitly enabled. A node crash preserves the database and displays an error; Stop checks ownership before retiring a stale process. It does not delete chain data or repeatedly restart a producer. Stop a running node before changing runtime or network. Disabling/uninstalling the plugin stops its process and retains its saved data.

Transactions are password-reviewed and serialized. A signed submission is recorded before transport. An uncertain submission remains pending and blocks another spend or network change. While the plugin is visible, pending confirmation is checked automatically every 15 seconds, with one shared check at a time; **Check pending transaction** also remains available. Checks never sign or resubmit. Canonical block inclusion, an execution receipt and irreversible height are required before releasing the pending record. RPC failures preserve the record and display an explanation. These reads do not hold up Stop node.

Version **1.1.5** fixes confirmation failing with “could not be cloned” after a submission. The journal holds an independent transaction snapshot, so the SDK’s added helper functions cannot affect it. Updating and reopening resumes checks of the saved transaction without resubmitting. Before updating, fully quit and reopen KAI and choose **Check pending transaction** to reload the clean saved record; do not repeat the transaction to clear the error.

The latest verified result remains visible after confirmation and after reopening the plugin, including reverted execution and block height. The account-history feed is separate: an empty feed does not erase a locally verified result or imply that the transaction failed. If transaction/block-store evidence is unavailable, the pending record remains protected until it can be verified.

## Runtime provenance and validation limits

This package pins Teleno **1.3.0**, source `2c11229267cff2f9ee39ed8e56ab70af391d85ce`. Architecture-specific archives, native executables and the Docker image hashes are in [`plugin/service/runtime.json`](plugin/service/runtime.json). Downloads are checked before execution; no rolling `latest` tag is used. New upstream binaries require a reviewed plugin release. The x64 upstream artifacts and community ARM64 artifact have separate provenance; checksum pins here are covered by the KAI publisher's package signature.

Upstream has published observer qualification, not a guarantee of unlimited mainnet producer uptime. See [release evidence and remaining work](https://github.com/koinos/teleno/releases/tag/teleno-node-v1.3.0). Local checks cover the real Linux executable's offline startup, genesis identity, clean reopen, backup configuration/listing and refusal of an empty-chain backup, plus wallet/lifecycle tests.

The [actual Windows Server 2025 / Ubuntu 24.04 WSL2 test](https://github.com/therexdev/kai-plugin-koinos-node/actions/runs/43452980942/job/131979740683) passed for both Mainnet and Harbinger offline databases: exact binary installation, preserving Windows-to-Linux data copy, JSON-RPC, a complete HTTP/2 gRPC health request, clean reopen, process-identity checks, immediate cancellation and backup validation/list/refusal. The Linux transport simulation additionally verifies launcher crashes and orphan recovery. The plugin test suite and package-source verification pass on Windows, Linux and Intel macOS. Current ARM64 results are recorded in the [ARM64 validation notes](docs/ARM64_VALIDATION.md). This does not qualify every Windows desktop configuration. Windows/macOS Docker operation and live funded mainnet production still need hardware/operator testing. No live wallet, burn, registration or production is exercised by the test suite.

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

This integration runs the complete Teleno 1.3.0 engine from the pinned source
above. The x64 executable is the unchanged upstream release; the ARM64 build
records its dependency compatibility patch in the validation notes. It does
not substitute the legacy Koinos service stack.
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
