# Pitfalls Research: RT Jukebox

## Known Risk Areas

- Schema drift between `schema.sql` and runtime route queries can break live auth or jukebox paths even when unit tests pass.
- Production CORS defaults can create security exposure if environment variables are missing.
- React Native dependencies may pass JavaScript tests but still fail native Android assembly without JDK/SDK/NDK alignment.
- External Spotify failure cases are intentionally noisy in tests; use exit codes and final summaries rather than raw stderr alone.

## Mitigations Applied

- Migration tests now assert runtime user metadata columns.
- CORS resolution is centralized and tested.
- Android SDK and JDK setup was validated by building both APK variants.
- Verification report captures command evidence and runtime endpoint checks.
