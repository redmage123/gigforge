export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
    this.name = this.constructor.name
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class NotFoundError extends AppError {
  constructor(msg = 'Not found') {
    super(404, msg)
  }
}

export class ConflictError extends AppError {
  constructor(msg = 'Conflict') {
    super(409, msg)
  }
}

export class UnauthorizedError extends AppError {
  constructor(msg = 'Unauthorized') {
    super(401, msg)
  }
}

export class ValidationError extends AppError {
  constructor(msg = 'Validation error') {
    super(422, msg)
  }
}
