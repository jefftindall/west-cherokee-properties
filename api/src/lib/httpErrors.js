const MSG_GENERIC = 'Something went wrong. Share the reference below with support.';
const MSG_CONTACT_TURNSTILE = 'Please complete the verification check and try again.';
const MSG_CONTACT_VALIDATION = 'Please check the form fields and try again.';
const MSG_CONTACT_CONFIG =
  'Contact forms aren’t configured right now. Please try again later or use the email link on this page.';
const MSG_CONTACT_TEMPORARY = 'We couldn’t send your message right now. Please try again in a few minutes.';
const MSG_CONTACT_GENERIC =
  'Something went wrong while sending your message. Share the reference below if you need help.';

export function classifyHttpError(err) {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err || '');

  if (name === 'OfficeUnauthorizedError' || name === 'PortalUnauthorizedError') {
    return { errorKind: 'unauthorized', status: 401, error: message };
  }
  if (name === 'OfficeForbiddenError') {
    return { errorKind: 'forbidden', status: 403, error: message };
  }
  if (name === 'ContactValidationError' || name === 'ZodError' || name === 'ValidationError') {
    return { errorKind: 'validation', status: 400, error: message || MSG_CONTACT_VALIDATION };
  }
  if (name === 'ContactTurnstileRejected') {
    return { errorKind: 'turnstile_rejected', status: 400, error: MSG_CONTACT_TURNSTILE };
  }
  if (name === 'ContactTurnstileError') {
    return { errorKind: 'turnstile', status: 503, error: MSG_CONTACT_TEMPORARY };
  }
  if (name === 'ContactConfigError') {
    return { errorKind: 'config', status: 500, error: MSG_CONTACT_CONFIG };
  }
  if (name === 'NotFoundError') {
    return { errorKind: 'not_found', status: 404, error: message || 'Not found.' };
  }
  if (name === 'ConflictError') {
    return { errorKind: 'conflict', status: 409, error: message };
  }
  if (name === 'ContactAcsError' || /communication|acs/i.test(message)) {
    return { errorKind: 'acs', status: 500, error: MSG_CONTACT_GENERIC };
  }
  return { errorKind: 'unknown', status: 500, error: MSG_GENERIC };
}

export function failureResponse(err, correlationId) {
  const classified = classifyHttpError(err);
  return {
    status: classified.status,
    jsonBody: {
      error: classified.error,
      correlationId,
    },
    errorKind: classified.errorKind,
  };
}

export function jsonOk(jsonBody, status = 200) {
  return { status, jsonBody };
}

export function htmlOk(html, { filename, download = false } = {}) {
  const safeName = String(filename || 'wcp-lease.html').replace(/[^\w.-]/g, '-');
  return {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeName}"`,
    },
    body: html,
  };
}
