# KAI Koinos Node 0.3.10 — Windows data folder moves

- Fixes `EPERM` when moving chain data into an existing empty folder selected by the Windows folder picker.
- After copy and checksum verification, rechecks the destination and removes only the empty directory before completing the move. Newly added files and directory links are rejected; removal is never recursive.
- If the final switch fails, the original chain data and saved location are retained. Retry the move from the plugin after updating; choose the intended destination folder itself, such as `D:\Koinosnode2`.
- Adds regression coverage for Windows rename behavior, changed destinations, directory links, locked folders and retry after a failed rename.

# KAI Koinos Node 0.3.9 — preserve your existing producer setup

- Review and select chain data, producer/custody settings, the existing production signing key and an optional encrypted wallet.
- Preserve the producer identity and external custody; keep the cold spending key on its secure device. Existing destination wallets/keys are protected.
- New transfers retain source chain files and leave production off for verification. Importing producer settings, a signing key or a wallet also disables automatic recovery and reward returns; chain-only imports preserve existing destination settings. Interrupted earlier transfers retain their recorded resume behavior.
- Reconnect external signers after migration. Pending signing requests, funding journals and general Alpha accounts are excluded.
- Includes migration dialog translations and regression coverage for changed sources, existing wallets/keys, interrupted copies and recovery.
- Production stays off after import. Verify the producer address and existing on-chain signing-key registration, then start sync-only before enabling production.

# KAI Koinos Node 0.3.8

Completes translation coverage for menus, forms, dialogs, tooltips and changing status text in English, Spanish, Brazilian Portuguese, French and German. Open views follow the language saved in Core Settings, including labels created after the view loads. Drafts, names, code and other user content remain intact.

Includes readable offline catalogs, reproducible generation, contributor documentation and regression tests for live language changes. Requires Core 0.7.17 or newer.

## Previous release

Koinos Node 0.3.7

Follows the language saved in Core Settings, including changes to open views. Supports English, Spanish, Brazilian Portuguese, French and German with offline catalogs. Core owns the first-run choice; plugin content and identifiers stay literal. Requires Core 0.7.17 or newer.

## Previous release

Koinos Node 0.3.6

The Node wallet’s Send tokens dialog now has **Send All**. It reads a fresh balance for the selected KOIN or VHP token and fills the amount without sending it. KOIN uses the amount currently available after mana headroom; VHP retains the full exact balance. Changing tokens clears the amount, and late balance results cannot fill a different wallet or network.

Wallet password verification and native transfer approval remain required. Tests cover exact amounts, stale reads, token and network changes, and the read-only boundary. No live transfers were made during verification.
