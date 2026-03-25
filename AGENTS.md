# AGENTS.md -- FF Player Contract

This file defines repository-level constraints for coding agents and human collaborators. Detailed implementation behavior lives in `.cursor/rules/`.

## Repository overview
- Project: FF Player, the playback and casting client for FF1 devices.
- Runtime surface: Next.js app router frontend with device-facing playback, scheduling, remote-config, and casting flows.
- Primary code areas: `src/app/`, `src/components/`, `src/context/`, `src/services/`, `src/utils/`, `src/models/`.

## Architecture and API design status
- Architecture rule details: `TBD by repo owner`.
- API design rule details: `TBD by repo owner`.
- Until those sections are filled in, preserve existing module seams, route contracts, service boundaries, and data shapes unless the task explicitly calls for changing them.

## Non-negotiables
- Prefer replacing or deleting flawed code paths over narrow local tweaks when a clearer design is available.
- Do not preserve legacy behavior, compatibility shims, migrations, or transitional branches unless explicitly requested.
- Keep route rendering, UI orchestration, playback/device services, persistence helpers, and remote adapters separated where practical.
- Prefer stateless, testable functions/services by default; introduce mutable shared state only when lifecycle or playback coordination truly requires it.
- Follow the spirit of standard Go guidance by default, adapted to TypeScript: small focused units, clear naming, explicit control flow, simple error handling, and responsibility-aligned module boundaries.
- Prefer richer code comments for non-obvious logic when they will help future agentic coding sessions amend the code safely.
- Those comments should preserve intent, design context, trade-offs, constraints, invariants, failure modes, and reasons a simpler-looking alternative was not chosen.
- Treat comments as durable engineering context for future amendments, not as line-by-line narration of syntax.

## Spec-driven workflow (required for substantial changes)
Before implementing any major feature, flow change, architectural refactor, or contract change:
1. Read the relevant docs in `docs/` if they exist, then read `README.md` and the affected code paths.
2. Summarize the current behavior, constraints, and invariants.
3. Write or update a short spec/design note when the change is substantial.
4. Break the work into concrete tasks and define how it will be verified.
5. Only then begin implementation.

Canonical large-change sequence:
`spec -> design -> tasks -> tests -> implementation -> verification -> review`

If no relevant spec exists for a substantial change, do not jump straight to implementation.

## ExecPlans

When writing a big feature, major flow change, significant refactor, or handling a vague command with unclear requirements, use an execution plan as described in `PLANS.md`.

Use `PLANS.md` only when the work is large enough or vague enough that it needs research, branching design exploration, and staged delivery. Do not use `PLANS.md` for small direct code changes, narrow fixes, isolated workflow updates, or when the user already provided a detailed plan with concrete steps and TODOs.

## Required development sequence (behavior changes)
1. Write or update small, testable units first.
2. Add or update tests when a harness exists for the changed behavior.
3. Add integration coverage for cross-boundary behavior where practical.
4. Implement until verification passes.
5. Run verification:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
6. If the current repo lacks a practical automated test harness for the touched path, record that gap clearly instead of pretending it is covered.

## Rule references (authoritative detail)
- `.cursor/rules/01-master-design.mdc`
- `.cursor/rules/10-typescript-coding-style.mdc`
- `.cursor/rules/20-domain-vocabulary.mdc`
- `.cursor/rules/35-testing-tdd.mdc`
- `.cursor/rules/review-workflow.mdc`

## Definition of done
A task is complete only when:
1. The requested behavior is implemented.
2. Relevant verification passes cleanly, or any blocked checks are called out explicitly.
3. Documentation is updated when behavior, workflows, or repo constraints changed.
4. Review has qualified the change.
5. The change is ready to merge without relying on unstated follow-up work.

## Review workflow (implement -> review loop -> commit/push/PR)

After implementation, run a review loop until the reviewer qualifies the change. Only after the reviewer says **Verdict: accept** should you commit, push, or create a PR.

1. Create a compact handoff: goal, scope, files changed, key decisions, tests added or updated, checks run, and known limitations.
2. Invoke the reviewer sub-agent with fresh context. Give it the handoff, the diff, and any lint/typecheck/build or focused test output. The reviewer follows `prompts/code-review.md` and ends with **Verdict: accept** or **Verdict: revise**.
3. If Verdict: revise, address the findings, re-run verification, update the handoff, and invoke the reviewer again.

Do not commit, push, or create a PR before the reviewer has accepted.

## Commit message format
Use Conventional Commits:
- `<type>(<optional-scope>): <description>`
- Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `build`, `ci`, `perf`, `style`
- Use `!` for breaking changes.

## Review guidelines

The single source of truth for review priority, posture, test/docs sufficiency, and output format is `prompts/code-review.md`.
