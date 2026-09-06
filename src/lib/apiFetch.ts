/**
 * Client fetch for `/api/*` with backoff/retry for cold Azure Functions + SQL wake.
 * Total wall-clock budget defaults to 3 minutes; after that callers should offer Report an issue.
 */

export const API_FETCH_MAX_TOTAL_MS = 180_000;
export const API_FETCH_ATTEMPT_TIMEOUT_MS = 30_000;
export const API_FETCH_SLOW_AFTER_MS = 8_000;
export const API_FETCH_INITIAL_BACKOFF_MS = 1_000;
export const API_FETCH_MAX_BACKOFF_MS = 16_000;
/** Immediate "failed to fetch" (no Functions / offline) stops before burning the full budget. */
export const API_FETCH_MAX_FAST_NETWORK_FAILURES = 3;
export const API_FETCH_FAST_FAILURE_MS = 2_000;

export type ApiFetchPhase = 'request' | 'slow' | 'backoff' | 'exhausted';

export type ApiFetchStatus = {
  attempt: number;
  elapsedMs: number;
  phase: ApiFetchPhase;
  message: string;
  retryInMs?: number;
};

export type ApiFetchOptions = RequestInit & {
  /** Per-attempt abort timeout. Default 30s. */
  timeoutMs?: number;
  /** Wall-clock budget across attempts + backoff. Default 3 minutes. */
  maxTotalMs?: number;
  /** When to surface "taking longer than usual" on the first attempt. Default 8s. */
  slowAfterMs?: number;
  /** Called when UI should update (slow first try, retries, backoff). */
  onStatus?: (status: ApiFetchStatus) => void;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Override clock (tests). */
  now?: () => number;
  /** Override delay (tests). */
  sleep?: (ms: number) => Promise<void>;
};

export class ApiFetchExhaustedError extends Error {
  readonly name = 'ApiFetchExhaustedError';
  readonly attempts: number;
  readonly elapsedMs: number;
  readonly lastStatus?: number;

  constructor(
    message: string,
    opts: { attempts: number; elapsedMs: number; lastStatus?: number; cause?: unknown },
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.attempts = opts.attempts;
    this.elapsedMs = opts.elapsedMs;
    this.lastStatus = opts.lastStatus;
  }
}

export function isApiFetchExhausted(err: unknown): err is ApiFetchExhaustedError {
  return (
    err instanceof ApiFetchExhaustedError ||
    (err instanceof Error && err.name === 'ApiFetchExhaustedError')
  );
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isAbortError(err: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'))
  );
}

function isNetworkError(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    (err instanceof Error && /failed to fetch|networkerror|load failed/i.test(err.message))
  );
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number, initial: number, max: number): number {
  const exp = Math.min(max, initial * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.min(250, Math.max(1, exp * 0.1)));
  return exp + jitter;
}

function statusMessage(phase: ApiFetchPhase, attempt: number, retryInMs?: number): string {
  if (phase === 'slow') return 'Taking longer than usual…';
  if (phase === 'backoff') {
    const secs = Math.max(1, Math.ceil((retryInMs || 0) / 1000));
    return `Still working — retrying in ${secs}s (attempt ${attempt})…`;
  }
  if (phase === 'exhausted') return 'This is taking too long. Please report an issue.';
  if (attempt > 1) return `Still working — try ${attempt}…`;
  return 'Working…';
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  outerSignal: AbortSignal | null | undefined,
): Promise<Response> {
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort(outerSignal?.reason);
  if (outerSignal) {
    if (outerSignal.aborted) {
      controller.abort(outerSignal.reason);
    } else {
      outerSignal.addEventListener('abort', onOuterAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    controller.abort(new DOMException('API request timed out', 'AbortError'));
  }, timeoutMs);

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * fetch() with per-attempt timeout, exponential backoff, and a 3-minute total budget.
 * Retries gateway/timeouts for cold starts; stops early on repeated fast connection failures.
 */
export async function apiFetch(input: RequestInfo | URL, options: ApiFetchOptions = {}): Promise<Response> {
  const {
    timeoutMs = API_FETCH_ATTEMPT_TIMEOUT_MS,
    maxTotalMs = API_FETCH_MAX_TOTAL_MS,
    slowAfterMs = API_FETCH_SLOW_AFTER_MS,
    onStatus,
    fetchImpl = fetch,
    now = () => Date.now(),
    sleep = defaultSleep,
    signal: outerSignal,
    ...init
  } = options;

  const started = now();
  const deadline = started + maxTotalMs;
  let attempt = 0;
  let fastNetworkFailures = 0;
  let lastStatus: number | undefined;
  let lastCause: unknown;

  const emit = (phase: ApiFetchPhase, extra?: Partial<ApiFetchStatus>) => {
    onStatus?.({
      attempt,
      elapsedMs: now() - started,
      phase,
      message: statusMessage(phase, attempt, extra?.retryInMs),
      ...extra,
    });
  };

  while (deadline - now() > 0) {
    attempt += 1;
    const remaining = deadline - now();
    const attemptTimeout = Math.min(timeoutMs, remaining);
    if (attemptTimeout <= 0) break;

    let slowTimer: ReturnType<typeof setTimeout> | undefined;
    const attemptStarted = now();

    try {
      if (attempt > 1) emit('request');
      else if (slowAfterMs > 0 && slowAfterMs < attemptTimeout) {
        slowTimer = setTimeout(() => emit('slow'), slowAfterMs);
      }

      const res = await fetchWithTimeout(fetchImpl, input, init, attemptTimeout, outerSignal);

      if (!isRetryableStatus(res.status)) {
        return res;
      }

      lastStatus = res.status;
      lastCause = new Error(`HTTP ${res.status}`);
      try {
        await res.arrayBuffer();
      } catch {
        /* ignore */
      }
    } catch (err) {
      lastCause = err;
      if (outerSignal?.aborted) throw err;

      if (isAbortError(err)) {
        lastStatus = undefined;
      } else if (isNetworkError(err)) {
        const failedIn = now() - attemptStarted;
        if (failedIn < API_FETCH_FAST_FAILURE_MS) {
          fastNetworkFailures += 1;
          if (fastNetworkFailures >= API_FETCH_MAX_FAST_NETWORK_FAILURES) {
            emit('exhausted');
            throw new ApiFetchExhaustedError(
              'Could not reach the API after several tries. Check your connection or report an issue.',
              { attempts: attempt, elapsedMs: now() - started, cause: err },
            );
          }
        }
      } else {
        throw err;
      }
    } finally {
      if (slowTimer) clearTimeout(slowTimer);
    }

    const remainingAfter = deadline - now();
    if (remainingAfter <= 0) break;

    const wait = Math.min(
      backoffMs(attempt, API_FETCH_INITIAL_BACKOFF_MS, API_FETCH_MAX_BACKOFF_MS),
      remainingAfter,
    );
    if (wait > 0) {
      emit('backoff', { retryInMs: wait });
      await sleep(wait);
    }
  }

  emit('exhausted');
  throw new ApiFetchExhaustedError(
    'This is taking too long. Please report an issue so we can look into it.',
    {
      attempts: attempt,
      elapsedMs: now() - started,
      lastStatus,
      cause: lastCause,
    },
  );
}
