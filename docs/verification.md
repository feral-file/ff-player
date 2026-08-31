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
- `npm run test` first runs the user-facing copy check (`scripts/check-copy.mjs`, banned-term rules from Canon `reference/voice/product-copy.md` — approved terms are also listed in the script header), then the Vitest unit test suite.
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

## Manual visual smoke: setup and pairing overlays

Copy or layout changes to `SetupOverlay` / `MintPairingOverlay` cannot be
verified by jsdom tests — computed sizes, font selection (real bold vs
synthesized), and wall legibility need eyes on rendered output. The
procedure, runnable entirely in a browser:

1. `npm run dev`, open http://localhost:3000, open the devtools console.
2. Define the drivers (the overlays listen for these window events; state
   and field names are the `setupDisplay` / `mintPairingDisplay` CDP
   contracts in `src/models/custom_event.ts`):

   ```js
   const setup = (state, extra={}) => window.dispatchEvent(
     new CustomEvent('setupDisplay', {detail:{state, ...extra}}));
   const mint = (state, extra={}) => window.dispatchEvent(
     new CustomEvent('mintPairingDisplay', {detail:{state, ...extra}}));
   ```

3. Walk the setup flow in order, reading it as a sequence (after a failed
   join the device re-raises the AP, so `softap_qr` follows `join_failed`):

   ```js
   setup('scanning');
   setup('softap_qr', {ssid:'FF1-DEMO4242', password:'48151623', portal_url:'http://10.42.0.1'});
   setup('softap_qr', {ssid:'FF1-DEMO4242'});               // open network
   setup('joining');
   setup('join_failed', {reason:'Wrong Wi-Fi password. Please check it and try again.'});
   // Provisioned-device boot/offline narration (not part of the OOBE story):
   // neutral title, prose body from controld.
   setup('connecting', {reason:'Looking for your Wi-Fi network… Setup mode will start in a few minutes if the connection does not return.'});
   setup('connecting');                                     // bare variant: title only
   // Persistent provisioning failure (controld's escalation latches):
   setup('setup_error', {reason:'The Art Computer could not start setup mode. It will keep trying automatically. If this persists, disconnect power for ten seconds and restart. (FF1-DEMO4242)'});
   // ^ keep the identity suffix: controld's withIdentity appends " (FF1-XXXX)"
   //   on-wire, so this is the longest string the wrapping check must survive.
   setup('setup_error', {reason:'The Art Computer could not release its setup hotspot. It will keep trying automatically. If this persists, disconnect power for ten seconds and restart.'});
   setup('setup_error');                                    // bare variant: title + fallback line
   setup('finalizing');
   setup('updating', {progress:42});
   setup('claim_qr', {url:'https://link.feralfile.com/device_connect/demo', device_name:'FF1-DEMO4242'});
   setup('claim_qr', {url:'https://link.feralfile.com/device_connect/demo'}); // nameless variant
   setup('factory_reset');
   setup('hidden');
   mint('pairing_code', {pairingCode:'8FK2ZQ'});
   mint('request_received', {browserName:'Chrome'});
   mint('request_received', {});                            // fallback label
   mint('creating_token', {browserName:'Chrome'});
   mint('hidden');
   ```

4. Check each panel at three viewports (devtools responsive mode):
   - **3840x2160** — the shipping 4K mode. Text must respect the px caps
     (setup and pairing titles render the same size; see the cap rationale
     in `SetupOverlay.module.scss`).
   - **1920x1080** — the vmin terms govern; this is the design-reference
     rendering.
   - **2160x3840** — portrait. Sizes key off the short edge; nothing may
     track viewport height.
5. Look specifically at `<strong>` runs (the direct portal address, the frame
   name): they must render the real PPMori-Bold face, not a synthesized
   smear — compare stroke weight against the pairing-code digits.
6. On `softap_qr`, confirm the QR-first Join/Connect instruction, no-internet
   warning, manual setup-network path, and mobile-data/VPN direct-IP fallback
   all remain legible without crowding the QR.

Report the pass (viewports checked, anything off) in the PR body; review
agents treat its absence as a missing-verification finding.

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
