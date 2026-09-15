import { v4 as uuidv4 } from 'uuid';

const LOG_PROXY_ENDPOINT = 'http://127.0.0.1:1111/api/logs';
const IDLE_TIMEOUT_MS = 5_000;
const MAX_SESSION_MS = 60_000;
const RETRY_DELAY_MS = 5_000;
const MAX_RECORDS_PER_REQUEST = 500;
const MAX_PENDING_REQUESTS = 32;
const MAX_MESSAGE_LENGTH = 2_048;

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

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;
const CREDENTIAL_PATTERN =
  /\b(password|secret|token|api[_-]?key|authorization|cookie|dsn)\s*[:=]\s*[^,\s;]+/gi;

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
 * Produces the only free-form string allowed onto the unauthenticated public
 * FF1 stream. Console arguments after the first stay local because current
 * callers pass signed URLs, playlist payloads, Wi-Fi identifiers, and errors
 * through that open-ended surface.
 */
export function publicLogMessage(firstArgument: unknown): string {
  let message: string;
  if (typeof firstArgument === 'string') {
    message = firstArgument;
  } else if (firstArgument instanceof Error) {
    message = `[${firstArgument.name}]`;
  } else {
    message = '[non-string console message]';
  }

  const withoutPrivateURLs = message.replace(URL_PATTERN, sanitizeURL);
  return withoutPrivateURLs
    .replace(CREDENTIAL_PATTERN, '$1=[REDACTED]')
    .slice(0, MAX_MESSAGE_LENGTH);
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
        message: publicLogMessage(firstArgument),
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

  private finishSession(): void {
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
    void this.deliver();
  }

  private enqueueRecords(records: PendingRecord[]): void {
    if (this.pending.length >= MAX_PENDING_REQUESTS) {
      this.pending.shift();
    }
    this.pending.push(records);
  }

  private async deliver(): Promise<void> {
    if (this.delivering || this.pending.length === 0) {
      return;
    }
    this.delivering = true;
    try {
      while (this.pending.length > 0) {
        const response = await this.fetcher(LOG_PROXY_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.pending[0]),
        });
        if (!response.ok) {
          if (
            response.status === 408 ||
            response.status === 429 ||
            response.status >= 500
          ) {
            this.scheduleRetry();
            return;
          }
          // Invalid batches cannot become valid through retry and must not
          // block every newer session behind them.
          this.pending.shift();
          continue;
        }
        this.pending.shift();
      }
    } catch {
      this.scheduleRetry();
    } finally {
      this.delivering = false;
    }
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
  if (typeof window === 'undefined') {
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
    stream.flush();
  });
}
