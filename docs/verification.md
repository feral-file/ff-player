# Verification

`npm run post-implement-check` is the required changed-files lint pass after implementation, and `npm run verify` is the canonical changed-file-lint plus build verification command before handoff.

## Post-implement check

```bash
npm run post-implement-check
```

This script:

- diffs the current worktree against `origin/main`
- selects changed JavaScript and TypeScript files
- runs ESLint autofix only on those files
- reruns ESLint on those same files and fails if any lint issues remain
- enforces the stricter changed-code rules, including `react-hooks/exhaustive-deps` and contextual JSDoc coverage where configured
- enforces file/function/parameter size limits on the changed code only

Use it immediately after implementation work so lint cleanup stays scoped to the files you touched.

## What it runs

```bash
npm run lint
npm run build
```

- `npm run lint` is the changed-files ESLint gate against `origin/main` by default.
- `npm run build` is the production Next.js build and includes type-checking.

## When to run it

- Run `npm run post-implement-check` immediately after implementation changes.
- Fix any remaining lint findings before moving to review.
- Untouched files outside the changed diff do not need to be cleaned up just to satisfy this lint pass.
- After the changed-file lint is clean, run a separate reviewer loop on the full diff.
- Run `npm run verify` before handing work off for review.
- Re-run `npm run verify` after addressing any valid review feedback.
- If the change touches playback, cast recovery, display settings, or route behavior, pair verification with a manual smoke pass for the affected flow.

## CI parity

CI uses the same verification surface in split form:

- `.github/workflows/lint-js.yaml` runs the lint step.
- `.github/workflows/build-website.yaml` runs the production build step for both configured environments.

That split is intentionally equivalent to `npm run verify`, while keeping lint review comments and environment-specific build coverage in GitHub Actions.

## Local notes

- Local builds are expected to work without production secrets for normal repo verification.
- If a change introduces new required environment variables or build-time contracts, document that in `README.md` and update the verification guidance in the same PR.
- There is no dedicated ESLint rule here for enum size or class length. File-size limits and reviewer judgment cover those until a narrower rule is worth the added noise.
