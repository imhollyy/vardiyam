import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAccountForm } from '../../src/features/account/validation.ts';

test('sign-in checks a basic email shape and non-empty password', () => {
  assert.deepEqual(validateAccountForm('sign-in', 'person@example.com', 'x', ''), {
    email: false, password: false, confirmation: false,
  });
  assert.deepEqual(validateAccountForm('sign-in', 'not-an-email', '', ''), {
    email: true, password: true, confirmation: false,
  });
});

test('sign-up requires matching confirmation without assuming provider password policy', () => {
  assert.deepEqual(validateAccountForm('sign-up', ' person@example.com ', 'short', 'short'), {
    email: false, password: false, confirmation: false,
  });
  assert.deepEqual(validateAccountForm('sign-up', 'person@example.com', 'secret', 'different'), {
    email: false, password: false, confirmation: true,
  });
});
