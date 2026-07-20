import * as Sentry from '@sentry/nextjs';

/**
 * Log and report an error raised while resolving a playlist item's display
 * preference. Extracted from PlaylistClient to keep that playback surface
 * under its line budget (see ArtworkPlayer's note on preferring utils).
 */
export function reportPlaylistDisplayPreferenceError(
  phase: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const message = `[PlaylistClient] Error handling item display preference (${phase})`;
  console.error(
    message,
    error instanceof Error ? error.message : String(error)
  );
  if (error instanceof Error) {
    Sentry.captureException(error, {
      extra: { phase, ...extra },
    });
  } else {
    Sentry.captureMessage(message, {
      extra: {
        error: String(error),
        phase,
        ...extra,
      },
    });
  }
}
