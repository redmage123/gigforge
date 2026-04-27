interface FieldError {
  field: string
  message: string
}

export function errorResponse(
  status: number,
  message: string,
  errors?: FieldError[],
): Response {
  const body: Record<string, unknown> = { message, status }
  if (errors && errors.length > 0) {
    body.errors = errors
  }
  return Response.json({ error: body }, { status })
}
