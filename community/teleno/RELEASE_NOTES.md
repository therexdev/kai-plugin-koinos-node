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

Validation: automated plugin tests, package-source verification, actual Linux
native smoke and a Linux transport simulation of the WSL controller using the
exact upstream executable. Actual Windows/WSL2 qualification and signed release
publication are still required; this source change is not an installed update.
No live wallet, burn, registration, transfer or funded production was tested.

## Previous release

# Teleno Koinos Node 1.0.1 — Community

Follows the language saved in Core Settings, including changes to open views. Supports English, Spanish, Brazilian Portuguese, French and German with offline catalogs. Core owns the first-run choice; plugin content and identifiers stay literal. Requires Core 0.7.17 or newer.

## Previous release

Teleno Koinos Node 1.0.0 — Community

Adds the independent `community.teleno-node` plugin: Teleno 1.3.0 with pinned artifacts; its own encrypted wallet and producer key; seven pages for overview, wallet, production, backup/recovery, logs, settings, and differences. Separate ports and databases allow coexistence with the regular node.

Linux x64 native runtime or x64 Linux container with Docker. No upstream ARM/Pi artifact. Native Linux offline startup/reopen and backup preflight/listing checks and plugin tests are included. Live funded mainnet production and Windows/macOS Docker require operator validation. No Core update is required.
