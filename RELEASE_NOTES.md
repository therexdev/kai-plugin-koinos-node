# Koinos Node 0.3.6

The Node wallet’s Send tokens dialog now has **Send All**. It reads a fresh balance for the selected KOIN or VHP token and fills the amount without sending it. KOIN uses the amount currently available after mana headroom; VHP retains the full exact balance. Changing tokens clears the amount, and late balance results cannot fill a different wallet or network.

Wallet password verification and native transfer approval remain required. Tests cover exact amounts, stale reads, token and network changes, and the read-only boundary. No live transfers were made during verification.
