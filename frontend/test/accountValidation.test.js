import assert from 'node:assert/strict'
import test from 'node:test'
import { getPasswordChangeValidationMessage } from '../src/accountValidation.js'

test('password change rejects mismatched confirmation', () => {
  assert.equal(
    getPasswordChangeValidationMessage('new-password', 'different-password'),
    'The new password and confirmation do not match.'
  )
})

test('password change rejects passwords shorter than six characters', () => {
  assert.equal(
    getPasswordChangeValidationMessage('short', 'short'),
    'Your new password must contain at least 6 characters.'
  )
})

test('password change accepts a matching valid password', () => {
  assert.equal(
    getPasswordChangeValidationMessage('new-password', 'new-password'),
    ''
  )
})
