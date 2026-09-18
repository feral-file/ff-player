import { afterEach, describe, expect, it, vi } from 'vitest';

import { LogStreamingService, publicLogMessage } from './logStreamingService';

/** Parses the string body expected from the log streamer. */
function requestRecords(init?: RequestInit): unknown[] {
  if (typeof init?.body !== 'string') {
    throw new Error('expected a string request body');
  }
  return JSON.parse(init.body) as unknown[];
}

/** Creates a fetch seam that records successful loopback-proxy uploads. */
function successfulFetcher(posts: unknown[][]): typeof fetch {
  return vi.fn((_input: URL | RequestInfo, init?: RequestInit) => {
    posts.push(requestRecords(init));
    return Promise.resolve(new Response(null, { status: 202 }));
  }) as typeof fetch;
}

/** Records a message carrying an explicitly approved application namespace. */
function record(
  stream: LogStreamingService,
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error',
  message: string
): void {
  stream.record(level, `[CanvasService] ${message}`);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('LogStreamingService session boundaries', () => {
  it('groups logs by five seconds of inactivity', async () => {
    vi.useFakeTimers();
    let now = 0;
    const posts: unknown[][] = [];
    const stream = new LogStreamingService({
      environment: 'test',
      fetcher: successfulFetcher(posts),
      now: () => now,
    });

    record(stream, 'info', 'one');
    now = 1_000;
    record(stream, 'warn', 'two');
    await vi.advanceTimersByTimeAsync(4_999);
    expect(posts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(posts).toHaveLength(1);
    expect(posts[0]).toHaveLength(2);
    const [first, second] = posts[0] as {
      context: { session_id: string };
    }[];
    expect(first.context.session_id).toBe(second.context.session_id);
    expect(first).toMatchObject({
      environment: 'test',
      level: 'info',
      message: '[CanvasService] one',
      timestamp: new Date(0).toISOString(),
    });
  });
});

describe('LogStreamingService maximum session duration', () => {
  it('splits continuous activity after one minute', async () => {
    vi.useFakeTimers();
    let now = 0;
    const posts: unknown[][] = [];
    const stream = new LogStreamingService({
      environment: 'test',
      fetcher: successfulFetcher(posts),
      now: () => now,
    });

    record(stream, 'info', 'first');
    for (let second = 1; second < 60; second += 1) {
      now = second * 1_000;
      await vi.advanceTimersByTimeAsync(1_000);
      record(stream, 'debug', 'continuous');
    }
    now = 60_000;
    await vi.advanceTimersByTimeAsync(1_000);
    record(stream, 'info', 'next session');
    stream.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(posts).toHaveLength(2);
    expect(posts[0]).toHaveLength(60);
    const firstID = (posts[0][0] as { context: { session_id: string } }).context
      .session_id;
    const secondID = (posts[1][0] as { context: { session_id: string } })
      .context.session_id;
    expect(firstID).not.toBe(secondID);
  });
});

describe('LogStreamingService delivery', () => {
  it('retries transient proxy failures', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const posts: unknown[][] = [];
    const fetcher = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => {
      attempts += 1;
      posts.push(requestRecords(init));
      return Promise.resolve(
        new Response(null, { status: attempts === 1 ? 503 : 202 })
      );
    }) as typeof fetch;
    const stream = new LogStreamingService({
      environment: 'test',
      fetcher,
      now: () => 0,
    });

    record(stream, 'error', 'queued');
    stream.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(posts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(posts).toHaveLength(2);
    expect(posts[1]).toMatchObject([{ message: '[CanvasService] queued' }]);
  });

  it('drops a permanent bad batch so a newer batch can proceed', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const posts: unknown[][] = [];
    const fetcher = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => {
      attempts += 1;
      posts.push(requestRecords(init));
      return Promise.resolve(
        new Response(null, { status: attempts === 1 ? 400 : 202 })
      );
    }) as typeof fetch;
    let now = 0;
    const stream = new LogStreamingService({
      environment: 'test',
      fetcher,
      now: () => now,
    });

    record(stream, 'error', 'bad batch');
    stream.flush();
    now = 10_000;
    record(stream, 'info', 'new batch');
    stream.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(posts).toHaveLength(2);
    expect(posts[1]).toMatchObject([{ message: '[CanvasService] new batch' }]);
  });
});

