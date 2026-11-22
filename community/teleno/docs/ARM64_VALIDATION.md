# Linux ARM64 validation for Teleno plugin 1.2.0

The same `community.teleno-node` package selects separate checksum-pinned
engines for Linux x64 and Linux ARM64. Windows WSL2 and optional Docker remain
x64. ARM64 must use a native, 64-bit Linux installation and ARM64 KAI Core.

## Engine identity and compatibility

- Engine source: `koinos/teleno`, commit
  `2c11229267cff2f9ee39ed8e56ab70af391d85ce` (Teleno 1.3.0).
- Native build host: ARM64 GitHub runner, Debian 12 Bookworm container,
  GCC 12, generic ARMv8-A compiler flags, portable RocksDB.
- Qualification must verify an AArch64 ELF64 with the Linux GLIBC interpreter,
  GLIBC requirements at most 2.36 and GLIBCXX requirements at most 3.4.30.
  The Android engine and x64 engine are not substitutes.
- The build must retain its source manifest, actual linked-library hashes,
  binary hash, archive hash and all upstream native test results.
- The publisher must review and include the tested archive and binary hashes
  in `plugin/service/runtime.json` before signing a release.

## Checks

The 81 plugin tests cover platform selection, refusal of 32-bit ARM and
unsupported runtime combinations, architecture-specific download and installed
binary checksums, cancellation, native loader failure, preserved installations,
wallet custody, transaction confirmation and existing WSL process recovery.
Locked dependency vendoring and source-package verification pass.

The actual pinned x64 executable passes archive installation, both offline
chain identities, JSON-RPC, HTTP/2 gRPC health, clean stop and database reopen,
backup configuration/listing, and the upstream genesis-only backup refusal.
The WSL transport test also checks orphan recovery, process ownership and
immediate cancellation. CI verifies Windows, Linux and Intel macOS; actual
Windows Server 2025 / Ubuntu 24.04 WSL2 tests pass.

ARM64 native compilation and the complete upstream native test suite are
required before the ARM64 integration job can run. That job repeats native
archive installation, RPC/gRPC, both network identities, restart and backup
checks on Debian 12 ARM64, then preserves the tested bytes in an isolated
runtime branch. These checks are pending until their workflows succeed:

- [Native ARM64 build and upstream tests](https://github.com/therexdev/kai-plugin-koinos-node/actions/runs/44975427828)
- [ARM64 plugin integration](https://github.com/therexdev/kai-plugin-koinos-node/actions/runs/44976665964)
- [Plugin update under review](https://github.com/therexdev/kai-plugin-koinos-node/pull/6)

## Device tests still required

No physical Raspberry Pi is attached to the test environment. ARM64 runner
checks do not establish Pi 4 performance, thermal behavior, sustained mainnet
sync, full snapshot download/restore on the operator's drive, reboot recovery
or funded block production. Existing resource checks and explicit production
reviews remain active. No live wallet, burn, registration or production action
is part of this qualification.
