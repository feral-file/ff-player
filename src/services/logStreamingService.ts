import { v4 as uuidv4 } from 'uuid';

const LOG_PROXY_ENDPOINT = 'http://127.0.0.1:1111/api/logs';
const PLAYER_ORIGIN = 'http://127.0.0.1:8080';
const IDLE_TIMEOUT_MS = 5_000;
const MAX_SESSION_MS = 60_000;
const RETRY_DELAY_MS = 5_000;
const UPLOAD_TIMEOUT_MS = 15_000;
const MAX_RECORDS_PER_REQUEST = 500;
const MAX_PENDING_REQUESTS = 32;
const MAX_MESSAGE_BYTES = 2_048;
const MAX_KEEPALIVE_BYTES = 60 * 1_024;

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
type ConsoleMethod = 'trace' | 'debug' | 'log' | 'info' | 'warn' | 'error';

interface PendingRecord {
  timestamp: string;
  level: LogLevel;
  environment: string;
  message: string;
  context: { session_id: string };
}

interface LogStreamingOptions {
  environment: string;
  sampleRate: number;
  fetcher?: typeof fetch;
  now?: () => number;
  random?: () => number;
}

const URL_PATTERN = /(?:https?|wss?):\/\/[^\s"'<>]+/gi;
const CREDENTIAL_START_PATTERN =
  /["']?\b(?:password|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|private[_-]?key|authorization|cookie|dsn)\b["']?\s*[:=]/i;
const BEARER_CREDENTIAL_PATTERN = /\bbearer\s+[a-z0-9._~+/-]+=*/i;
const PUBLIC_MESSAGE_PREFIXES = [
  '[API]',
  '[AppContext]',
  '[AppWrapper]',
  '[ArtworkPlayer]',
  '[CanvasService]',
  '[CAST]',
  '[CDP Handler]',
  '[CDP]',
  '[ContentType]',
  '[DeviceManager]',
  '[DP1ScheduleService]',
  '[DP1Service]',
  '[ErrorNavigation]',
  '[ErrorPage]',
  '[GlobalError]',
  '[IndexedDBStorage]',
  '[MediaLoader]',
  '[ModelViewer]',
  '[PlaylistClient]',
  '[useArtworkSettings]',
  '[useCastInfo]',
] as const;

/** Removes credentials and query data while retaining a useful URL origin/path. */
function sanitizeURL(raw: string): string {
  const trailing = /[.,);\]]+$/.exec(raw)?.[0] ?? '';
  const candidate = trailing ? raw.slice(0, -trailing.length) : raw;
  try {
    const parsed = new URL(candidate);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return `${parsed.toString()}${trailing}`;
  } catch {
    return `[REDACTED_URL]${trailing}`;
  }
}

/**
 *
 */
/** Truncates text to a UTF-8 byte limit without splitting a code point. */
function truncateUTF8(value: string, maximumBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).byteLength <= maximumBytes) {
    return value;
  }

  let result = '';
  let byteLength = 0;
  for (const codePoint of value) {
    const codePointBytes = encoder.encode(codePoint).byteLength;
    if (byteLength + codePointBytes > maximumBytes) {
      break;
    }
    result += codePoint;
    byteLength += codePointBytes;
  }
  return result;
}

/**
 * Produces the only free-form string allowed onto the unauthenticated public
 * FF1 stream. Console arguments after the first stay local because current
 * callers pass signed URLs, playlist payloads, Wi-Fi identifiers, and errors
 * through that open-ended surface.
 */
