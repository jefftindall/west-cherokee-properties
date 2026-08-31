/** Query param carrying the office page the user came from. */
export const OFFICE_RETURN_PARAM = 'return';

const OFFICE_ROOT = '/office';

const OFFICE_PAGE_LABELS: Record<string, string> = {
  '/office': 'dashboard',
  '/office/applications': 'applications',
  '/office/renters': 'renters',
  '/office/leases': 'leases',
  '/office/invoices': 'invoices',
  '/office/payments': 'payments',
  '/office/requests': 'service requests',
  '/office/access': 'access',
  '/office/unit': 'manage unit',
  '/office/legal-document': 'legal document',
  '/office/lease-document': 'lease document',
};

/** Keep return targets under /office only (open-redirect guard). */
export function sanitizeOfficeReturnPath(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith(OFFICE_ROOT)) return fallback;
  if (trimmed.startsWith('//') || trimmed.includes('://')) return fallback;
  return trimmed;
}

export function officePathname(path: string): string {
  return path.split('?')[0].replace(/\/+$/, '') || OFFICE_ROOT;
}

export function officeReturnLabel(path: string): string {
  const pathname = officePathname(path);
  if (OFFICE_PAGE_LABELS[pathname]) return OFFICE_PAGE_LABELS[pathname];
  if (pathname.startsWith('/office/leases/lease-')) return 'leases';
  return 'previous page';
}

export function officeBackLabel(path: string): string {
  return `Back to ${officeReturnLabel(path)}`;
}

export function officeCurrentPath(): string {
  if (typeof window === 'undefined') return OFFICE_ROOT;
  return window.location.pathname + window.location.search;
}

export function officeReturnPath(fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search);
  return sanitizeOfficeReturnPath(params.get(OFFICE_RETURN_PARAM), fallback);
}

/** Build an office href, optionally stamping the current page as `return`. */
export function officeHref(
  destPath: string,
  options: {
    returnTo?: string | null;
    params?: Record<string, string>;
  } = {},
): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://westcherokee.com';
  const url = new URL(destPath, base);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }
  const returnTo = options.returnTo === undefined ? officeCurrentPath() : options.returnTo;
  if (returnTo) {
    url.searchParams.set(OFFICE_RETURN_PARAM, returnTo);
  }
  return `${url.pathname}${url.search}`;
}

/** Convenience when linking forward from the page the user is on. */
export function officeLinkFromHere(destPath: string, params: Record<string, string> = {}): string {
  return officeHref(destPath, { params });
}

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function escapeHtml(value: string): string {
  return escapeAttr(value);
}

export type OfficeBackLinkOptions = {
  fallbackHref?: string;
  fallbackLabel?: string;
  label?: string;
  /** When true, render only if `return` is present in the URL. */
  whenReturnOnly?: boolean;
  host?: HTMLElement | null;
  className?: string;
};

/** Insert a back link at the top of an office section (client-side). */
export function mountOfficeBackLink(options: OfficeBackLinkOptions = {}): HTMLElement | null {
  if (typeof window === 'undefined') return null;

  const {
    fallbackHref = OFFICE_ROOT,
    fallbackLabel,
    label,
    whenReturnOnly = false,
    host,
    className = 'text-sm',
  } = options;

  const params = new URLSearchParams(window.location.search);
  const hasReturn = params.has(OFFICE_RETURN_PARAM);
  if (whenReturnOnly && !hasReturn) return null;

  const returnPath = officeReturnPath(fallbackHref);
  const text = label ?? fallbackLabel ?? officeBackLabel(returnPath);
  const el = document.createElement('p');
  el.className = className;
  el.innerHTML = `<a class="btn-ghost" href="${escapeAttr(returnPath)}">${escapeHtml(text)}</a>`;

  const container = host ?? document.querySelector('section');
  container?.insertBefore(el, container.firstChild);
  return el;
}

/** Append a return link after a success message (e.g. after recording a payment). */
export function officeSuccessWithReturn(message: string, fallbackHref = OFFICE_ROOT): string {
  const returnPath = officeReturnPath(fallbackHref);
  const action = `<a class="btn-ghost text-sm" href="${escapeAttr(returnPath)}">${escapeHtml(officeBackLabel(returnPath))}</a>`;
  return `${message} ${action}`;
}
