# Review Workflow

This repository reviews AI-assisted changes against the full diff, not only the latest commit.

## Review handoff must include

- The problem being solved and why the change is scoped the way it is.
- The main files or surfaces changed.
- Verification evidence from `npm run verify`.
- Manual smoke evidence when user-visible playback behavior changed.
- Any open question, follow-up issue, or intentional non-goal.

## Review expectations

- Review the entire PR diff, including docs, workflow files, and config changes.
- Check that behavior-sensitive surfaces keep their contracts: cast handling, DP1 loading, persisted device state, and playback recovery.
- Treat missing docs or stale guidance as review feedback when the change alters repo behavior or workflow.

## Accept / revise loop

- If feedback is valid, fix it in code or docs instead of arguing around it.
- After valid fixes, re-run `npm run verify`.
- Update the review handoff if the scope, risks, or follow-up items changed while addressing feedback.

## Definition of done

A change is done only when all of the following are true:

- The implementation matches the intended behavior and does not leave known broken states in the touched flow.
- Relevant docs and repo guidance are updated in the same change.
- `npm run verify` passes.
- Required manual smoke coverage is recorded for playback-facing changes.
- The PR description is filled out using `.github/pull_request_template.md`.
