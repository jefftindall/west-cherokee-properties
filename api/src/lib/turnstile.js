/**
 * Cloudflare Turnstile server-side verification.
 */
export async function verifyTurnstile(token, remoteIp, fetchImpl = fetch) {
  const secret = String(process.env.TURNSTILE_SECRET || '').trim();
  if (!secret || secret === 'REPLACE_ME') {
    const err = new Error('Missing TURNSTILE_SECRET');
    err.name = 'ContactConfigError';
    throw err;
  }

  let result;
  try {
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: remoteIp || '',
      }),
    });
    if (!res.ok) throw new Error(`siteverify ${res.status}`);
    result = await res.json();
  } catch (err) {
    const wrapped = new Error(err instanceof Error ? err.message : 'Turnstile siteverify failed');
    wrapped.name = 'ContactTurnstileError';
    throw wrapped;
  }

  if (!result?.success) {
    const err = new Error('Turnstile verification failed');
    err.name = 'ContactTurnstileRejected';
    throw err;
  }
}
