# Koinos Node 0.3.5

Requires **KAI Core 0.7.3 or later**. Update Core before installing this plugin update.

Alerts and confirmation prompts now use Core’s styled dialogs, and wallet/password popups match the app’s typography, colors and close controls. Existing review, cancellation and wallet safeguards remain in place.

This release includes the 0.3.4 Windows startup repair for generated configuration copied from read-only templates. Existing read-only copies are repaired on start; completed chain migration does not need to be repeated. Migrated chain data, wallets, producer keys, funding records and recovery journals stay in place.

Validation covers deferred and cancelled reviews without live account, payment or node operations. Native plugin services still require full computer/application trust; renderer UI remains sandboxed.
