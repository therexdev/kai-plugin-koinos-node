# Koinos Node 0.3.2

Fixes migration rejecting the normal Koinos node stack as unrecognized. The previous image-name check excluded the digit in the official `koinos/koinos-p2p` image. Migration now checks each known service against its official image repository, including P2P, instead of a broad name prefix. Stopped containers are supported; there is no need to start the old node to migrate it.

Failed migration previews now stop showing “Checking…” for unknown locations and chain size. The error and Check again remain available, and transfer stays disabled until a valid review succeeds.

Keep Docker open and close the old KAI app, including its tray process. In the Node plugin, choose **Migrate node to this plugin**, review the locations and choose **Stop old node and migrate**. Existing profile, network, mount, writer, journal and file-verification safeguards still apply. Chain data alone is transferred; wallets, production keys, KOIN and VHP are not. Transfer funds manually if using a new wallet.

On systems where Docker owns files that the desktop user cannot read or remove, migration stops with a permissions explanation and retains recoverable data. It does not change permissions or elevate privileges automatically.

Regression coverage uses the complete twelve-service compose stack with stopped containers, as well as rejection of unknown services, incorrect image repositories and mismatched service roles. Migration testing uses temporary files and simulated Docker responses; no live user chain or funds were moved.
