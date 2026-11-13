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
