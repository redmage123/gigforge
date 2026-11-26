/**
 * BACSWN frontend error hierarchy.
 *
 * What: a base class, BacswnError, and the subclasses the UI throws: ApiError (the
 * server answered with an error), AuthError (the session has expired) and
 * UploadError (a file could not be prepared for upload).
 *
 * Why: callers can tell BACSWN's own, user-safe failures apart from programming
 * errors (`err instanceof BacswnError`), show `err.message` directly, and branch on
 * the kind of failure (for example an ApiError's HTTP status) instead of parsing text.
 *
 * How: plain ES classes extending Error. Each sets `name` so stack traces and logs
 * show the specific type; ApiError also carries the HTTP status and response body.
 */

/** Base class for every error the BACSWN frontend throws on purpose; the message is safe to show. */
export class BacswnError extends Error {
  /** @param {string} message user-safe description of what went wrong */
  constructor(message) {
    super(message)
    this.name = this.constructor.name
  }
}

/** The API answered with a non-success status. */
export class ApiError extends BacswnError {
  /**
   * @param {string} message user-safe message (the server's `error` field when present)
   * @param {number} status HTTP status code
   * @param {object|null} body parsed response body, if any
   */
  constructor(message, status, body = null) {
    super(message)
    this.status = status
    this.body = body
  }
}

/** The session is missing or expired; the user must sign in again. */
export class AuthError extends BacswnError {}

/** A file could not be read or is unsuitable for upload (for example, too large). */
export class UploadError extends BacswnError {}
