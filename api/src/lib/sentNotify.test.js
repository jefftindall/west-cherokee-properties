import assert from 'node:assert/strict';
import test from 'node:test';
import { alertPhoneE164, sendSms, sendStaffSms, sendTenantSms, sentConfigured, sentSandbox } from './sentNotify.js';

test('sentConfigured requires a real API key', () => {
  assert.equal(sentConfigured({ SENT_API_KEY: '' }), false);
  assert.equal(sentConfigured({ SENT_API_KEY: 'REPLACE_ME' }), false);
  assert.equal(sentConfigured({ SENT_API_KEY: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' }), true);
});

test('sentSandbox reads SENT_SANDBOX', () => {
  assert.equal(sentSandbox({}), false);
  assert.equal(sentSandbox({ SENT_SANDBOX: 'true' }), true);
});

test('alertPhoneE164 normalizes ALERT_PHONE', () => {
  assert.equal(alertPhoneE164({ ALERT_PHONE: '(404) 555-0199' }), '+14045550199');
  assert.equal(alertPhoneE164({ ALERT_PHONE: 'bad' }), '');
});

test('sendSms posts to Sent with sandbox and returns message id', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 202,
      json: async () => ({
        data: { recipients: [{ message_id: 'msg-1', to: '+14045550100', channel: 'sms' }] },
      }),
    };
  };

  const result = await sendSms({
    to: '+14045550100',
    text: 'Hello',
    env: { SENT_API_KEY: 'key-1', SENT_SANDBOX: 'true' },
    fetchImpl,
  });

  assert.equal(result.messageId, 'msg-1');
  assert.equal(result.sandbox, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.sent.dm/v3/messages');
  assert.equal(calls[0].init.headers['x-api-key'], 'key-1');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.to, ['+14045550100']);
  assert.equal(body.text, 'Hello');
  assert.deepEqual(body.channel, ['sms']);
  assert.equal(body.sandbox, true);
});

test('sendSms preview redirects to ALERT_PHONE', async () => {
  let body;
  const fetchImpl = async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, status: 202, json: async () => ({ data: { recipients: [] } }) };
  };

  await sendSms({
    to: '+14045550100',
    text: 'Balance due',
    preview: true,
    env: { SENT_API_KEY: 'key-1', ALERT_PHONE: '4045550199' },
    fetchImpl,
  });

  assert.deepEqual(body.to, ['+14045550199']);
  assert.match(body.text, /^\[PREVIEW for \+14045550100\]/);
});

test('sendTenantSms rejects invalid phone', async () => {
  await assert.rejects(
    () => sendTenantSms({ to: '123', text: 'Hi', env: { SENT_API_KEY: 'key-1' } }),
    /valid US number/,
  );
});

test('sendStaffSms uses ALERT_PHONE', async () => {
  let body;
  const fetchImpl = async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, status: 202, json: async () => ({ data: { recipients: [] } }) };
  };

  await sendStaffSms({
    text: 'New contact',
    env: { SENT_API_KEY: 'key-1', ALERT_PHONE: '6785550100' },
    fetchImpl,
  });

  assert.deepEqual(body.to, ['+16785550100']);
  assert.equal(body.text, 'New contact');
});

test('sendSms throws SentSendError on non-OK response', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(
    () => sendSms({ to: '+14045550100', text: 'Hi', env: { SENT_API_KEY: 'key-1' }, fetchImpl }),
    (err) => err.name === 'SentSendError',
  );
});
