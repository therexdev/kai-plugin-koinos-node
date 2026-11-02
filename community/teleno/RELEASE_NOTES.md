# Teleno Koinos Node 1.0.0 — Community

## 1.0.1 — shared interface language (unreleased)

Follows the language saved in Core Settings, including changes to open views. Supports English, Spanish, Brazilian Portuguese, French and German with offline catalogs. Core owns the first-run choice; plugin content and identifiers stay literal. Requires Core 0.7.17 or newer. Publish a newly signed package and matching catalog minimum only after the Core release; existing release assets remain unchanged.

Adds the independent `community.teleno-node` plugin: Teleno 1.3.0 with pinned artifacts; its own encrypted wallet and producer key; seven pages for overview, wallet, production, backup/recovery, logs, settings, and differences. Separate ports and databases allow coexistence with the regular node.

Linux x64 native runtime or x64 Linux container with Docker. No upstream ARM/Pi artifact. Native Linux offline startup/reopen and backup preflight/listing checks and plugin tests are included. Live funded mainnet production and Windows/macOS Docker require operator validation. No Core update is required.