describe('LogStreamingService stalled delivery', () => {
  it('aborts a stalled upload and retries it', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const fetcher = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => {
      attempts += 1;
      if (attempts > 1) {
        return Promise.resolve(new Response(null, { status: 202 }));
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    }) as typeof fetch;
    const stream = new LogStreamingService({
      environment: 'test',
      fetcher,
      now: () => 0,
    });

    record(stream, 'error', 'stalled');
    stream.flush();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(attempts).toBe(2);
  });

  it('does not evict the batch currently being uploaded', async () => {
    vi.useFakeTimers();
    const posts: unknown[][] = [];
    let releaseFirst: ((response: Response) => void) | undefined;
    const fetcher = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => {
      posts.push(requestRecords(init));
      if (posts.length === 1) {
        return new Promise<Response>(resolve => {
          releaseFirst = resolve;
        });
      }
      return Promise.resolve(new Response(null, { status: 202 }));
    }) as typeof fetch;
    let now = 0;
    const stream = new LogStreamingService({
      environment: 'test',
      fetcher,
      now: () => now,
    });

    record(stream, 'info', 'in flight');
    stream.flush();
    await vi.advanceTimersByTimeAsync(0);
    for (let index = 0; index < 33; index += 1) {
      now += 10_000;
      record(stream, 'info', `queued-${String(index)}`);
      stream.flush();
    }
    releaseFirst?.(new Response(null, { status: 202 }));
    await vi.advanceTimersByTimeAsync(0);

    const messages = posts.map(
      batch => (batch[0] as { message: string }).message
    );
    expect(messages).toHaveLength(33);
    expect(messages[0]).toBe('[CanvasService] in flight');
    expect(messages).not.toContain('[CanvasService] queued-0');
    expect(messages.slice(1)).toEqual(
      Array.from(
        { length: 32 },
        (_value, index) => `[CanvasService] queued-${String(index + 1)}`
      )
    );
  });
});

describe('LogStreamingService page exit', () => {
  it('uses a bounded keepalive request for the newest page-exit logs', async () => {
    vi.useFakeTimers();
    const calls: RequestInit[] = [];
    const fetcher = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => {
      calls.push(init ?? {});
      return Promise.resolve(new Response(null, { status: 202 }));
    }) as typeof fetch;
    const stream = new LogStreamingService({
      environment: 'test',
      fetcher,
      now: () => 0,
    });
    for (let index = 0; index < 40; index += 1) {
      record(stream, 'info', `${String(index)}-${'x'.repeat(2_048)}`);
    }

    stream.flushForPageExit();
    await vi.advanceTimersByTimeAsync(0);

    expect(calls).toHaveLength(1);
    expect(calls[0].keepalive).toBe(true);
    expect(calls[0].headers).toBeUndefined();
    const body = calls[0].body;
    expect(typeof body).toBe('string');
    expect(
      new TextEncoder().encode(body as string).byteLength
    ).toBeLessThanOrEqual(60 * 1_024);
    const records = JSON.parse(body as string) as { message: string }[];
    expect(records.at(-1)?.message.startsWith('[CanvasService] 39-')).toBe(true);
  });
});

describe('publicLogMessage', () => {
  it('keeps open-ended console data out of the public stream', () => {
    expect(publicLogMessage('   ')).toBeNull();
    expect(publicLogMessage({ ssid: 'home-network' })).toBeNull();
    expect(publicLogMessage('Bearer eyJ.private.token')).toBeNull();
    expect(publicLogMessage('arbitrary operator output')).toBeNull();
    expect(
      publicLogMessage(
        '[MediaLoader] fetch https://user:pass@example.com/art?token=url-secret apiKey=message-secret'
      )
    ).toBe('[MediaLoader] fetch https://example.com/art [REDACTED_CREDENTIAL]');
    expect(publicLogMessage('[API] Authorization: Bearer secret-token')).toBe(
      '[API] [REDACTED_CREDENTIAL]'
    );
    expect(publicLogMessage('[API] payload {"apiKey":"secret"}')).toBe(
      '[API] payload { [REDACTED_CREDENTIAL]'
    );
    expect(
      publicLogMessage(
        '[CDP] connect wss://user:secret@example.com/socket?token=query-secret'
      )
    ).toBe('[CDP] connect wss://example.com/socket');
  });

  it('caps multibyte messages by the proxy UTF-8 byte limit', () => {
    const message = publicLogMessage(`[CanvasService] ${'😀'.repeat(1_024)}`);

    expect(new TextEncoder().encode(message ?? '').byteLength).toBe(2_048);
    expect(message?.startsWith('[CanvasService] ')).toBe(true);
  });
});
