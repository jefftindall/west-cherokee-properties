import { app } from '@azure/functions';
import { getStore } from '../lib/store.js';
import { runRentInvoiceScheduler, runRentLateFeeScheduler } from '../lib/rentBilling.js';
import { runRentCommunicationScheduler } from '../lib/rentCommunications.js';

/** Daily 13:00 UTC — invoice creation window (NY date logic inside). */
app.timer('rentInvoiceScheduler', {
  schedule: '0 0 13 * * *',
  handler: async () => {
    const result = await runRentInvoiceScheduler(getStore(), process.env);
    console.log(JSON.stringify({ job: 'rentInvoiceScheduler', ...result }));
  },
});

/** Daily 14:00 UTC — late fee after grace period. */
app.timer('rentLateFeeScheduler', {
  schedule: '0 0 14 * * *',
  handler: async () => {
    const result = await runRentLateFeeScheduler(getStore(), process.env);
    console.log(JSON.stringify({ job: 'rentLateFeeScheduler', ...result }));
  },
});

/** Daily 15:00 UTC — tenant rent emails (sole email path). */
app.timer('rentCommunicationScheduler', {
  schedule: '0 0 15 * * *',
  handler: async () => {
    const result = await runRentCommunicationScheduler(getStore(), process.env);
    console.log(JSON.stringify({ job: 'rentCommunicationScheduler', ...result }));
  },
});
