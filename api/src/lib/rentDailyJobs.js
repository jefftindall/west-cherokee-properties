import { runRentInvoiceScheduler, runRentLateFeeScheduler } from './rentBilling.js';
import { runRentCommunicationScheduler } from './rentCommunications.js';

export const DEFAULT_STEPS = [
  ['invoices', runRentInvoiceScheduler],
  ['lateFees', runRentLateFeeScheduler],
  ['communications', runRentCommunicationScheduler],
];

export class RentDailyJobsError extends Error {
  constructor(summary) {
    super(`Rent daily jobs failed: ${summary.failedSteps.join(', ')}`);
    this.name = 'RentDailyJobsError';
    this.summary = summary;
  }
}

function isLocalDevelopment(env) {
  return String(env.AZURE_FUNCTIONS_ENVIRONMENT || '') === 'Development';
}

/**
 * Runs billing steps in order inside one SQL wake window. Order matters: late fees land
 * before communications so tenant emails reflect the current balance. A failing step does
 * not skip later steps; the run still throws at the end so the invocation shows as failed.
 */
export async function runDailyRentJobs(store, env = process.env, now = new Date(), steps = DEFAULT_STEPS) {
  if (store.kind === 'memory' && !isLocalDevelopment(env)) {
    throw new Error('Rent daily jobs require SQL_CONNECTION_STRING; refusing to run against the in-memory store');
  }

  const results = {};
  const failedSteps = [];
  for (const [name, run] of steps) {
    try {
      const result = await run(store, env, now);
      results[name] = result;
      if (result?.errors?.length) failedSteps.push(name);
    } catch (err) {
      results[name] = { error: err instanceof Error ? err.message : 'unknown' };
      failedSteps.push(name);
    }
  }

  const summary = { asOf: now.toISOString(), results, failedSteps };
  if (failedSteps.length) throw new RentDailyJobsError(summary);
  return summary;
}
