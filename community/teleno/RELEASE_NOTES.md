# Teleno Koinos Node 1.4.3 — Visible production controls

Adds a permanent Production tab and a Block production shortcut on Dashboard.
A production panel stays visible at the top of Setup while an observer is
running, including when the Observer only checklist is complete or collapsed.

The production page lists runtime/storage, observer sync, wallet, signing key,
VHP, registration and pending-transaction readiness. The enable button remains
visible with the current blocker. A node behind the current chain stays in
observer mode until its head is recent and advancing with connected peers.
Once ready, enabling production still requires your explicit click and native
review; it never starts automatically after syncing or opening a page.

Existing wallets, keys, chain data, transaction journals, platform engines and
the 1.4.2 reward-history repair are retained. This is a plugin-only update.
Validation includes 119 unit/lifecycle checks, sandboxed renderer navigation
through syncing/ready observer-only states, password-field retention during
polling, explicit production-request dispatch, and actual Core-host navigation
with the signed package. No live funds or funded production are used.

---

# Teleno Koinos Node 1.4.2 — Confirmed rewards and wallet history

Fixes confirmed blocks and recent rewards staying at zero while KOIN/VHP
balances change. A successful empty account-history response from one RPC no
longer hides a fuller index on another configured RPC. Each refresh verifies
the chain identity, selects the index with the newest account sequence, and
keeps backfill pages and confirmation evidence on that same source.

History readers also accept protobuf JSON's omitted sequence-zero field. This
allows the first wallet entry to be indexed instead of rejecting the entire
history. Explicit malformed sequences, gaps and duplicate blocks still fail
without replacing saved totals. Existing indexes resume without a reset.

Validation: 114 plugin tests, source-format verification, and read-only live
mainnet comparison. The published reader returned zero for a public account;
the patched reader recovered two irreversible rewards and eight wallet rows,
with identical totals after reopening. No wallet transactions were submitted.
Catalog publication remains pending.

---

# Teleno Koinos Node 1.4.1 — Folder picker routing fix

Fixes “Invalid storage key” when choosing a chain drive or folder. The 1.4.0
commands used Core's reserved `storage.*` namespace and were intercepted before
the native Teleno service could open the picker. Chain-folder commands now use
the plugin-owned `chainStorage.*` namespace, including copy progress controls.

The fix requires only a plugin update. Wallets, signing keys, selected paths,
copy journals and chain databases are retained. Storage selection still requires
a stopped node, native review and verified copying with originals retained.

Regression coverage clicks the actual signed plugin's folder button through
Core's real preload/IPC/host dispatch, exercises picker cancellation, declines
and accepts native review, checks the selected path after copy/reopen, and
verifies no Core key/value-storage request or node start occurred.

---

# Teleno Koinos Node 1.4.0 — Dashboard, wallet and USB storage

The Android-inspired Dashboard shows balances, mana, live node health, chain
height, peers, confirmed blocks and recent rewards, with a primary Start/Stop
control. Setup now starts observer sync early, highlights the next step and
keeps production behind its existing readiness checks and native review.
Wallet adds an offline receive QR, paged transaction history with details,
compact Send / Get VHP dialogs and Send all with fresh balance/mana checks.
Password proof, exact wallet/network checks and native financial review remain.

Choose a mounted USB drive or folder in Setup / Settings while stopped.
Node files (including the hot signing key and snapshots) are checksum-copied
into an owned per-network directory. The original copy is retained; encrypted
spending-wallet data stays in the plugin profile. Interrupted copies can resume
or keep the original location. Missing/replaced drives block node startup;
there is no fallback to internal chain storage. Linux drives must support
private permissions, for example ext4. WSL2 stays inside managed Ubuntu storage.

Validation covers unit/lifecycle tests, real sandboxed desktop navigation,
paged history, independent QR decoding, reviewed transfer requests, signed
package startup in Core, and offline engine stop/copy/reopen on selected
storage. No live funds or physical Raspberry Pi uptime claim is involved.
The 1.3.1 startup timeout/Retry fix is retained. No new engine or Core update
is required; Core 0.7.33 is sufficient.

