# Linux ARM64 validation for Teleno plugin 1.2.0

The same `community.teleno-node` package selects separate checksum-pinned
engines for Linux x64 and Linux ARM64. Windows WSL2 and optional Docker remain
x64. ARM64 must use a native, 64-bit Linux installation and ARM64 KAI Core.

## Engine identity and compatibility

- Engine source: `koinos/teleno`, commit
  `2c11229267cff2f9ee39ed8e56ab70af391d85ce` (Teleno 1.3.0).
- Native build host: ARM64 GitHub runner, Debian 12 Bookworm container,
  GCC 12, generic ARMv8-A compiler flags, portable RocksDB.
- Qualification verified an AArch64 ELF64 with the Linux GLIBC interpreter,
  GLIBC requirements at most 2.36 and GLIBCXX requirements at most 3.4.30.
  The Android engine and x64 engine are not substitutes.
- The build retains a manifest of 485 source files, hashes of all 169 actual
  linked archives, the binary and archive hashes, and all native test results.
- Debian 12's GCC 12 requires explicit `template` disambiguators in the pinned
  cpp-libp2p injector headers. The build combines the upstream dependency patch
  with `scripts/patches/libp2p-gcc12-templates.patch`. That syntax-only patch
  applies to cpp-libp2p, not Teleno's application/chain source. Its checksum and
  source revision are retained in `arm64-compatibility.json` and the archive.
- Qualification also applies `teleno-gcc12-test-fixture.patch` to explicitly
  value-initialize a Fizzy import in one upstream test. Every assertion is
  retained. The test source is restored and the engine rebuilt from the clean
  checkout before CTest and provenance recording. The archive records both
  patches and their checksums. This test-only fix changes no runtime code.
- The tested archive and binary hashes are included in
  `plugin/service/runtime.json`, together with an immutable download URL.
  Publisher signing and a catalog release remain separate from this source PR.

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

Native ARM64 qualification passed all **107 CTest tests** and all **4 Python
benchmark-script tests**. The source checkout was clean before recording the
final executable. Plugin integration on Debian 12 ARM64 passed all **81 plugin
tests**, source-package verification, archive installation, JSON-RPC and gRPC,
both offline chain identities, clean stop/reopen, backup configuration/listing,
and the expected genesis-only backup refusal.

The tested engine and its evidence are retained at immutable runtime commit
`b97cecf9417a64dbe8808905f1c4ab59d0b5ac07`. The evidence includes the clean source
manifest, actual link-archive hashes, compatibility patches, all 107 individual
CTest pass records and the plugin smoke results. The initial JUnit path was
relative to CTest's build directory; the authenticated native job log retains
the exact successful test output, and subsequent builds use an absolute JUnit
path. Integration requires every test ID from 1 through 107, the zero-failure
summary and a successful native test step.

- [Native ARM64 build and upstream tests](https://github.com/therexdev/kai-plugin-koinos-node/actions/runs/44992430549)
- [ARM64 plugin integration](https://github.com/therexdev/kai-plugin-koinos-node/actions/runs/44994808735)
- [Immutable runtime and test evidence](https://github.com/therexdev/kai-plugin-koinos-node/tree/b97cecf9417a64dbe8808905f1c4ab59d0b5ac07/runtimes/linux-arm64-1.3.0)
- [Plugin update under review](https://github.com/therexdev/kai-plugin-koinos-node/pull/6)

Continuous integration includes Linux x64, Linux ARM64, Windows and Intel
macOS. Both Linux runners download the exact pinned archive and run the actual
native installation/lifecycle checks. WSL transport simulation runs on x64;
the separate Windows job tests actual WSL2.

## Device tests still required

No physical Raspberry Pi is attached to the test environment. ARM64 runner
checks do not establish Pi 4 performance, thermal behavior, sustained mainnet
sync, full snapshot download/restore on the operator's drive, reboot recovery
or funded block production. Existing resource checks and explicit production
reviews remain active. No live wallet, burn, registration or production action
is part of this qualification.
