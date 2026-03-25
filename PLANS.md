# PLANS.md

Use this file when a request is large, vague, architectural, or risky enough that implementation should not start immediately.

## When to activate

- Major feature work across playback, scheduling, casting, or persistence flows
- Cross-cutting changes that touch routes, components, services, and persistence together
- Refactors that can break FF1 / DP1 behavior or device recovery paths
- Requests where architecture or API direction is still ambiguous

## Required output

1. Current context summary
2. Constraints and invariants
3. Open questions or missing product context
4. Design branches with trade-offs
5. Verification plan for each branch
6. Recommended staged delivery plan

## Planning posture

- Prefer simplification, deletion, or consolidation before adding more layers.
- Call out unknowns clearly instead of inventing certainty.
- Keep plans grounded in the current repository structure.
- Respect that architecture and API design are currently `TBD by repo owner`.
- When local docs are missing, summarize current behavior from `README.md` and the touched code before proposing changes.
