"use strict";
// Keep the same desktop language preference when Node moves to its own origin.
window.kaiLanguageBridge = Object.freeze({
  get: () => window.kai.call("node.language", {}),
  onChanged: callback => window.kai.onEvent?.("shell:language-changed", callback) || (() => {}),
});
