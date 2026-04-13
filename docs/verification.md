# Verification

`npm run verify` is the canonical local verification command for this repository.

## What it runs

```bash
npm run lint
npm run build
```

- `npm run lint` is the repo-wide ESLint gate.
- `npm run build` is the production Next.js build and includes type-checking.

## When to run it

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