---

# Teleno Koinos Node 1.3.1 — Overview startup recovery

Fixes the initial overview staying on Loading Teleno when Core reports the
embedded plugin view as hidden during startup. The first status read now runs
before visibility-dependent background polling. Focus and visibility changes
request a fresh snapshot.

A failed or unanswered startup status read now shows the error and a Retry
connection button. Status reads have a 20-second deadline; retries issue a new
read without reloading the app. This deadline applies only to status reads,
not wallet transfers, burns, key registration or node-control operations.

The mining overview, wallets, signing keys, transaction journals and node data
are retained. Update the plugin in place from Plugins. Core 0.7.33 is sufficient;
no new Core installer or node engine is required for this fix.

Validation covers the initially hidden view, fresh-wallet startup, rejected and
unanswered status reads, retry recovery, and the existing mining overview checks.
A new release gate also opens the exact signed plugin in the actual Core 0.7.33
host using its real protocol, preload, IPC and native service on Linux x64 and
ARM64. Profiles/keychains are disposable test fixtures; no funded mining is used.

---

# Teleno Koinos Node 1.3.0 — Mining overview

The Overview page now shows the current independent Teleno wallet, lock state,
KOIN/tKOIN, VHP and mana balances, production/observer health, advancing chain
head, irreversible height, peers, confirmed blocks produced, KOIN block rewards,
and VHP consumed. A dated block/reward history shows the latest reward, with
an expandable recent feed and a manual refresh button.

Mining totals use irreversible block receipts signed by the selected wallet.
Only native KOIN mint events and VHP burn events count as rewards and consumed
VHP. Deposits, transfers, transaction mints and reversible blocks are excluded.
Account totals may include another machine producing with the same wallet.
Recent rewards load immediately while bounded older-history indexing resumes
across restarts; totals stay labeled partial until indexing finishes. Failed
refreshes retain previously loaded history with a visible stale-data warning.
Wallet/network changes discard the previous identity's displayed figures.

This is a read-only overview update. It does not unlock a wallet, enable
production, burn, transfer or register a key. Existing wallets, signing keys,
chain databases and the x64/ARM64 checksum-pinned engines are retained.
The existing setup guide and reviewed producer controls remain available.

Validation includes the plugin suite, exact signed-package verification and
real sandboxed Electron renderer checks with synthetic chain replies on both
Linux x64 and ARM64. No funded production or physical Pi uptime is claimed.

---

# Teleno Koinos Node 1.2.0 — Linux ARM64 / Raspberry Pi

- The existing plugin now selects a checksum-pinned native engine for Linux
  x64 or ARM64. Raspberry Pi requires 64-bit Raspberry Pi OS and ARM64 KAI Core.
- Native ARM64 targets Debian 12 / Pi OS Bookworm (GLIBC 2.36+). This community
  build uses the same Teleno 1.3.0 source as the existing x64 runtime.
- 32-bit ARM, macOS ARM64, Windows ARM64 and ARM64 Docker remain unsupported
  and receive explicit platform messages. There is no x64 fallback on ARM64.
- Archive and executable verification are per architecture. Native installation
  checks the actual engine before replacing an existing installation.
- Windows x64 WSL2, Linux x64 and optional x64 Docker retain their pinned
  engines. Wallets, producer approvals and chain directories keep their
  existing behavior.

Validation: 81 plugin tests and source-package verification; actual Linux x64
archive installation, both offline network identities, restart, RPC/gRPC,
process ownership, cancellation and backup validation/list/refusal pass.
Native Debian 12 ARM64 qualification passed all 107 upstream CTest tests,
4 Python script tests, all 81 plugin tests and the actual ARM64 archive,
both-network RPC/gRPC, restart and backup checks. Its immutable archive URL
and hashes are pinned in this update. The signed package retains the established
publisher identity. Physical Pi uptime and funded production are not claimed.

---

# Teleno Koinos Node 1.1.5 — Transaction confirmation recovery

