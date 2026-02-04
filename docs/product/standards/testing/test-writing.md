## Test writing best practices

- **Test new behavior**: add or update tests for every new feature, bug fix, or behavior change.
- **Prefer fast, deterministic tests**: keep unit tests quick so they run frequently; avoid flaky timing-based assertions.
- **Cover the important cases**: include the happy path, key edge cases, and failure modes that matter to users or security.
- **Test behavior, not implementation**: assert public outputs and side effects rather than internal structure.
- **Use clear names**: test names should describe the scenario and expected outcome.
- **Mock responsibly**: mock external dependencies for unit tests; use integration tests to validate real boundaries (DB, network, queues) when applicable.

