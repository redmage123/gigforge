# Information security policies (draft — needs management approval, owner, review date)

Owner: _[security owner]_ · Approved by: _[name, date]_ · Review: annually and after major change.

## 1. Information security
AssetAdvisor protects the confidentiality, integrity and availability of customer data. Security
responsibilities are assigned to a named security owner. Exceptions are documented with a reason,
an owner and an expiry date.

## 2. Risk management
A risk assessment is done yearly and after significant changes: assets, threats, likelihood, impact,
treatment, owner. Accepted risks are recorded (e.g. 2026-11-17: MFA deferred; python-jose advisory not
exploitable; walletconnect advisories pending upgrade).

## 3. Access control
- Least privilege. Firm roles (admin, pm, analyst, compliance, viewer) and portfolio grants
  (viewer, manager) are assigned to the minimum needed.
- Joiners are added by invitation or company SSO; leavers are removed or suspended the same day.
- Firm admins confirm an access review at least quarterly (recorded in the audit trail).
- Production infrastructure access: named administrators only, personal SSH keys, no shared accounts.
- Passwords: at least 10 characters; MFA required for administrators once enabled.

## 4. Cryptography
TLS for all traffic; HSTS. Passwords bcrypt-hashed. Stored third-party credentials encrypted (Fernet).
Encryption and signing keys are stored only in the credentials store, never in code, the data volume or
backups; rotation on suspected compromise and at least yearly.

## 5. Change management
All changes are version-controlled with a description, pass the automated tests, and are deployed with
the deploy tooling (drift check, backup, rollback). Schema changes are numbered migrations. Target:
every production change reviewed and approved by a second person.

## 6. Incident response
1. Detect (alerts, audit integrity check, user report) → 2. contain (suspend accounts, rotate keys,
block IPs at Cloudflare) → 3. assess scope from the audit trail → 4. notify affected customers without
undue delay (and regulators where required, e.g. GDPR 72 hours) → 5. recover from backup if needed →
6. post-incident review with actions. Keep an incident log.

## 7. Backup and recovery
Nightly encrypted database backups with an automated restore test; 14 days daily retention (target:
plus 12 monthly) stored off-site. RPO 24 h, RTO 4 h (targets). Restore drill twice a year.

## 8. Data retention and deletion
Customer financial records are kept while the account exists. Account deletion removes personal records
immediately; audit events are kept for 7 years with the actor anonymized. Backups age out after their
retention period.

## 9. Vendor management
Maintain the vendor list (system-description.md). Before onboarding and yearly: review the vendor's
security report (SOC 2 / ISO 27001), data processing terms and access scope.

## 10. Secure development
Dependencies scanned monthly (pip-audit, npm audit); high/critical issues fixed or risk-accepted within
30 days. Output encoding for user/AI content; CSP enforced. Security tests are part of the suite.
