/** Shared async loading, busy buttons, and dismissible error banners. See docs/architecture/ui-style-guide.md. */

import {
  isApiFetchExhausted,
  type ApiFetchStatus,
} from './apiFetch.ts';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function setButtonBusy(
  button: HTMLButtonElement | null,
  busy: boolean,
  busyLabel?: string,
) {
  if (!button) return;
  if (busy) {
    if (!button.dataset.wcpOriginalLabel) {
      button.dataset.wcpOriginalLabel = button.textContent?.trim() || '';
    }
    button.classList.add('is-busy');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const label = busyLabel || `${button.dataset.wcpOriginalLabel}…`;
    button.innerHTML = `<span class="wcp-spinner wcp-spinner-sm" aria-hidden="true"></span>${escapeHtml(label)}`;
    return;
  }
  button.classList.remove('is-busy');
  button.disabled = false;
  button.removeAttribute('aria-busy');
  button.textContent = button.dataset.wcpOriginalLabel || button.textContent || '';
}

export function renderLoading(
  host: HTMLElement | null,
  message = 'Loading…',
  { block = false }: { block?: boolean } = {},
) {
  if (!host) return;
  host.dataset.wcpLoading = 'true';
  host.dataset.wcpLoadingBlock = block ? 'true' : 'false';
  host.innerHTML = `<div class="${block ? 'wcp-loading-block' : 'wcp-loading'}" role="status" aria-live="polite"><span class="wcp-spinner" aria-hidden="true"></span><span class="wcp-loading-message">${escapeHtml(message)}</span></div>`;
}

/** Update the message on an existing loading region without remounting the spinner. */
export function updateLoading(host: HTMLElement | null, message: string) {
  if (!host) return;
  const label = host.querySelector('.wcp-loading-message');
  if (label) {
    label.textContent = message;
    return;
  }
  const block = host.dataset.wcpLoadingBlock === 'true';
  renderLoading(host, message, { block });
}

export function clearLoading(host: HTMLElement | null) {
  if (!host) return;
  delete host.dataset.wcpLoading;
  delete host.dataset.wcpLoadingBlock;
  host.innerHTML = '';
}

export type ErrorBannerOptions = {
  replace?: boolean;
  /** When set, append a Report an issue link (typically after apiFetch budget exhaustion). */
  reportIssueHref?: string;
};

export function reportIssueHref(context?: string): string {
  const params = new URLSearchParams();
  params.set('issue', 'api-timeout');
  if (context) params.set('from', context);
  else if (typeof location !== 'undefined') params.set('from', location.pathname + location.search);
  return `/contact?${params.toString()}`;
}

export function showErrorBanner(
  host: HTMLElement | null,
  message: string,
  { replace = true, reportIssueHref: issueHref }: ErrorBannerOptions = {},
) {
  if (!host) return null;
  if (replace) host.innerHTML = '';
  const banner = document.createElement('div');
  banner.className = 'wcp-alert wcp-alert-error';
  banner.setAttribute('role', 'alert');
  const reportHtml = issueHref
    ? `<p class="wcp-alert-actions"><a class="wcp-alert-report" href="${escapeHtml(issueHref)}">Report an issue</a></p>`
    : '';
  banner.innerHTML = `<div class="wcp-alert-body"><p class="wcp-alert-message">${escapeHtml(message)}</p>${reportHtml}</div><button type="button" class="wcp-alert-dismiss" aria-label="Dismiss error">×</button>`;
  banner.querySelector('.wcp-alert-dismiss')?.addEventListener('click', () => banner.remove());
  host.append(banner);
  return banner;
}

/** Error banner for apiFetch budget exhaustion (includes Report an issue). */
export function showApiExhaustedBanner(
  host: HTMLElement | null,
  err?: unknown,
  { context, replace = true }: { context?: string; replace?: boolean } = {},
) {
  const message =
    isApiFetchExhausted(err) && err.message
      ? err.message
      : 'This is taking too long. Please report an issue so we can look into it.';
  return showErrorBanner(host, message, { replace, reportIssueHref: reportIssueHref(context) });
}

export function clearErrorBanner(host: HTMLElement | null) {
  if (!host) return;
  host.querySelectorAll('.wcp-alert-error').forEach((node) => node.remove());
}

export type ApiStatusUi = {
  loadingHost?: HTMLElement | null;
  button?: HTMLButtonElement | null;
  /** Optional status line (role=status) for forms without a loading host. */
  statusEl?: HTMLElement | null;
};

/** Wire apiFetch onStatus updates into loading / busy / status UI. */
export function bindApiFetchStatus(ui: ApiStatusUi): (status: ApiFetchStatus) => void {
  return (status) => {
    if (ui.loadingHost?.dataset.wcpLoading === 'true') {
      updateLoading(ui.loadingHost, status.message);
    }
    if (ui.button?.classList.contains('is-busy')) {
      setButtonBusy(ui.button, true, status.message);
    }
    if (ui.statusEl) {
      ui.statusEl.textContent = status.message;
    }
  };
}
