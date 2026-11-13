"use strict";
const fs = require("node:fs"), path = require("node:path");
const {DEFAULT_DISTRO,validDistro}=require("./wsl");
const DEFAULTS = Object.freeze({network:"mainnet",runtime:"native",wslDistro:DEFAULT_DISTRO,rpcPort:18085,p2pPort:18890,grpc:false,grpcPort:18086,logLevel:"info",history:true,autoStart:false});
function settings(input, platform = process.platform) {
  const value = {...DEFAULTS, runtime:platform === "linux" ? "native" : platform === "win32" ? "wsl" : "docker", ...input};
  if (Object.keys(value).some(k => !Object.hasOwn(DEFAULTS,k)) || !["mainnet","harbinger"].includes(value.network) || !["native","wsl","docker"].includes(value.runtime) || !["info","debug","warn","error"].includes(value.logLevel) || !validDistro(value.wslDistro)) throw Error("Invalid Teleno settings.");
  const ports=[value.rpcPort,value.p2pPort,...(value.grpc?[value.grpcPort]:[])];
  if (![...ports,value.grpcPort].every(p => Number.isInteger(p) && p >= 1024 && p <= 65535) || new Set(ports).size!==ports.length) throw Error("Use different RPC, gRPC and P2P ports between 1024 and 65535.");
  if ([value.history,value.autoStart,value.grpc].some(v=>typeof v!=="boolean")) throw Error("Invalid Teleno option.");
  if (value.runtime === "wsl" && platform !== "win32") throw Error("WSL2 runtime is for Windows. Select native on Linux.");
  if (value.runtime === "native" && platform !== "linux") throw Error("The native executable requires Linux x64. Select WSL2 on Windows; Intel macOS can use the optional Docker runtime.");
  return value;
}
function generate(options, basedir, producer = null) {
  const template = fs.readFileSync(path.join(__dirname,"assets",options.network === "mainnet" ? "mainnet-observer.yml" : "testnet-observer.yml"),"utf8");
  const root = options.runtime === "docker" ? "/data" : basedir;
  const quoted = name => JSON.stringify(path.posix.join(root.replace(/\\/g,"/"),name));
  let text = template.replace(/log-level: info/,"log-level: " + options.logLevel)
    .replace(/listen: \/ip4\/0\.0\.0\.0\/tcp\/\d+/,"listen: /ip4/0.0.0.0/tcp/" + options.p2pPort)
    .replace(/listen: 127\.0\.0\.1:\d+/,"listen: " + (options.runtime === "docker" ? "0.0.0.0:" : "127.0.0.1:") + options.rpcPort)
    .replace(/backup:\n  enabled: false/,`backup:\n  enabled: true\n  node-id: kai-teleno-${options.network}\n  workspace: ${quoted(".teleno-native-backups/workspace")}\n  local:\n    enabled: true\n    directory: ${quoted(".teleno-native-backups/repository")}\n    retention-count: 7`)
    .replace(/  contract_meta_store: (?:true|false)/,"  contract_meta_store: true")
    .replace(/  transaction_store: false/,"  transaction_store: " + options.history)
    .replace(/  account_history: false/,"  account_history: " + options.history);
  // gRPC creates IPv4-mapped IPv6 sockets even for 127.0.0.1. WSL's host
  // forwarder misses these. Its supervisor bridges IPv4 loopback to ::1.
  if(options.grpc)text=text.replace(/  grpc: false/,"  grpc: true")+`\ngrpc:\n  listen: ${JSON.stringify((options.runtime==="wsl"?"[::1]":options.runtime==="docker"?"0.0.0.0":"127.0.0.1")+":"+options.grpcPort)}\n`;
  // Only the explicit producer-start path supplies this argument. All ordinary
  // starts, backup commands and restores regenerate an observer configuration.
  if (producer) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(producer)) throw Error("Invalid producer address.");
    text = text.replace(/  block_producer: false/,"  block_producer: true");
    text += `\nblock_producer:\n  algorithm: pob\n  producer: ${producer}\n  private-key-file: ${quoted("block_producer/private.key")}\n  resources-lower-bound: 75\n  resources-upper-bound: 90\n  max-inclusion-attempts: 2000\n  gossip-production: true\n`;
  }
  return text;
}
module.exports = {DEFAULTS,settings,generate};
