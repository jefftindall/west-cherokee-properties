# UI style guide

**Audience:** Agents, implementers  
**Last updated:** 2026-08-30  
**Scope:** Brand tokens, layout primitives, buttons, and async interaction patterns for the public site, office, and portal.

Tokens live in [`src/styles/global.css`](../../src/styles/global.css). Brand constants live in [`src/lib/site.ts`](../../src/lib/site.ts). Shared async helpers live in [`src/lib/uiFeedback.ts`](../../src/lib/uiFeedback.ts). The wordmark is [`public/logo.png`](../../public/logo.png); the house mark is [`public/mark.png`](../../public/mark.png). Both files have a **transparent** background — do not place them on a black plate.

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

## Interaction checklist

1. Show a spinner (loading region or busy button) as soon as the user acts or the page mounts data.
2. Keep the spinner until the promise settles.
3. On success, replace loading UI with results or a short inline confirmation.
4. On failure, clear loading UI and call `showErrorBanner` with the API error text when available.
5. Always reset busy buttons in `finally`.

All async pages under `src/pages/` use `src/lib/uiFeedback.ts` — follow that pattern for new UI.

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
| `wcp-alert-dismiss` | Dismiss control |
