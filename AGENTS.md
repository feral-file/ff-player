# AGENTS.md

Repo contract for coding agents and automation working in `ff-player`.

## Repo scope

`ff-player` is the FF1 playback client. It boots the player UI, restores persisted device state, fetches DP1 playlists, applies cast commands, and renders mixed-media artwork playback routes.

## Read this first

- `README.md` for local setup and runtime context.
- `docs/verification.md` for the required local verification path.
- `docs/review-workflow.md` for review handoff, fix-and-rerun, and definition-of-done rules.
- `docs/ARTWORK_TRANSITION_SEQUENTIAL_LOGIC.md` before changing artwork transition timing or sequencing behavior.
- `.github/pull_request_template.md` before opening a PR.

## Major surfaces

- `src/context/AppContext.tsx`: boot flow, fallback playlist behavior, persisted recovery, and app-wide initialization.
- `src/services/CanvasService.ts`: cast-command handling, playback orchestration, scheduling hooks, and display-setting updates.
- `src/services/DP1Service.ts` and `src/services/DP1ScheduleService.ts`: DP1 playlist loading and scheduled playback support.
- `src/utils/DeviceManager.ts`: persisted device state, migration behavior, and storage compatibility.
- `src/components/artwork-player/ArtworkPlayer.tsx`: artwork rendering and runtime playback behavior.
- `src/services/custom-hooks/*`: synchronization hooks for cast info, display settings, device rotation, cursor state, and connectivity.

## Non-negotiable rules

- Preserve playback recovery behavior unless the task explicitly changes it.
- Treat cast payloads, DP1 data handling, and persisted storage keys as compatibility-sensitive surfaces.
- Keep changes in the owning layer instead of spreading logic across hooks, components, and services.
- Update the relevant doc in the same change when behavior, workflow, or verification expectations change.
- Use the repository issue template for issues and `.github/pull_request_template.md` for PRs.

## Required sequence

1. Read the relevant docs and owning files before editing.
2. If the task changes behavior, document the intended contract before or alongside code changes.
3. Make the smallest change that solves the task in the correct layer.
4. Run `npm run verify` before handoff.
5. If playback, cast recovery, or display settings changed, do a manual smoke pass for the affected route or flow and include that evidence in the handoff.

## Stop and ask the user when

- The change affects DP1/cast message shape, persisted storage format, or route-level runtime contracts.
- The work changes boot recovery, fallback playlist behavior, or device-default behavior.
- The task needs a new environment variable, deployment contract, or CI policy change beyond the immediate issue.
- The code suggests multiple valid architectural directions and there is no authoritative doc choosing one.

## Definition of done

- Code, docs, and workflow guidance stay consistent with the implemented behavior.
- `npm run verify` passes locally.
- Manual smoke coverage is noted for user-visible playback changes.
- The review handoff follows `docs/review-workflow.md`.

## Issues and PRs

- When creating a GitHub issue, use the repository issue templates in `.github/ISSUE_TEMPLATE/` and complete every requested section.
- When creating a PR, use `.github/pull_request_template.md` and keep the description aligned with the template fields.
- Do not replace the template structure with free-form prose; add extra context only after the required sections are filled in.
