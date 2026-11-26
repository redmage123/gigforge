"""BACSWN exception hierarchy.

What: one base class, ``BacswnError``, and a small set of subclasses for the kinds of
failure the platform reports (bad input, missing records, refused access, broken
configuration, an unavailable upstream service). Domain modules subclass these
(for example ``OversightError``, ``RegistryError``, ``AIUnavailable``).

Why: every error raised by BACSWN code can then be caught with a single
``except BacswnError`` and turned into a consistent HTTP response, while a caller that
cares about one kind of failure can still catch just that subclass. Third-party
exceptions (httpx, sqlite, json) are caught at the boundary and re-raised as one of
these so they never leak out as unexplained 500s.

How: each class carries an HTTP ``status`` and a message that is safe to show to the
user. ``main.py`` registers an exception handler that renders any ``BacswnError`` as
``{"error": message, "detail": message}`` with that status. Validation errors also
subclass ``ValueError`` so existing ``except ValueError`` handling keeps working.
"""


class BacswnError(Exception):
    """Base class for every error raised by BACSWN code.

    The message must be safe to show to an end user (no secrets, stack details or
    internal paths). ``status`` is the HTTP status the API should answer with.
    """

    status: int = 500

    def __init__(self, message: str, status: int | None = None):
        """Store the user-safe message and, optionally, override the default HTTP status."""
        super().__init__(message)
        if status is not None:
            self.status = status

    @property
    def message(self) -> str:
        """The user-safe message passed to the constructor."""
        return str(self)


class BacswnValidationError(BacswnError, ValueError):
    """Input failed validation (HTTP 400). Also a ``ValueError`` for existing callers."""

    status = 400


class BacswnNotFoundError(BacswnError, LookupError):
    """A requested record does not exist (HTTP 404)."""

    status = 404


class BacswnPermissionError(BacswnError, PermissionError):
    """The caller is not allowed to perform the action (HTTP 403)."""

    status = 403


class BacswnConfigError(BacswnError, RuntimeError):
    """The server is misconfigured, e.g. a required setting is missing (HTTP 500)."""

    status = 500


class BacswnUnavailableError(BacswnError, RuntimeError):
    """An upstream service or optional feature is unavailable right now (HTTP 503)."""

    status = 503
