# Koinos Node 0.3.1

The ownership notice now offers **Migrate node to this plugin**. Review the detected legacy chain location, destination, network and size, close the other KAI application including its tray process, then choose **Stop old node and migrate**.

The plugin verifies the old stack and all data writers, stops only the reviewed containers, and transfers known chain-state folders into its own profile. Same-drive transfers avoid a duplicate full chain copy; cross-drive transfers verify and flush each file before removing its original. A persistent journal and restore guards allow pause, retry and recovery without starting either incomplete database. An active old supervisor, unexpected writer, changed source, mismatched chain or populated destination blocks migration.

Migration transfers chain data only. This plugin retains its current wallet. Legacy wallets, production keys, KOIN and VHP are untouched; transfer KOIN/VHP manually if you chose a new wallet. Completion leaves block production disabled so you can review the new wallet and start sync deliberately.

On systems where Docker owns files that the desktop user cannot read or remove, migration stops with a permissions explanation and retains recoverable data. It does not change permissions or elevate privileges automatically.

Verified with filesystem, Docker-command fixtures, cancellation/crash recovery tests and Electron UI interactions. No live user node, funds or production keys were moved during these tests.
