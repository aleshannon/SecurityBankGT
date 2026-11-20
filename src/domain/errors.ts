export class AppError extends Error {
  code: string

  constructor(message: string, code = 'app') {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export function errorText(error: unknown): string {
  if (error instanceof AppError) return error.message
  return 'No se pudo completar la operación. Inténtelo de nuevo.'
}
