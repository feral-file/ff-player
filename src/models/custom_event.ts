export enum WatchdogEvent {
  CriticalCPUTemperature = 'CriticalCPUTemperature',
  ServiceFailed = 'ServiceFailed',
}

export enum CustomEventName {
  ConnectivityChange = 'connectivityChange',
  // CanvasService → AppContext: a displayDefaultPlaylist command asked for the
  // default playlist; AppContext re-arms its boot fallback loop so the command
  // and the player's own pull resolve the playlist through one code path.
  DisplayDefaultPlaylist = 'displayDefaultPlaylist',
  // CanvasService → AppContext: an explicit (non-fallback) playlist display
  // committed. AppContext cancels any active boot-fallback retry so a pending
  // default-playlist attempt can never overwrite content the controller just
  // cast. Deliberately emitted by every nowDisplayPlaylist commit — including
  // scheduled DP1 playlists firing and displayAtBoot — because any real
  // content on screen ends the fallback's "guarantee something is playing"
  // job. The fallback's own cast intentionally does NOT dispatch this — its
  // settling is handled by the loop's nonce-guarded clear.
  ExplicitPlaylistCast = 'explicitPlaylistCast',
  // CanvasService/ErrorNavigation → AppContext: something deliberately took
  // the wall off playback (disconnect, setSleepMode(true), navigation to the
  // error page). AppContext stands the fallback machinery down exactly as
  // for ExplicitPlaylistCast — aborts an in-flight attempt, cancels an
  // active retry, and clears the config-change supersede marker — so no
  // fallback path can later cast the default playlist and relight (or wake)
  // a wall that was just stopped. CanvasService also listens: a halt that
  // lands while boot hydration is still pending latches
  // wasHaltedDuringBootHydration so the boot restore decision sees it. A
  // LATER explicit cast or displayDefaultPlaylist push still wins: these
  // are synchronous window events and last command wins, so the halt is a
  // stand-down, not a latch on future commands.
  // Carries PlaybackHaltedDetail: only a CAST-CLEARING halt (disconnect) may
  // make boot skip the persisted-playlist restore entirely — a preserving
  // halt (sleep, error navigation) suppresses navigation and fallback arming
  // but still restores, or a mid-hydration sleep would silently trade the
  // user's persisted playlist for the default at wake.
  PlaybackHalted = 'playbackHalted',
  MintPairingDisplay = 'mintPairingDisplay',
  Navigate = 'navigate',
  SetupDisplay = 'setupDisplay',
  WatchdogEvent = 'watchdogEvent',
}

export interface PlaybackHaltedDetail {
  // True when the halt cleared cast state (disconnect). Boot hydration must
  // then not restore the stale persisted playlist — it is exactly the state
  // the controller just cleared. Absent/false for state-preserving halts
  // (sleep, error navigation), where boot still restores the playlist so a
  // later wake finds it, and suppresses only navigation and fallback arming.
  clearedCast?: boolean;
}

export interface ConnectivityEventDetail {
  isOnline: boolean;
}

export interface WatchdogEventDetail {
  event: WatchdogEvent;
}

export interface NavigateEventDetail {
  path: string;
}

export enum MintPairingDisplayState {
  Hidden = 'hidden',
  PairingCode = 'pairing_code',
  RequestReceived = 'request_received',
  CreatingToken = 'creating_token',
}

export interface MintPairingDisplayDetail {
  state: MintPairingDisplayState;
  pairingCode?: string;
  browserName?: string;
}

/**
 * Known `setupDisplay` states as of this player build. `SetupOverlay` renders
 * nothing for any state string outside this set instead of erroring, so
 * `feral-controld` can ship new setup states (e.g. a future LAN
 * pairing-approval overlay) without breaking players that predate them.
 */
export enum SetupDisplayState {
  Hidden = 'hidden',
  Ready = 'ready',
  Scanning = 'scanning',
  SoftApQr = 'softap_qr',
  Joining = 'joining',
  JoinFailed = 'join_failed',
  // Provisioned-device connectivity narration (controld's boot/offline
  // "hedge"): the device has saved Wi-Fi but its link or internet access is
  // not confirmed yet, so the copy must stay neutral. Distinct from
  // JoinFailed, whose title asserts a failed join — controld used to borrow
  // that screen for this prose, which made every normal reboot flash
  // "Couldn't connect to Wi-Fi" for the ~1s between CDP connect and the
  // first online confirmation.
  Connecting = 'connecting',
  // Persistent provisioning failure the daemon cannot fix on its own
  // (controld's escalation latches: the setup hotspot repeatedly failing to
  // start, or refusing to release the radio). `reason` carries the full
  // user-facing prose — what happened, that retries continue automatically,
  // and the power-cycle fallback — matching the connecting convention.
  // Distinct from JoinFailed, which narrates one failed join attempt in a
  // working setup flow; these errors fire while no join is in progress.
  SetupError = 'setup_error',
  Updating = 'updating',
  Finalizing = 'finalizing',
  ClaimQr = 'claim_qr',
  FactoryReset = 'factory_reset',
}

/**
 * True when this player build will actually paint a panel for a setupDisplay
 * `state`. Owns the overlay-arbitration decision: MintPairingOverlay yields
 * only to setup states that put real pixels on screen. Hidden/Ready render
 * nothing by contract, and unknown future states render nothing by the
 * extensibility invariant (see SetupOverlay's renderSetupPanel) — blanking
 * the pairing code for an invisible panel would hide the accepted
 * mintPairingDisplay command entirely. Keep in sync with renderSetupPanel;
 * the SetupOverlay tests assert the two agree for every known state.
 */
export function isRenderableSetupDisplayState(state: string): boolean {
  return (
    Object.values(SetupDisplayState).includes(state as SetupDisplayState) &&
    state !== (SetupDisplayState.Hidden as string) &&
    state !== (SetupDisplayState.Ready as string)
  );
}

export interface SetupDisplayDetail {
  // Intentionally `string`, not `SetupDisplayState`, so the CDP handler can
  // accept and forward states this player build does not yet recognize.
  state: string;
  ssid?: string;
  password?: string;
  // softap_qr only: direct HTTP address on the active setup hotspot's own
  // subnet. Optional for compatibility with older controllers.
  portal_url?: string;
  reason?: string;
  progress?: number;
  url?: string;
  // claim_qr only: the device's mDNS-advertised name (e.g. "FF1-8EVTK3RE"),
  // woven into the "the app finds this frame automatically" guidance.
  // snake_case matches the setupDisplay wire contract field.
  device_name?: string;
}
