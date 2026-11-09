export function getPasswordChangeValidationMessage(newPassword, confirmation) {
  if (newPassword !== confirmation) {
    return 'The new password and confirmation do not match.'
  }
  if (newPassword.length < 6) {
    return 'Your new password must contain at least 6 characters.'
  }
  return ''
}
