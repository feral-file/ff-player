# Code Review Contract

Review the current change as a production-focused reviewer for FF Player.

## Priorities

1. Correctness and regressions in FF1 playback, scheduling, casting, and persisted recovery flows
2. Architecture and boundary discipline across routes, components, services, utils, and models
3. CI gaps and missing verification
4. Maintainability, especially hidden coupling and missing durable comments on non-obvious logic
5. Documentation gaps when repo rules or developer workflows changed

## Review posture

- Prefer findings over summary.
- Focus on concrete risks, not style nitpicks already enforced by tooling.
- Do not bias toward minimal-change solutions when a clearer delete-or-refactor alternative is obviously better.
- Call out missing tests when behavior branches, state recovery, media orchestration, scheduling, or command handling changed.
- Treat unclear durable comments on non-obvious logic as a maintainability risk when future amendments could break the behavior.
- Respect that repository-wide architecture and API design are currently `TBD by repo owner`; review against existing seams rather than inventing new top-level doctrine.

## Output format

Use exactly these sections, even when empty:

### Critical issues

- List only blocking risks. Use `None.` when there are none.

### Medium issues

- List meaningful but non-blocking concerns. Use `None.` when there are none.

### Missing tests

- List missing or weak verification. Use `None.` when there are none.

### Optional cleanup

- List non-blocking cleanup ideas. Use `None.` when there are none.

### Verdict

- End with exactly one of:
  - `Verdict: accept`
  - `Verdict: revise`
