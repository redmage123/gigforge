# AssetAdvisor: SOC 2 readiness

Status as of 2026-11-17. SOC 2 is an attestation by an independent CPA firm. This folder holds what the
auditor will ask for first: the system description, the control matrix with evidence pointers, and the
policies. It does not make AssetAdvisor "SOC 2 compliant"; that takes a Type I report (controls designed
correctly at a point in time) and then a Type II report (controls operating over 3–12 months).

| File | What it is |
|---|---|
| [system-description.md](system-description.md) | Scope: what the service is, components, data, people, boundaries |
| [controls.md](controls.md) | Trust Services Criteria mapped to AssetAdvisor controls: status, evidence, gaps |
| [policies.md](policies.md) | Information security policies (draft for management approval) |
| [hosting-plan.md](hosting-plan.md) | Moving production to dedicated, access-controlled infrastructure before the audit |

Recommended scope: Security (required) + Availability + Confidentiality. Processing Integrity and Privacy
can follow later.

## Path to a report

1. **Now (done in code):** controls in [controls.md](controls.md) marked *Implemented*.
2. **Before a Type I (≈ 1–3 months):** close the *Gap* items, chiefly dedicated hosting
   ([hosting-plan.md](hosting-plan.md)), off-site encrypted backups, MFA, a named security owner,
   management approval of the policies, vendor reviews, an external penetration test.
3. **Type I audit** with a CPA firm (typical small-company cost USD 10–30k; a compliance platform such
   as Vanta, Drata or Secureframe, ~USD 7–20k/year, automates evidence collection).
4. **Observation period (3–12 months), then Type II.**
