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
