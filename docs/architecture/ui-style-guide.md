# UI style guide

**Audience:** Agents, implementers  
**Last updated:** 2026-09-06  
**Scope:** Brand tokens, layout primitives, buttons, and async interaction patterns for the public site, office, and portal.

Tokens live in [`src/styles/global.css`](../../src/styles/global.css). Brand constants live in [`src/lib/site.ts`](../../src/lib/site.ts). Shared async helpers live in [`src/lib/uiFeedback.ts`](../../src/lib/uiFeedback.ts). Client `/api` calls use [`src/lib/apiFetch.ts`](../../src/lib/apiFetch.ts) (backoff/retry). Office back-navigation helpers live in [`src/lib/officeNav.ts`](../../src/lib/officeNav.ts). The wordmark is [`public/logo.png`](../../public/logo.png); the house mark is [`public/mark.png`](../../public/mark.png). Both files have a **transparent** background — do not place them on a black plate.

## Brand positioning

| Element | Value |
|---------|--------|
| Name | West Cherokee Properties |
| Role | Rental property management |
| Narrative | A few rental homes in Cartersville: downtown on West Cherokee and Noble, plus Falcon Circle north of town |
| Tone | Trustworthy, local, residential |

Do not use Broadway / theatre visual language (stage gold, spotlight, gel).

## Color tokens

Drawn from the logo (blue house, orange “West Cherokee”, green “Properties, LLC”) and quieted for body UI. The site is light: cream page, white cards, white header/footer.

| Token | Hex | Use |
|-------|-----|-----|
| `pine` | `#0d4a8c` | Headings |
| `grove` | `#0068d1` | Links, nav, secondary buttons |
| `clay` | `#e56e00` | Primary CTA, active nav |
| `leaf` | `#1f9d24` | Supporting accent only |
| `panel` | `#ffffff` | Cards, header, footer |
| `cream` | `#f5f7fa` | Page background |
| `ink` | `#1a2330` | Body text |
| `muted` | `#5c646e` | Supporting copy |
| `line` | `#d7dce2` | Borders |

Primary CTAs use **clay**. Do not use black as a section background. Headings and body use Source Sans 3.

## Buttons

| Class | Use |
|-------|-----|
| `btn-primary` | Main action (clay) |
| `btn-secondary` | Secondary action (grove) |
| `btn-ghost` | Text link styled as control |

All submit buttons that trigger async work must enter a **busy** state (see below) so the user cannot double-submit.

## Async loading

Any client-side `fetch`, form submit, or panel mount that waits on the network must show a **spinner** until the request settles — success or failure. Plain text such as “Loading…” without a spinner is not sufficient.

### Inline loading

Use when status sits beside a heading or above a small panel.

```html
<div class="wcp-loading" role="status" aria-live="polite">
  <span class="wcp-spinner" aria-hidden="true"></span>
  <span>Loading dashboard…</span>
</div>
```

### Block loading

Use when replacing the contents of a card, table, or list region.

```html
<div class="wcp-loading-block" role="status" aria-live="polite">
  <span class="wcp-spinner" aria-hidden="true"></span>
  <span>Loading leases…</span>
</div>
```

Helpers:

```typescript
import { renderLoading, clearLoading } from '../lib/uiFeedback.ts';

renderLoading(hostElement, 'Loading…', { block: true });
// after fetch settles:
clearLoading(hostElement);
```

Keep the spinner visible for the full request duration. Clear it only after the promise resolves or rejects.

## API fetch retry

Azure Functions (and SQL after idle) can miss the first request. All browser calls to `/api/*` must use `apiFetch` from [`src/lib/apiFetch.ts`](../../src/lib/apiFetch.ts) instead of bare `fetch`.

Behavior:

1. Per-attempt timeout (default 30s) with exponential backoff between tries.
2. Total wall-clock budget of **3 minutes** (`API_FETCH_MAX_TOTAL_MS`).
3. After ~8s on the first try, or on any retry, update the loading/busy label via `onStatus` (e.g. “Taking longer than usual…” / “Still working — try 2…”).
4. Retry on network failures, per-attempt timeouts, and HTTP 408 / 429 / 500 / 502 / 503 / 504.
5. Do **not** retry ordinary 4xx/2xx application responses.
6. Stop early after a few immediate connection or gateway failures (local Functions down / offline) so developers are not stuck for the full budget.
7. When the budget is exhausted, throw `ApiFetchExhaustedError` (includes `correlationId`) and show `showApiExhaustedBanner` (**Report an issue** → `/contact?issue=api-timeout&from=…&cid=<client-correlation-id>`).
8. Each attempt sends `X-Client-Correlation-Id`. Contact stores `cid` in a hidden `clientCorrelationId` field and includes it on submit so staff can match the report to retry logs.

```typescript
import { apiFetch, isApiFetchExhausted } from '../lib/apiFetch.ts';
import {
  bindApiFetchStatus,
  renderLoading,
  clearLoading,
  showApiExhaustedBanner,
  showErrorBanner,
} from '../lib/uiFeedback.ts';

renderLoading(host, 'Loading…', { block: true });
try {
  const res = await apiFetch('/api/office/dashboard', {
    onStatus: bindApiFetchStatus({ loadingHost: host }),
  });
  // handle res…
} catch (err) {
  clearLoading(host);
  if (isApiFetchExhausted(err)) showApiExhaustedBanner(errors, err);
  else showErrorBanner(errors, 'Could not load.');
}
```

