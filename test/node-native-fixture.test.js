"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const { dockerResponse } = require("./node-native-fixture");
test("native smoke permits only its synthetic inventory and exact retirement commands", () => {
  const id = "a".repeat(64), state = { rows: [{ id, running: true }] };
  assert.equal(dockerResponse(state, ["compose", "up", "-d"]), null);
  assert.equal(dockerResponse(state, ["stop", "--time", "120", "b".repeat(64)]), null);
  assert.equal(state.rows[0].running, true);
  assert.equal(dockerResponse(state, ["rm", id]), null);
  assert.equal(dockerResponse(state, ["ps", "--all", "--format", "{{.ID}}"]), id.slice(0, 12));
  assert.equal(dockerResponse(state, ["inspect", "--format", "fixture", id.slice(0, 12)]), JSON.stringify(state.rows[0]));
  assert.equal(dockerResponse(state, ["update", "--restart=no", id]), "");
  assert.equal(dockerResponse(state, ["stop", "--time", "120", id]), "");
  assert.equal(state.rows[0].running, false);
  assert.equal(dockerResponse(state, ["rm", id]), ""); assert.deepEqual(state.rows, []);
});
