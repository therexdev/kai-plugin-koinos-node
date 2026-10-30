# KAI Koinos Node

A signed, sandboxed plugin for **KAI Core 0.3.0 or later**. Inspect and manage a local Koinos node while retaining the data and settings already used by KAI.

## Install

In Core, open **Plugins**, find **Koinos Node**, and select **Install**. Review the requested permissions, then open the plugin. You can also install the signed `.kaiplugin` asset from this repository's Releases page.

Fully quit the older KAI app before starting Core. They share the Koinos AI profile; do not run both against the same data.

## Use

1. Select **Check node** and approve local Docker/prerequisite inspection. Opening the plugin alone does not run Docker or start a node.
2. If needed, use **Install guide** to open Docker's official instructions. Windows additionally offers **Enable WSL 2**, with native confirmation and the Windows administrator prompt. **Open Docker Desktop** starts an already installed copy, without downloading an installer.
3. Open **Node settings** and select the Mainnet or Harbinger test network. Core reuses the saved `koinos-node/settings.json` location and its existing per-network directories.
4. On **Dashboard**, choose **Start sync node**, or open **Node** and choose **Resume saved producer** if the old node configuration contains a producer address. The native review shows the network, folder and producer address. Managed configuration is backed up before it is regenerated; databases and producer keys are not relocated.
5. Inspect service status on **Dashboard**, or open **Node** for recent logs. Select **Stop node** to stop that network's KAI Docker project and preserve its data.

The window uses the original Koinos Node rail and light dashboard layout, with **Dashboard**, **Node**, and **Node settings** for the supported controls. Warnings have an X to dismiss them.

A node started from this plugin stops when the plugin closes or Core switches to Local-Only. Keep the plugin open while it runs. An already-running node is never silently adopted, restarted or stopped when the plugin opens or closes. Stop it explicitly before starting it under this plugin's ownership.

Docker actions can use substantial storage, CPU and network bandwidth. The plugin does not install Docker automatically, alter WSL memory settings, reboot Windows, or download a chain snapshot. Custom Compose/environment files are preserved and rejected for management until reviewed outside this plugin. You can continue managing those custom stacks using their original application.

## Permissions and data

| Permission | Purpose |
| --- | --- |
| `koinos-node.read` | Read this feature's selected network/folder, cached node status, and bounded redacted logs after inspection approval. |
| `koinos-node.manage` | Native-reviewed Docker inspection, node start/stop, network selection and prerequisite setup. |

This official plugin uses a publisher-pinned native service. Its renderer has no Node.js, direct filesystem/process access, account tokens, wallet keys, or arbitrary network access. It cannot request arbitrary Docker commands or filesystem paths. Installer, WSL, and node actions remain native-reviewed.

Existing settings retain unknown fields and unrelated reward/custody configuration. Corrupt settings, symlinked files, and files changed outside the current session fail closed. Configuration backups live under `koinos-node/core-config-backups`; settings changes retain timestamped private backup files. These backups never copy producer private-key files.

Financial operations, producer registration, key import/export, rewards automation, bridge/swaps, automatic recovery, quick sync and data-folder relocation are not exposed by this plugin. Resuming a saved producer configuration starts its existing local block producer; no financial transaction is signed by the plugin.

## Development and releases

```sh
npm test
node scripts/verify-package.js
```

Renderer files are ordinary HTML, CSS and JavaScript. The host API is `window.kai.call(method, input)`. The broker and its tests live in `therexdev/kai-core` at `electron/plugin-services/koinos-node.js` and `core/test-core/plugin-koinos-node.test.js`.

The release workflow verifies the package signature and exact source contents before publishing. A version is immutable: change the version and sign a new package for an update. Never put publisher private keys in this repository or GitHub Actions logs.
