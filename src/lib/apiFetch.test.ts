import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  API_FETCH_MAX_FAST_NETWORK_FAILURES,
  apiFetch,
  isApiFetchExhausted,
  isRetryableStatus,
} from './apiFetch.ts';

describe('isRetryableStatus', () => {
  it('retries gateway and throttle statuses', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      assert.equal(isRetryableStatus(status), true);
    }
  });

  it('does not retry success or typical client errors', () => {
    for (const status of [200, 201, 400, 401, 403, 404, 422]) {
      assert.equal(isRetryableStatus(status), false);
    }
  });
});

describe('apiFetch', () => {
  it('returns non-retryable responses without retrying', async () => {
    let calls = 0;
    const res = await apiFetch('/api/demo', {
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
      sleep: async () => {},
      now: () => 0,
    });
    assert.equal(res.status, 200);
    assert.equal(calls, 1);
  });

  it('retries retryable HTTP statuses then succeeds', async () => {
    let calls = 0;
    const statuses: number[] = [];
    const res = await apiFetch('/api/demo', {
      timeoutMs: 1000,
      maxTotalMs: 60_000,
      slowAfterMs: 10_000,
      fetchImpl: async () => {
        calls += 1;
        if (calls < 3) return new Response('nope', { status: 503 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
      sleep: async () => {},
      now: (() => {
        let t = 0;
        return () => {
          t += 1;
          return t;
        };
      })(),
      onStatus: (s) => statuses.push(s.attempt),
    });
    assert.equal(res.status, 200);
    assert.equal(calls, 3);
    assert.ok(statuses.length >= 1);
  });

  it('emits slow status when the first attempt runs long', async () => {
    const phases: string[] = [];
    let now = 0;
    const timers: Array<{ at: number; fn: () => void }> = [];

    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    // @ts-expect-error test stub
    globalThis.setTimeout = (fn: () => void, ms?: number) => {
      const handle = { at: now + (ms || 0), fn };
      timers.push(handle);
      return handle as unknown as ReturnType<typeof setTimeout>;
    };
    // @ts-expect-error test stub
    globalThis.clearTimeout = (handle: { at: number; fn: () => void }) => {
      const idx = timers.indexOf(handle);
      if (idx >= 0) timers.splice(idx, 1);
    };

    try {
      const pending = apiFetch('/api/demo', {
        timeoutMs: 20_000,
        maxTotalMs: 60_000,
        slowAfterMs: 8_000,
        fetchImpl: async () => {
          now = 9_000;
          for (const timer of [...timers]) {
            if (timer.at <= now) timer.fn();
          }
          return new Response('{}', { status: 200 });
        },
        now: () => now,
        sleep: async () => {},
        onStatus: (s) => phases.push(s.phase),
      });
      const res = await pending;
      assert.equal(res.status, 200);
      assert.ok(phases.includes('slow'));
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it('stops early after repeated fast network failures', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        apiFetch('/api/demo', {
          timeoutMs: 5_000,
          maxTotalMs: 180_000,
          slowAfterMs: 30_000,
          fetchImpl: async () => {
            calls += 1;
            throw new TypeError('Failed to fetch');
          },
          sleep: async () => {},
          now: (() => {
            let t = 0;
            return () => {
              t += 10;
              return t;
            };
          })(),
        }),
      (err: unknown) => {
        assert.equal(isApiFetchExhausted(err), true);
        return true;
      },
    );
    assert.equal(calls, API_FETCH_MAX_FAST_NETWORK_FAILURES);
  });

  it('exhausts when the total budget elapses on timeouts', async () => {
    let calls = 0;
    let now = 0;
    await assert.rejects(
      () =>
        apiFetch('/api/demo', {
          timeoutMs: 1_000,
          maxTotalMs: 3_500,
          slowAfterMs: 50_000,
          fetchImpl: async (_input, init) => {
            calls += 1;
            now += 1_000;
            const err = new Error('API request timed out');
            err.name = 'AbortError';
            // Honor abort if already fired
            if (init?.signal?.aborted) throw err;
            throw err;
          },
          sleep: async (ms) => {
            now += ms;
          },
          now: () => now,
        }),
      (err: unknown) => {
        assert.equal(isApiFetchExhausted(err), true);
        if (isApiFetchExhausted(err)) {
          assert.ok(err.elapsedMs <= 3_500 + 50);
          assert.ok(err.attempts >= 2);
        }
        return true;
      },
    );
    assert.ok(calls >= 2);
    assert.ok(now >= 3_000);
  });

  it('does not retry 4xx application errors', async () => {
    let calls = 0;
    const res = await apiFetch('/api/demo', {
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: 'nope' }), { status: 400 });
      },
      sleep: async () => {},
      now: () => 0,
    });
    assert.equal(res.status, 400);
    assert.equal(calls, 1);
  });
});
