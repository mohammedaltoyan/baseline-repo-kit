# Lint Exceptions (Policy)

Lint rules should be treated as guardrails. Exceptions are allowed only when:

- The finding is a false positive (document why).
- The code is externally owned (you cannot change it), and the finding does not represent real risk in your environment.

When adding an exception:

1. Prefer fixing the root cause instead of suppressing.
2. Scope the suppression as narrowly as possible (single file/line/rule).
3. Require a justification and a follow-up task if the exception is temporary.

