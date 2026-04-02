# ADR-0005: Authentication Strategy

## Status: Accepted

## Context

The application is an internal tool for 5 recruiters. The client specified JWT with email/password authentication. There is no public registration — user accounts are created by the admin. We must decide: JWT storage mechanism (localStorage vs httpOnly cookie), token expiry, and logout implementation.

## Decision

**JWT stored in localStorage, 24-hour expiry, in-memory token blacklist for logout.**

**Why localStorage over httpOnly cookies:**
The application is an SPA (Vite/React) with an API on a different origin in development (`localhost:3000` → `localhost:4000`). Configuring SameSite cookies across origins in Docker Compose requires additional Nginx and Express `cookie-parser` configuration that adds complexity without meaningful security benefit for an internal tool. The team has 5 known users accessing the app from known devices. We accept the XSS risk of localStorage because:
1. Tailwind renders no user-supplied HTML unsanitised (no dangerouslySetInnerHTML)
2. The attack surface is internal-only (no public internet traffic)
3. The contact data, while business-sensitive, is not financial or medical data

The Axios interceptor automatically attaches `Authorization: Bearer <token>` to every API request.

**Token expiry:** 24 hours. Long enough that recruiters aren't interrupted mid-day by re-login prompts; short enough that a stolen token has a bounded useful window.

**Logout:** Token added to an in-memory Set on the API server. All protected middleware checks this Set before accepting a request. A server restart clears the blacklist — acceptable for this use case. If the client later requires persistent logout across restarts, the blacklist can be moved to a PostgreSQL table (migration ready to go as `007_token_blacklist.sql`).

**No refresh tokens for MVP.** Refresh token rotation adds significant implementation complexity (rotation, theft detection, revocation) that is not justified for a 5-user internal tool. If the client requests it post-delivery, we implement it as a paid enhancement.

## Alternatives Considered

- **httpOnly cookies + CSRF tokens** — More secure against XSS, but requires: `SameSite=None; Secure` for cross-origin Docker setup, CORS `credentials: true`, CSRF token generation, and `cookie-parser` on Express. For an internal tool on a private network, the additional security surface is not worth the complexity within a 2-week window.
- **Passport.js** — Adds another abstraction over jsonwebtoken with no benefit for a single auth strategy (local email/password). We use jsonwebtoken directly.
- **OAuth2 / SSO (Google, Azure AD)** — Would be excellent for the client's long-term security posture. Not in scope for MVP. Documented as a future enhancement in README.
- **Database-stored sessions** — Session tokens in PostgreSQL are more revocable than JWTs but require a DB query on every request. For 5 users, this is acceptable, but JWT + in-memory blacklist achieves the same result at near-zero latency.

## Consequences

- **Positive:** Simple implementation — jsonwebtoken has a 1-hour learning curve. No session tables, no Redis dependency.
- **Positive:** Stateless validation on every API request — no DB query needed to verify a valid (non-blacklisted) token.
- **Negative:** localStorage is theoretically vulnerable to XSS. Mitigated by ensuring no user-supplied HTML is ever rendered unsanitised in the React app.
- **Negative:** In-memory blacklist is lost on API server restart. For a 5-user internal tool this is acceptable — all tokens expire in 24 hours anyway.
- **Risk:** No refresh token means users are fully logged out after 24 hours. Recruiters must re-login each day. Considered acceptable and documented in the user guide.
