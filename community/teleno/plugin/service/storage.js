"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
function safe(target, file = false, max = 128 * 1024 * 1024) {
  const absolute = path.resolve(target), root = path.parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let st; try { st = fs.lstatSync(current); } catch (e) { if (e.code === "ENOENT") continue; throw e; }
    if (st.isSymbolicLink() || (file && current === absolute ? !st.isFile() || st.nlink !== 1 || st.size > max : !st.isDirectory())) throw Error("Teleno storage is unsafe; existing data was preserved.");
  }
  return absolute;
}
function write(file, data, { exclusive = false } = {}) {
  safe(file, true); fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
  if (exclusive) return fs.writeFileSync(file, data, { flag: "wx", mode: 0o600 });
  const temp = file + "." + crypto.randomUUID() + ".tmp";
  try { fs.writeFileSync(temp, data, {flag:"wx",mode:0o600}); const fd=fs.openSync(temp,"r+");try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);} safe(file,true);fs.renameSync(temp,file); }
  finally { fs.rmSync(temp,{force:true}); }
}
function redact(value) {
  return String(value ?? "").replace(/\x1b\[[0-9;]*m/g,"").replace(/\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/g,"[private key redacted]")
    .replace(/((?:password|secret|private[_ -]?key|authorization)\s*[=:]\s*)([^\s,;]+)/gi,"$1[redacted]");
}
module.exports = { safe, write, redact };