Document download links and iframe `src` values that point at `/api/...` stay as plain URLs (browser navigation, not `apiFetch`).

## Busy buttons

When the user submits a form or clicks an action button:

1. Add `is-busy` to the button.
2. Set `disabled` and `aria-busy="true"`.
3. Replace the label with a spinner plus a short progress label (e.g. “Saving…”).
4. Block pointer events (handled by `.is-busy` in CSS).
5. Restore the original label in a `finally` block.

Static markup example:

```html
<button class="btn-primary is-busy" type="submit" disabled aria-busy="true">
  <span class="wcp-spinner wcp-spinner-sm" aria-hidden="true"></span>
  Saving…
</button>
```

Helper:

```typescript
import { setButtonBusy } from '../lib/uiFeedback.ts';

setButtonBusy(submitButton, true, 'Saving…');
try {
  await fetch(/* … */);
} finally {
  setButtonBusy(submitButton, false);
}
```

Apply to **every** async submit button in office, portal, and public forms.

## Error banners

Failures that need review use a **dismissible error banner** — not muted paragraph text alone. The user dismisses after reading. Inline success messages may remain plain text; errors use `wcp-alert wcp-alert-error`.

```html
<div class="wcp-alert wcp-alert-error" role="alert">
  <p class="wcp-alert-message">Could not save availability. Check your connection and try again.</p>
  <button type="button" class="wcp-alert-dismiss" aria-label="Dismiss error">×</button>
</div>
```

Helper:

```typescript
import { showErrorBanner, clearErrorBanner } from '../lib/uiFeedback.ts';

showErrorBanner(bannerHost, json.error || 'Could not complete that action.');
// optional: clearErrorBanner(bannerHost) before a retry
```

Place the banner host near the form or panel it describes (top of section or directly above the action row).

## Office back navigation

Staff move between the dashboard, unit detail, payments, leases, and other office tools. **Always preserve context** so they can return to the page they came from without relying on the browser back button.

Helpers live in [`src/lib/officeNav.ts`](../../src/lib/officeNav.ts).

### `return` query param

When linking from page A to page B, stamp the current path on the destination:

```typescript
import { officeLinkFromHere } from '../lib/officeNav.ts';

// From manage unit → record payment (return=/office/unit?unitId=…)
officeLinkFromHere('/office/payments');
```

The param name is `return`. Values must stay under `/office` (sanitized server- and client-side).

### Back link at page top

Detail and workflow pages show a **Back to …** control above the heading (`btn-ghost`, `text-sm`). Mount on load:

```typescript
import { mountOfficeBackLink } from '../lib/officeNav.ts';

mountOfficeBackLink({
  host: document.getElementById('office-back-link'),
  fallbackHref: '/office', // or '/office/leases' for lease documents
});
```

Top-level nav destinations (leases list, applications, etc.) show the back link **only when** `return` is present:

```typescript
mountOfficeBackLink({ host: ..., whenReturnOnly: true, fallbackHref: '/office' });
```

Markup pattern:

```html
<section>
  <div id="office-back-link"></div>
  <h1>…</h1>
</section>
```

Labels are derived automatically (`Back to dashboard`, `Back to manage unit`, etc.).

### After successful actions

When a form completes a sub-task (e.g. recording a payment), append a return link in the success status — do not leave the user on a dead end:

```typescript
import { officeSuccessWithReturn } from '../lib/officeNav.ts';

status.innerHTML = officeSuccessWithReturn('Payment recorded for 2026-08.');
```

### Checklist

1. Outbound office links from dashboard, unit, or list pages use `officeLinkFromHere`.
2. Destination pages mount `mountOfficeBackLink` with a sensible `fallbackHref`.
3. Successful submits on workflow pages call `officeSuccessWithReturn`.
4. Do not use raw `history.back()` or hard-coded back URLs when a `return` param is available.

## Interaction checklist

1. Show a spinner (loading region or busy button) as soon as the user acts or the page mounts data.
2. Use `apiFetch` for `/api/*` calls; pass `bindApiFetchStatus` so slow/retry messages replace the loading or busy label.
3. Keep the spinner until the promise settles (including automatic retries within the 3-minute budget).
4. On success, replace loading UI with results or a short inline confirmation.
5. On failure, clear loading UI and call `showErrorBanner` with the API error text when available; on budget exhaustion use `showApiExhaustedBanner`.
6. Always reset busy buttons in `finally`.

All async pages under `src/pages/` use `src/lib/apiFetch.ts` and `src/lib/uiFeedback.ts` — follow that pattern for new UI.

## CSS reference

| Class | Purpose |
|-------|---------|
| `wcp-spinner` | Default spinner (1.25rem) |
| `wcp-spinner-sm` | Spinner inside buttons (1rem) |
| `wcp-loading` | Inline loading row |
| `wcp-loading-block` | Centered panel loading |
| `is-busy` | Button busy state (with spinner inside button) |
| `wcp-alert` | Alert container |
| `wcp-alert-error` | Error styling |
| `wcp-alert-message` | Banner body text |
| `wcp-alert-actions` | Optional action row under the message |
| `wcp-alert-report` | Report an issue link after API budget exhaustion |
| `wcp-alert-dismiss` | Dismiss control |
