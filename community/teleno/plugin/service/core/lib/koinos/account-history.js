"use strict";

const uint = value => typeof value === "string" && /^(0|[1-9][0-9]{0,19})$/.test(value) && BigInt(value) < (1n << 64n);

function historyPage(result, { limit, ascending, seq_num }) {
  if (!result || typeof result !== "object" || result.error || result.rpc_error ||
      (result.values !== undefined && !Array.isArray(result.values)) || JSON.stringify(result).length > 4 * 1024 * 1024) {
    throw Error("Account history is unavailable.");
  }
  const entries = result.values || [];
  if (entries.length > limit) throw Error("Account history page is too large.");
  let previous = null;
  return entries.map(entry => {
    // Protobuf JSON omits a uint64 field when its value is zero. Only absence
    // means zero; null, numbers and other malformed explicit values still fail.
    const seq = entry?.seq_num === undefined ? "0" : entry.seq_num;
    if (!entry || typeof entry !== "object" || !uint(seq) ||
        (seq_num !== undefined && (ascending ? BigInt(seq) < BigInt(seq_num) : BigInt(seq) > BigInt(seq_num))) ||
        (previous !== null && (ascending ? BigInt(seq) <= previous : BigInt(seq) >= previous))) {
      throw Error("Invalid account history sequence.");
    }
    previous = BigInt(seq);
    return { ...entry, seq_num: seq };
  });
}

// Chain state and account-history indexes can have different coverage on the
// same RPC. An empty successful response must not hide a fuller index elsewhere.
// Choose one chain-verified source per refresh and keep every page on it; never
// merge sequence numbers or confirmation evidence from different RPC indexes.
async function openAccountHistory({ chain, account, limit, irreversible, verify, check = () => {} }) {
  check();
  const params = { address: account, limit, ascending: false, irreversible };
  const results = await Promise.allSettled(chain.rpcUrls().map(async url => {
    const provider = chain.provider([url]);
    const chainId = await verify(provider); check();
    const latest = historyPage(await provider.call("account_history.get_account_history", params), params); check();
    return { provider, chainId, latest };
  }));
  check();
  let selected = null, tip = -2n, error = Error("Account history is unavailable.");
  for (const result of results) {
    if (result.status === "rejected") { error = result.reason; continue; }
    const candidate = result.value, sequence = candidate.latest.length ? BigInt(candidate.latest[0].seq_num) : -1n;
    if (sequence > tip) { selected = candidate; tip = sequence; }
  }
  if (!selected) throw error;
  return selected;
}

module.exports = { historyPage, openAccountHistory };
