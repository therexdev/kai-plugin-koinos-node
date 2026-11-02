# Preserve an existing Alpha node

This guide describes the expanded migration in this source branch. It is not available in an installed plugin until a new signed plugin package is published. Older plugin versions offer **chain data only**; do not use that option expecting it to preserve the producer setup.

## Before the handoff

Install KAI Core Beta separately. Its profile is separate from Alpha. Models and the Core wallet can be copied through Core Settings, but that does not configure the Node plugin or import its production key.

For an existing producing node, keep the existing producer identity. Do not create a replacement Node wallet, generate or rotate a signing key, register a new key, or move KOIN/VHP just to migrate the application. Back up the existing wallet and production key securely before the handoff. Never send private keys to support or include them in screenshots.

Keep Docker running. Fully quit Alpha, including its tray process, so its supervisor cannot restart the old containers. The migration will stop and retire the recognized old containers when you confirm the reviewed import. It records a migration marker in the source: retaining source files is not permission to restart Alpha or an automatic rollback. Keep Alpha closed afterward.

## Review the import

Open **KAI Koinos Node → Dashboard or Node → Migrate node to this plugin**. Review the detected source, destination, network, producer address and signing public key. The dialog offers these choices:

| Choice | What it preserves |
|---|---|
| Chain data | A verified copy of the supported chain databases. New imports retain the original files and need enough space for the copy. |
| Producer settings | The existing producer custody mode/address and the custom RPC for the selected network. Automatic recovery and reward returns remain disabled. |
| Existing production signing key | The existing hot block-production key pair, validated for consistency. No replacement key is generated. |
| Encrypted wallet | An explicit copy of the compatible Alpha wallet into the plugin's separate wallet storage, keeping its address and password. Existing destination wallets are not overwritten. |

For a local-wallet producer, the destination wallet must match the source producer. Import the matching encrypted wallet when needed; a different wallet cannot silently become the producer. For external/cold custody, the external spending key stays on its existing secure device. The node imports its watch-only producer address and existing hot production key. Reconnect Koin Vault or another external signer afterward; pairing sessions and pending signing requests are not migrated.

Confirm the old app is closed, then review and start the selected import. Keep Core open or in its tray. If interrupted, use **Resume migration** before starting either node. A previously interrupted chain-only transfer keeps its recorded transfer semantics; it is not silently converted into a new copy operation.

Existing destination data is protected. A conflict or a changed/unreadable source stops the import for review. Do not delete a wallet, key, database or migration journal to force the operation through.

## Verify before producing

1. Check that the selected network and producer address match the old installation.
2. If a wallet was imported, unlock it using its original password and verify its address.
3. Compare the displayed signing public key with the old node and verify its on-chain registration. Keeping the same registered key should not require registering a new one. If registration cannot be verified or does not match, leave production off and investigate.
4. Start in sync-only mode and let the node catch up. Enable production deliberately after these checks. Review automatic recovery and automatic financial settings separately before enabling them.
5. Keep Alpha closed. Do not run both installations as producers with the same key.

No migration sends funds or changes on-chain authority. KOIN and VHP stay at their existing addresses. Reward-return percentages/destinations, custom Docker/YAML overrides, pending transfers, funding/credit journals, external signer sessions, saved transaction drafts, general Alpha accounts and Master distribution accounting are outside this import. Review any custom node overrides separately before the handoff.

For a new node, a dedicated Node wallet remains recommended. For an existing producer, preserving its current wallet/custody arrangement comes first; wallet separation can be planned as a separate change after migration is verified.