Fixes the “could not be cloned” error after a transfer, KOIN burn or signing-key
registration. The transaction SDK attaches a wait function after submission;
the saved journal now owns independent snapshots on both writes and reads,
so later SDK or caller changes cannot corrupt its in-memory record. Inputs
that cannot be cloned fail before any journal or backup file is changed.

Previously saved pending transactions are checked again when the updated
plugin opens. Confirmation still requires canonical block inclusion, an
execution receipt and irreversible height. It never signs or resubmits a
saved transaction. Wallets, keys, chain data and backup progress are preserved.

If affected before updating, fully quit and reopen KAI, then choose Check
pending transaction. This reloads the clean journal already on disk. Do not
repeat the send, burn or key registration to clear a display error.

Validation: all 70 tests pass, including the exact failure reproduced with
the bundled SDK for all three transaction actions, independent journal
snapshots, failed-write preservation, canonical/reverted receipt checks and
no duplicate submissions. Package verification checks the exact signed
contents. Live chain evidence was checked read-only; no live transaction was
signed or submitted. Requires Core 0.7.17 or later; no Core update is needed.

## Previous release

# Teleno Koinos Node 1.1.4 — Clear backup progress

Backups now shows a live progress panel directly on the main screen: the
current download or restore stage, measured bytes and percentage, elapsed
time, transfer speed and an estimated remaining time when enough progress is
available. Stages without a reported total remain indeterminate. Quiet stages
explain that verification or disk work may still be running, and stale speed
estimates are hidden.

Snapshot lists are readable tables with a selection button. Completed downloads
offer a reviewed restore of that exact snapshot; completed restores point back
to Overview to start an observer. Download completion is distinct from restore
completion. The snapshot field survives automatic refresh and navigation.
Local snapshot actions and detailed logs remain available below the main flow.

Cancellation, missing files, insufficient disk space and connection failures
appear on the backup screen. Native diagnostics stay under Technical details.
Progress parsing is bounded and scoped to the current process and network.
Successful WSL maintenance drains its final output before reporting a result;
missing or unreadable results never appear as a successful restore. Existing
runtime checks, native review, recovery records and production-off behavior
remain in place.

Validation: 65 plugin tests, browser download/restore/cancellation/error flows
and narrow-layout checks, and real-executable Linux/WSL backup-result smoke
checks. A public metadata probe confirmed the native DNS error is surfaced;
this workspace could not resolve the snapshot host, so it did not download or
restore a full public chain snapshot. No live wallet or production actions
were tested. Requires Core 0.7.17 or later; no new Core release is needed.

## Previous release

# Teleno Koinos Node 1.1.3 — Complete setup and transaction confirmation

Overview now guides the full path from WSL2/runtime installation through a
separate wallet, offline wallet backup, block-signing key, observer sync,
funding/VHP, key registration and explicitly enabled production. The next step
is highlighted; completed steps collapse. Observer-only instructions skip the
wallet and production steps. Wallet and key creation come before startup, with
a Stop action for profiles that already have an observer running.

Backup completion requires an explicit Saved offline choice in the native key
dialog. Private keys remain outside the renderer. Progress is tied to the
wallet, network and signing public key; failed or stale balance/registration
checks never appear as completed setup. Production still requires its original
native review and live readiness checks.

Pending transactions are checked automatically while the plugin is visible.
The UI distinguishes waiting for inclusion, waiting for irreversibility,
unavailable confirmation, confirmed execution and reverted execution. The last
verified result and block height survive reopening, even if the separate
account-history service returns no entries. Checks never sign or resubmit and
do not block Stop node. Uncertain records continue to block another spend.

Validation: 50 plugin tests, full browser setup and confirmation scenarios,
real-executable Linux/WSL smoke checks and exact signed-package verification.
An isolated read-only mainnet check also confirmed a previously submitted
registration; no live transaction was signed or broadcast during testing.
Requires Core 0.7.17 or later; no new Core release is needed.

## Previous release

# Teleno Koinos Node 1.1.2 — Resume Ubuntu setup

Set up WSL2 now reopens an already installed Ubuntu distribution so interrupted
first-launch setup can continue. It requests Windows elevation only when a new
installation is needed. If a distribution appears during an installation
attempt, the terminal reopens it instead of leaving an already-exists error.
Existing Linux files, wallets and node data are preserved.

