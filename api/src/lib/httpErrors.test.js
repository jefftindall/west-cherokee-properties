import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyHttpError } from './httpErrors.js';
import { OfficeForbiddenError } from './officeAccess.js';

test('classifyHttpError maps office forbidden to 403', () => {
  const classified = classifyHttpError(new OfficeForbiddenError());
  assert.equal(classified.status, 403);
  assert.equal(classified.errorKind, 'forbidden');
});
