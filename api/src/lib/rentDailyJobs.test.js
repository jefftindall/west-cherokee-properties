import assert from 'node:assert/strict';
import test from 'node:test';
import { RentDailyJobsError, runDailyRentJobs } from './rentDailyJobs.js';
import { createMemoryStore } from './store.js';

const devEnv = { AZURE_FUNCTIONS_ENVIRONMENT: 'Development' };
const now = new Date('2026-01-22T13:00:00.000Z');

test('runDailyRentJobs refuses the in-memory store outside local development', async () => {
  await assert.rejects(() => runDailyRentJobs(createMemoryStore(), {}, now, []), /SQL_CONNECTION_STRING/);
});

test('runDailyRentJobs runs steps in order and returns each result', async () => {
  const calls = [];
  const step = (name) => async () => {
    calls.push(name);
    return { skipped: false, name };
  };
  const summary = await runDailyRentJobs(createMemoryStore(), devEnv, now, [
    ['invoices', step('invoices')],
    ['lateFees', step('lateFees')],
    ['communications', step('communications')],
  ]);
  assert.deepEqual(calls, ['invoices', 'lateFees', 'communications']);
  assert.deepEqual(summary.failedSteps, []);
  assert.equal(summary.results.lateFees.name, 'lateFees');
});

test('runDailyRentJobs keeps going after a failed step and throws with the summary', async () => {
  const calls = [];
  const steps = [
    ['invoices', async () => { calls.push('invoices'); throw new Error('stripe down'); }],
    ['lateFees', async () => { calls.push('lateFees'); return { errors: [{ leaseId: 'l1', error: 'x' }] }; }],
    ['communications', async () => { calls.push('communications'); return { sent: 1, errors: [] }; }],
  ];
  const err = await runDailyRentJobs(createMemoryStore(), devEnv, now, steps).catch((e) => e);
  assert.ok(err instanceof RentDailyJobsError);
  assert.deepEqual(calls, ['invoices', 'lateFees', 'communications']);
  assert.deepEqual(err.summary.failedSteps, ['invoices', 'lateFees']);
  assert.equal(err.summary.results.invoices.error, 'stripe down');
  assert.equal(err.summary.results.communications.sent, 1);
});

test('runDailyRentJobs runs the real schedulers end to end on a non-billing day', async () => {
  const summary = await runDailyRentJobs(createMemoryStore(), devEnv, new Date('2026-01-02T13:00:00.000Z'));
  assert.equal(summary.results.invoices.reason, 'not_scheduling_day');
  assert.equal(summary.results.lateFees.reason, 'within_grace');
  assert.equal(summary.results.communications.reason, 'communications_disabled');
});