Includes the ordered setup guide from 1.1.1. Complete any username/password
prompts, then choose Check setup. If Ubuntu already opens at its command prompt,
return to the plugin and check setup there. No distribution reset is needed.

Validation: 35 plugin tests, signed-package verification, browser setup flows
and real-executable Linux/WSL smoke tests. Windows qualification also checks the
resume decision against the actually installed Ubuntu distribution; interactive
terminal launch is captured so CI does not display user setup prompts.

## Previous release

# Teleno Koinos Node 1.1.1 — Guided Windows setup

Overview now starts with three ordered setup steps: set up WSL2/Ubuntu, install
Teleno or switch an existing Docker profile, then start an observer. A read-only
check detects Ubuntu and verifies the runtime before enabling later steps. The
guide disappears when setup is complete and returns if a new session detects a
missing prerequisite. Opening the installer alone does not mark setup complete.

Failed downloads remain retryable. Disabled steps stay disabled after opening
help or completing another action. Existing Docker controls remain available
below the guide; node data, wallets and runtime pins are unchanged.

Validation includes 33 plugin tests, package verification, browser checks of
missing/ready Ubuntu, failed download/retry, completed setup/reopen, migration
and narrow layouts, plus real-executable setup checks in the Linux and Windows
WSL2 smoke tests. Requires Core 0.7.17+; no new Core release is needed.

## Previous release

# Teleno Koinos Node 1.1.0 — Docker-free Windows runtime

Windows now runs the complete, unchanged upstream Teleno 1.3.0 executable through
WSL2 / Ubuntu 24.04. Docker is not needed for new Windows profiles. Overview
includes WSL setup, runtime verification and a preserving switch for old Docker
profiles. Linux continues to run natively; optional Docker support remains.

Node data and producer keys live in the Linux filesystem. A resumable verified
copy preserves existing Teleno files and the separate encrypted wallet. Process
ownership checks, Linux filesystem locking and recovery records handle launcher
crashes and immediate cancellation without shutting down WSL or unrelated nodes.
Switching and restoring leave production off until the observer validation gate
and explicit producer review succeed.

Adds optional localhost gRPC, backup configuration validation, public snapshot
listing and download. Public restore now honors the selected snapshot ID.

Validation: 31 plugin tests and package-source verification on Windows, Linux
and macOS; actual Linux native smoke; and the exact upstream executable on
Windows Server 2025 / Ubuntu 24.04 WSL2. Both networks passed installation,
preserving data copy, JSON-RPC, HTTP/2 gRPC health checks, reopen, ownership,
cancellation and backup checks. A Linux transport simulation additionally
verifies launcher-crash recovery. [Windows evidence](https://github.com/therexdev/kai-plugin-koinos-node/actions/runs/43452980942/job/131979740683).
Update the independent Teleno Community plugin to 1.1.0, then use **Switch to
Docker-free runtime** for an existing Windows Docker profile. A Core update is
not required. Finish Ubuntu setup and any requested Windows restart first.
No live wallet, burn, registration, transfer or funded production was tested.

## Previous release

# Teleno Koinos Node 1.0.1 — Community

Follows the language saved in Core Settings, including changes to open views. Supports English, Spanish, Brazilian Portuguese, French and German with offline catalogs. Core owns the first-run choice; plugin content and identifiers stay literal. Requires Core 0.7.17 or newer.

## Previous release

Teleno Koinos Node 1.0.0 — Community

Adds the independent `community.teleno-node` plugin: Teleno 1.3.0 with pinned artifacts; its own encrypted wallet and producer key; seven pages for overview, wallet, production, backup/recovery, logs, settings, and differences. Separate ports and databases allow coexistence with the regular node.

Linux x64 native runtime or x64 Linux container with Docker. No upstream ARM/Pi artifact. Native Linux offline startup/reopen and backup preflight/listing checks and plugin tests are included. Live funded mainnet production and Windows/macOS Docker require operator validation. No Core update is required.
