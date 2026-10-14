import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_ATTEMPTS,
  REQUEST_TIMEOUT_MS,
  RETRY_DELAY_MS,
  verifyPublishedFeed,
} from './verify-reports.ts';

const ORIGIN = 'https://example.com';
const FEED = '<rss><lastBuildDate>new</lastBuildDate></rss>';
const OLD_FEED = '<rss><lastBuildDate>old</lastBuildDate></rss>';
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe('published RSS verification', () => {
  it('returns immediately on an exact match without retrying', async () => {
    fetchMock.mockResolvedValueOnce(new Response(FEED));
    await verifyPublishedFeed(ORIGIN, FEED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/rss/reports.xml', ORIGIN),
      {
        redirect: 'error',
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      },
    );
    expect(console.warn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits through old deployments, including a build-date-only mismatch', async () => {
    fetchMock.mockImplementation(async () => new Response(OLD_FEED));
    const verified = verifyPublishedFeed(ORIGIN, FEED);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockResolvedValueOnce(new Response(FEED));
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    await verified;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries HTTP errors, network errors and timeouts while reading the body', async () => {
    const timedOut = new Response('');
    vi.spyOn(timedOut, 'text').mockRejectedValue(
      new DOMException('Timed out', 'TimeoutError'),
    );
    fetchMock
      .mockResolvedValueOnce(new Response('Feed not ready', { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce(timedOut)
      .mockResolvedValueOnce(new Response(FEED));
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const verified = verifyPublishedFeed(ORIGIN, FEED);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 3);
    await verified;
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(timeout).toHaveBeenCalledTimes(4);
    expect(timeout).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
    const signals = fetchMock.mock.calls.map(([, init]) => init?.signal);
    expect(new Set(signals).size).toBe(4);
  });

  it('fails after the limit, logs status and hashes, and never accepts stale RSS', async () => {
    fetchMock.mockImplementation(async () => new Response(OLD_FEED));
    const failure = expect(verifyPublishedFeed(ORIGIN, FEED)).rejects.toThrow(
      `Published feed does not match build after ${MAX_ATTEMPTS} attempts: HTTP 200`,
    );
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * (MAX_ATTEMPTS - 1));
    await failure;
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    const warnings = vi.mocked(console.warn).mock.calls.flat().join('\n');
    expect(warnings).toContain(
      createHash('sha256').update(OLD_FEED).digest('hex'),
    );
    expect(warnings).toContain(createHash('sha256').update(FEED).digest('hex'));
    expect(warnings).not.toContain(OLD_FEED);
    expect(vi.getTimerCount()).toBe(0);
  });
});
