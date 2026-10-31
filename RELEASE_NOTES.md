# Koinos Node 0.3.4

Fixes Windows node startup failing with `EPERM: operation not permitted, copyfile` for `koinos_descriptors.pb` after a successful chain migration, and on later starts of a newly configured node.

Installed plugin templates are read-only. Copying them directly also made the generated node configuration read-only, so Windows could reject the next overwrite. The plugin now creates writable copies of its generated public configuration and repairs copies left read-only by earlier versions. The installed plugin files stay read-only.

Update Koinos Node in Plugins, then start the node again. A completed migration does not need to be repeated. This update preserves migrated chain data, the plugin wallet, producer keys, funding records and migration journals. Existing configuration backups remain available.

Regression coverage exercises read-only installed templates, repeated configuration generation used by Start, recovery of existing read-only copies, and preservation of chain and wallet files. Windows CI exercises the native read-only overwrite failure. Tests use temporary files and simulated Docker responses; they do not operate a live user node or move funds.
