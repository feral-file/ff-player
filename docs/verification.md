# Verification

`npm run post-implement-check` is the required changed-files lint pass after implementation, and `npm run verify` is the canonical non-mutating repo-wide verification command before handoff.

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
npm run typecheck
npm run test
npm run build
```

- `npm run lint` is the changed-files ESLint gate against `origin/main` by default.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run test` runs the Vitest unit test suite.
- `npm run build` is the production Next.js build.

By default, `npm run verify` lints changed files against `origin/main`. To verify against a different base, run either `VERIFY_BASE_REF=origin/develop npm run verify` or `npm run verify -- --base=origin/develop`.

## When to run it

- Run `npm run post-implement-check` immediately after implementation changes.
- Fix any remaining lint findings before moving to review.
- Untouched files outside the changed diff do not need to be cleaned up just to satisfy this lint pass.
- After the changed-file lint is clean, run a separate reviewer loop on the full diff.
- Run `npm run verify` before handing work off for review.
- Re-run `npm run verify` after addressing any valid review feedback.
- If the change touches playback, cast recovery, display settings, or route behavior, pair verification with a manual smoke pass for the affected flow.
- **Playlist route / repeat-off hold:** With loop `none`, advance to the last timed slot so playback holds on the final artwork; confirm a queued shuffle or refresh **promotes the new playlist on cast** only in that hold (not when the final item has no finite slot timer); leaving `none` via `setLoop` should resume the slot timer from the held frame. Expect the current artwork to stay selected after shuffle (anchor at index `0`) until its slot timer completes before advancing.

## CI parity

CI uses the same verification surface where practical:

- `.github/workflows/build-website.yaml` runs `npm run verify` for both configured environments.
- `.github/workflows/lint-js.yaml` separately runs the changed-file ESLint scope through reviewdog so lint findings can appear as advisory inline PR comments without failing that advisory job.
- `.github/workflows/typecheck.yaml` and `.github/workflows/unit-test.yaml` keep compact split checks for fast signal on TypeScript and test failures.

The required local handoff path is `npm run verify`; the Build workflow is the CI-aligned path that reuses it, while the split workflows preserve targeted GitHub Actions output and advisory lint comments.

## Local notes

- Vitest runs `src/**/*.test.ts` in the **node** environment and `src/**/*.test.tsx` in **jsdom** so lightweight React wiring tests can mount client components without changing the default environment for pure `.test.ts` suites.
- Local builds are expected to work without production secrets for normal repo verification.
- If a change introduces new required environment variables or build-time contracts, document that in `README.md` and update the verification guidance in the same PR.
- There is no dedicated ESLint rule here for enum size or class length. File-size limits and reviewer judgment cover those until a narrower rule is worth the added noise.
