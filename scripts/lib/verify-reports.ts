import { createHash } from 'node:crypto';

export const MAX_ATTEMPTS = 7;
export const RETRY_DELAY_MS = 10_000;
export const REQUEST_TIMEOUT_MS = 15_000;

const sha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');

/** Wait for the new deployment; only an exact match permits publication acknowledgement. */
export async function verifyPublishedFeed(origin: string, expected: string) {
  const url = new URL('/rss/reports.xml', origin);
  const expectedHash = sha256(expected);
  let lastFailure = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const actual = await response.text();
      if (response.ok && actual === expected) {
        console.log(
          `Published RSS matches build (attempt ${attempt}/${MAX_ATTEMPTS})`,
        );
        return;
      }
      lastFailure = `HTTP ${response.status}; expected SHA-256=${expectedHash}; actual SHA-256=${sha256(actual)}`;
    } catch (error) {
      lastFailure = `${error instanceof Error ? error.name : 'Unknown error'} while fetching or reading RSS`;
    }

    console.warn(
      `RSS verification failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${lastFailure}`,
    );
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  throw new Error(
    `Published feed does not match build after ${MAX_ATTEMPTS} attempts: ${lastFailure}`,
  );
}
