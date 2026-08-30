/** Shared async loading, busy buttons, and dismissible error banners. See docs/architecture/ui-style-guide.md. */

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
  host.innerHTML = `<div class="${block ? 'wcp-loading-block' : 'wcp-loading'}" role="status" aria-live="polite"><span class="wcp-spinner" aria-hidden="true"></span><span>${escapeHtml(message)}</span></div>`;
}

export function clearLoading(host: HTMLElement | null) {
  if (!host) return;
  delete host.dataset.wcpLoading;
  host.innerHTML = '';
}

export function showErrorBanner(
  host: HTMLElement | null,
  message: string,
  { replace = true }: { replace?: boolean } = {},
) {
  if (!host) return null;
  if (replace) host.innerHTML = '';
  const banner = document.createElement('div');
  banner.className = 'wcp-alert wcp-alert-error';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = `<p class="wcp-alert-message">${escapeHtml(message)}</p><button type="button" class="wcp-alert-dismiss" aria-label="Dismiss error">×</button>`;
  banner.querySelector('.wcp-alert-dismiss')?.addEventListener('click', () => banner.remove());
  host.append(banner);
  return banner;
}

export function clearErrorBanner(host: HTMLElement | null) {
  if (!host) return;
  host.querySelectorAll('.wcp-alert-error').forEach((node) => node.remove());
}
