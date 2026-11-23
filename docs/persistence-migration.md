# Legacy migration profile

Run `PROFILE_MIGRATION=1 npm test -- tests/unit/largeMigration.test.ts --silent=false`.
The fixture adds 10,000 tasks and 10,000 audit entries to a representative v1
database with keyless stores. The timer covers opening and upgrading the
database, not seeding it or verifying the result.

| Local fake-indexeddb run | Upgrade time | Audit rows rewritten |
| --- | ---: | ---: |
| Before P2 | 1,131 ms | 10,002 |
| After P2 | 275 ms | 1 |

The timings are samples from a local simulation, not device benchmarks. The
test asserts the write count and checks every store in the safety export and
the upgraded database; it does not assert elapsed time. The migration no longer
deep-clones the whole snapshot into working data. It creates new objects only
for changed rows, and the original stays intact for recovery. IndexedDB still
serializes each retained safety snapshot as before.

Restore validates the parsed backup without deep-cloning it again. The actual
replacement still clears and fills the stores in one transaction to remove
records absent from the backup, including in legacy keyless stores. The
pre-import snapshot is written in that same transaction, so a failed restore
leaves both the original data and the previous recovery snapshot intact.