export function publicLogMessage(firstArgument: unknown): string | null {
  if (typeof firstArgument !== 'string') {
    return null;
  }

  const message = firstArgument.trim();
  if (
    !PUBLIC_MESSAGE_PREFIXES.some(
      prefix => message === prefix || message.startsWith(`${prefix} `)
    )
  ) {
    return null;
  }

  const withoutPrivateURLs = message.replace(URL_PATTERN, sanitizeURL);
  const namedCredential = CREDENTIAL_START_PATTERN.exec(withoutPrivateURLs);
  const bearerCredential = BEARER_CREDENTIAL_PATTERN.exec(withoutPrivateURLs);
  let credentialStart = namedCredential;
  if (
    bearerCredential &&
    (!credentialStart || bearerCredential.index < credentialStart.index)
  ) {
    credentialStart = bearerCredential;
  }
  if (credentialStart) {
    const prefix = withoutPrivateURLs.slice(0, credentialStart.index).trimEnd();
    return truncateUTF8(
      `${prefix}${prefix ? ' ' : ''}[REDACTED_CREDENTIAL]`,
      MAX_MESSAGE_BYTES
    );
  }
  return truncateUTF8(withoutPrivateURLs, MAX_MESSAGE_BYTES);
}

/**
 * Groups browser console entries into sampled activity sessions. A session
 * closes after five seconds idle or one minute total, and delivery is kept off
 * the console call path so a slow Cloudflare request cannot affect playback.
 */
