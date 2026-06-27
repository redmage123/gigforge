# BACSWN — Data Governance & Sovereignty Policy

**Document:** BACSWN-GOV-2026-005
**Classification:** CONFIDENTIAL — For Authorized Recipients Only
**Prepared for:** Owner & CEO, BACSWN (private delivery partner) / Ministry of Transport & Aviation
**Prepared by:** Sky Miles Limited — AI Elevate Division
**Version:** 1.1 — June 2026
**Companion to:** Mesh Architecture Master Plan (BACSWN-MARCH-2026-002, esp. §4.4 cryptography and §8 integration)
**Change log:** v1.1 adds the trusted AI supply-chain clause (no Chinese-built models) in §6.

---

## 1. Purpose & Principle

BACSWN generates and exchanges data that is operationally sensitive (airspace, military tracks) and
nationally important (weather, emergency, aviation revenue). This policy defines who owns it, where it
lives, how long it is kept, and the rules for sharing it — especially across police, defence, and
foreign (U.S./ICAO) boundaries.

**Founding principle — Bahamian data sovereignty.** All BACSWN operational data is the property of the
**Commonwealth of The Bahamas**. The delivery partner operates the system and is a **data processor /
custodian**, not the owner. Cross-border sharing is **bilateral, least-privilege, and revocable**, and
never transfers ownership.

---

## 2. Data Classification

| Class | Examples | Handling |
|-------|----------|----------|
| **Public** | Public weather, SIGMETs, hurricane advisories | Freely publishable through official channels |
| **Operational** | METAR/observations, commercial flight tracks, sensor/mesh telemetry | Internal + authorized agencies; encrypted in transit/at rest |
| **Restricted** | Overflight/landing-fee records, emergency-response coordination, shelter occupancy | Need-to-know; agency-scoped access; full audit |
| **Sensitive / National-Security** | Military / non-cooperative tracks, defence data-share feeds | Strict least-privilege; defence-grade handling; segregated; access logged and reviewed |

Personal data (e.g., any identifiable evacuee/shelter records) is minimized, access-controlled, and
governed by Bahamian data-protection law (§6).

---

## 3. Data Residency & Sovereignty

- **Primary residency:** BACSWN data resides on **Bahamian-controlled infrastructure** (primary hub +
  off-island standby under national control — Architecture §4.5).
- Any cloud/standby region used for resilience operates under contractual terms that preserve national
  ownership, access control, and the right to repatriate/delete.
- **No foreign sole-custody:** no class of national-security data is held solely on foreign
  infrastructure.

---

## 4. Retention, Archival & Disposal

- **Retention schedule by class:** operational telemetry (rolling + archived for verification/training),
  fee records (retained per audit/revenue requirements), emergency/incident records (retained per NEMA
  and legal requirements), security/audit logs (long-retention, tamper-evident).
- **Archival:** encrypted, off-island backups with point-in-time recovery (ties to O&M §7 / Architecture
  §4.5).
- **Secure disposal:** cryptographic erasure at end of retention; decommissioned nodes have keys/data
  zeroized (Architecture §4.4.1 tamper-zeroization).

---

## 5. Access Control & Sharing

- **Least-privilege RBAC**, MFA, and full audit on every operator and agency interface (Architecture
  §4.4.6).
- **Inter-agency sharing (NEMA, Police, Fire/Rescue, RBDF/Coast Guard):** scoped to each agency's role
  via the Common Operating Picture and CAP/EDXL; sensitive military tracks shared only with cleared
  recipients.
- **International sharing (ICAO OPMET/WAFS; future U.S. — NOAA/NHC, FAA Miami Oceanic, NORAD):** governed
  by **bilateral agreements / MOUs** specifying exactly which data classes flow, in which direction, for
  what purpose; **revocable**, time-bounded, and logged. Defence data-sharing carries its own clearance.
- All sharing inherits the §4.4 cryptographic controls (mutual TLS, signed envelopes); no plaintext
  cross-boundary path.

---

## 6. Compliance & Privacy

- **Bahamian Data Protection Act** for any personal data; data minimization by default.
- **ICAO/WMO** data-exchange and security guidance for aviation/meteorological data.
- Alignment with the security standards in Architecture §4.4.9 (**FIPS 140-3, NIST SP 800-53, IEC
  62443**).
- **Trusted AI supply chain:** all AI/ML models used anywhere in BACSWN (the edge 2-of-3 ensemble and
  any hub-side models) must be from **trusted, non-Chinese sources** — no Chinese-built model weights or
  training pipelines — with **documented provenance and integrity verification**. This protects
  national-security data and aligns with US/allied (FAA/NORAD) interoperability.

---

## 7. Roles & Responsibilities

| Role | Responsibility |
|------|----------------|
| **Data Owner** | Commonwealth of The Bahamas (Ministry of Transport & Aviation) — sets policy, authorizes sharing |
| **Data Custodian / Processor** | BACSWN delivery partner — operates, protects, and audits per this policy |
| **Data Stewards** | Named leads per domain (weather, surveillance/fees, emergency, security) |
| **Agency recipients** | NEMA, Police, Fire/Rescue, RBDF — accountable for data received under their scope |

---

## 8. Incident, Breach & Audit

- **Breach response:** detection → containment → notification to the Data Owner and affected agencies →
  remediation, within defined timelines; tied to the SecOps incident-response process (O&M §7).
- **Audit:** immutable audit logs; periodic governance review; access recertification.
- **Change control:** any change to sharing scope (especially national-security or cross-border) requires
  Data Owner approval.

---

*See also: Master Framework Schedule gate **GOV-1** (policy approved, M4); Architecture §4.4
(cryptography), §4.5 (hub DR/backup), §8 (inter-agency & international integration).*
