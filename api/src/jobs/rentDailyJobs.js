import { app } from '@azure/functions';
import { getStore } from '../lib/store.js';
import { RentDailyJobsError, runDailyRentJobs } from '../lib/rentDailyJobs.js';

/**
 * Deployed only to the standalone jobs Function App (package main = src/jobs/*.js), never to
 * SWA managed Functions, which support HTTP triggers only. One daily run keeps Azure SQL
 * serverless awake for a single auto-pause window. 13:00 UTC is 8–9 AM in New York; billing
 * date logic uses America/New_York internally.
 */
app.timer('rentDailyJobs', {
  schedule: '0 0 13 * * *',
  handler: async (_timer, context) => {
    try {
      const summary = await runDailyRentJobs(getStore(), process.env);
      context.log(JSON.stringify({ job: 'rentDailyJobs', ...summary }));
    } catch (err) {
      if (err instanceof RentDailyJobsError) {
        context.error(JSON.stringify({ job: 'rentDailyJobs', ...err.summary }));
      }
      throw err;
    }
  },
});