export class LogStreamingService {
  private readonly environment: string;
  private readonly sampleRate: number;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly random: () => number;
  private sessionID: string | null = null;
  private sessionStartedAt = 0;
  private lastRecordAt = 0;
  private sampled = false;
  private records: PendingRecord[] = [];
  private pending: PendingRecord[][] = [];
  private retryBatch: PendingRecord[] | null = null;
  private inFlightBatch: PendingRecord[] | null = null;
  private delivering = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private maximumTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(options: LogStreamingOptions) {
    this.environment = options.environment || 'production';
    this.sampleRate = Math.min(1, Math.max(0, options.sampleRate));
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  /** Records one console call while preserving whole-session sampling. */
  public record(level: LogLevel, firstArgument: unknown): void {
    const message = publicLogMessage(firstArgument);
    if (message === null) {
      return;
    }
    const emittedAt = this.now();
    if (
      this.sessionID &&
      (emittedAt - this.lastRecordAt >= IDLE_TIMEOUT_MS ||
        emittedAt - this.sessionStartedAt >= MAX_SESSION_MS)
    ) {
      this.finishSession();
    }
    if (!this.sessionID) {
      this.startSession(emittedAt);
    }
    const sessionID = this.sessionID;
    if (!sessionID) {
      return;
    }

    this.lastRecordAt = emittedAt;
    if (this.sampled) {
      this.records.push({
        timestamp: new Date(emittedAt).toISOString(),
        level,
        environment: this.environment,
        message,
        context: { session_id: sessionID },
      });
      if (this.records.length >= MAX_RECORDS_PER_REQUEST) {
        this.enqueueRecords(this.records.splice(0, MAX_RECORDS_PER_REQUEST));
        void this.deliver();
      }
    }
    this.resetIdleTimer();
  }

  /** Closes the current session and starts non-blocking delivery. */
  public flush(): void {
    this.finishSession();
  }

  /** Hands the newest session to the browser keepalive queue during page exit. */
  public flushForPageExit(): void {
    this.finishSession(false);
    const records =
      this.pending.pop() ?? this.inFlightBatch ?? this.retryBatch ?? null;
    if (!records) {
      return;
    }
    const body = this.keepalivePayload(records);
    // A string body uses the CORS-safelisted text/plain content type, avoiding
    // a new preflight during unload. Controld still parses and validates JSON.
    try {
      void this.fetcher(LOG_PROXY_ENDPOINT, {
        method: 'POST',
        body,
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Page exit and observability must never block browser teardown.
    }
  }

  private startSession(emittedAt: number): void {
    this.sessionID = uuidv4();
    this.sessionStartedAt = emittedAt;
    this.lastRecordAt = emittedAt;
    this.sampled = this.random() < this.sampleRate;
    this.maximumTimer = setTimeout(() => {
      this.finishSession();
    }, MAX_SESSION_MS);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.finishSession();
    }, IDLE_TIMEOUT_MS);
  }

  private finishSession(deliver = true): void {
    if (!this.sessionID) {
      return;
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    if (this.maximumTimer) {
      clearTimeout(this.maximumTimer);
    }
    this.idleTimer = null;
    this.maximumTimer = null;

    while (this.records.length > 0) {
      this.enqueueRecords(this.records.splice(0, MAX_RECORDS_PER_REQUEST));
    }
    this.records = [];
    this.sessionID = null;
    this.sessionStartedAt = 0;
    this.lastRecordAt = 0;
    if (deliver) {
      void this.deliver();
    }
  }

  private enqueueRecords(records: PendingRecord[]): void {
    if (this.pending.length >= MAX_PENDING_REQUESTS) {
      this.pending.shift();
    }
    this.pending.push(records);
  }

  private async deliver(): Promise<void> {
    if (
      this.delivering ||
      this.retryTimer ||
      (!this.retryBatch && this.pending.length === 0)
    ) {
      return;
    }
    this.delivering = true;
    try {
      while (this.retryBatch || this.pending.length > 0) {
        const batch = this.retryBatch ?? this.pending.shift();
        this.retryBatch = null;
        if (!batch) {
          return;
        }
        this.inFlightBatch = batch;
        let response: Response;
        try {
          response = await this.postBatch(batch);
        } catch {
          this.retryBatch = batch;
          this.scheduleRetry();
          return;
        } finally {
          this.inFlightBatch = null;
        }
        if (!response.ok) {
          if (
            response.status === 408 ||
            response.status === 429 ||
            response.status >= 500
          ) {
            this.retryBatch = batch;
            this.scheduleRetry();
            return;
          }
          // Invalid batches cannot become valid through retry and must not
          // block every newer session behind them.
          continue;
        }
      }
    } finally {
      this.delivering = false;
    }
  }

  private async postBatch(records: PendingRecord[]): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, UPLOAD_TIMEOUT_MS);
    try {
      return await this.fetcher(LOG_PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(records),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private keepalivePayload(records: PendingRecord[]): string {
    const encoder = new TextEncoder();
    const complete = JSON.stringify(records);
    if (encoder.encode(complete).byteLength <= MAX_KEEPALIVE_BYTES) {
      return complete;
    }

    let lower = 1;
    let upper = records.length - 1;
    let best = JSON.stringify(records.slice(-1));
    while (lower <= upper) {
      const firstRecord = Math.floor((lower + upper) / 2);
      const candidate = JSON.stringify(records.slice(firstRecord));
      if (encoder.encode(candidate).byteLength <= MAX_KEEPALIVE_BYTES) {
        best = candidate;
        upper = firstRecord - 1;
      } else {
        lower = firstRecord + 1;
      }
    }
    return best;
  }

  private scheduleRetry(): void {
    if (this.retryTimer) {
      return;
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.deliver();
    }, RETRY_DELAY_MS);
  }
}

/** Reads and normalizes the build-time whole-session sampling setting. */
function configuredSampleRate(): number {
  const parsed = Number(process.env.NEXT_PUBLIC_LOG_SAMPLE_RATE ?? '1');
  return Number.isFinite(parsed) ? parsed : 1;
}

const consoleLevels: Record<ConsoleMethod, LogLevel> = {
  trace: 'trace',
  debug: 'debug',
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

/** Installs the player-wide console tee once per browser page lifetime. */
export function installLogStreaming(): void {
  if (
    typeof window === 'undefined' ||
    window.location.origin !== PLAYER_ORIGIN
  ) {
    return;
  }
  const scope = globalThis as typeof globalThis & {
    __ffLogStreamingInstalled?: boolean;
  };
  if (scope.__ffLogStreamingInstalled) {
    return;
  }
  scope.__ffLogStreamingInstalled = true;

  const stream = new LogStreamingService({
    environment: process.env.NEXT_PUBLIC_ENVIRONMENT ?? 'production',
    sampleRate: configuredSampleRate(),
  });
  const target = console as unknown as Record<
    ConsoleMethod,
    (...args: unknown[]) => void
  >;
  for (const method of Object.keys(consoleLevels) as ConsoleMethod[]) {
    const original = target[method].bind(console);
    target[method] = (...args: unknown[]) => {
      original(...args);
      try {
        stream.record(consoleLevels[method], args[0]);
      } catch {
        // Remote observability must never change console or playback behavior.
      }
    };
  }
  window.addEventListener('pagehide', () => {
    stream.flushForPageExit();
  });
}
