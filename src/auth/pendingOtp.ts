let pendingCode = ''

export function rememberOtp(code: string) {
  pendingCode = code
}

export function readOtp() {
  return pendingCode
}

export function clearOtp() {
  pendingCode = ''
}
