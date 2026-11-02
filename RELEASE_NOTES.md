# Koinos Node 0.3.6

## 0.3.7 — shared interface language (unreleased)

Follows the language saved in Core Settings, including changes to open views. Supports English, Spanish, Brazilian Portuguese, French and German with offline catalogs. Core owns the first-run choice; plugin content and identifiers stay literal. Requires Core 0.7.17 or newer. Publish a newly signed package and matching catalog minimum only after the Core release; existing release assets remain unchanged.

The Node wallet’s Send tokens dialog now has **Send All**. It reads a fresh balance for the selected KOIN or VHP token and fills the amount without sending it. KOIN uses the amount currently available after mana headroom; VHP retains the full exact balance. Changing tokens clears the amount, and late balance results cannot fill a different wallet or network.

Wallet password verification and native transfer approval remain required. Tests cover exact amounts, stale reads, token and network changes, and the read-only boundary. No live transfers were made during verification.
