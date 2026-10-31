# Koinos Node 0.3.3

Fixes a false network mismatch when migrating a node created by the Windows Alpha app. Alpha's Windows checkout can use CRLF line endings while the signed plugin contains LF files. Migration previously compared the raw genesis file bytes, so identical Mainnet data could be rejected.

Migration now compares the complete genesis JSON content while allowing insignificant whitespace, a UTF-8 BOM, object-property order and equivalent exact numeric values. Arrays, value types and every field remain checked. Parsing is bounded, preserves numeric precision, and rejects duplicate keys or malformed data. Genuine network differences still block migration. File-access, safety and format problems receive distinct explanations instead of being mislabeled as the wrong network.

Keep Docker open and close the old KAI app, including its tray process. In the Node plugin, choose **Migrate node to this plugin**, review the locations and choose **Stop old node and migrate**. Existing profile, network, mount, writer, journal and file-verification safeguards still apply. Chain data alone is transferred; wallets, production keys, KOIN and VHP are not. Transfer funds manually if using a new wallet.

On systems where Docker owns files that the desktop user cannot read or remove, migration stops with a permissions explanation and retains recoverable data. It does not change permissions or elevate privileges automatically.

Regression coverage uses the complete stopped compose stack with Windows-formatted Alpha genesis data, plus BOM and formatting variants. Different networks, changed genesis fields, array-order changes, unsafe numeric ambiguity and malformed inputs remain rejected. Migration testing uses temporary files and simulated Docker responses; no live user chain or funds were moved.
