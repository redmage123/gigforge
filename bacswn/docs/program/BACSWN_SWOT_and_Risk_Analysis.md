# BACSWN — SWOT & Risk Analysis

**Document:** BACSWN-RISK-2026-008
**Classification:** CONFIDENTIAL — For Authorized Recipients Only
**Prepared for:** Owner & CEO, BACSWN (private delivery partner)
**Prepared by:** Sky Miles Limited — AI Elevate Division
**Version:** 1.0 — June 2026
**Companion to:** Master Framework Schedule (BACSWN-SCHED-2026-003); Mesh Architecture Master Plan (BACSWN-MARCH-2026-002)

---

## 1. Purpose

This document gives the owner/CEO a single strategic view of BACSWN's **strengths, weaknesses,
opportunities, and threats (SWOT)** and the **consolidated, living risk register** for the
implementation program. It is the authoritative risk artifact (maintained under WS-A — Program &
Governance) and supersedes the risk fragments embedded in the schedule, which it consolidates and
expands.

---

## 2. SWOT Analysis

### Strengths
- **Platform already built and live** — in production, security-reviewed (15/15), 137/137 tests; the
  hardest technical step is behind us.
- **Secured PPP (Build-Own-Operate)** — sole-source national infrastructure; no competitive bake-off to
  lose, and the partner owns and operates the asset.
- **Autonomous, sovereign mesh** — stations keep sensing, predicting, and warning even when the hub or
  an island is cut off; resilient exactly where centralized systems fail.
- **Engineered survivability** — Cat 4/5 hardening with a satellite lifeline; link budgets confirm the
  design (Architecture Annex A).
- **Defense-grade security** — full end-to-end cryptography (hardware root-of-trust, PKI, FIPS-grade,
  post-quantum path).
- **One feed, three missions** — a single surveillance layer drives safety, overflight-fee accounting,
  and CORSIA carbon — efficient and hard to replicate.
- **National-response backbone** — deep emergency-services integration (NEMA, Police, Fire/Rescue, RBDF,
  shelters) via a shared Common Operating Picture.
- **User-funded model** — recurring revenue tied to airline overflight/landing fees over busy oceanic
  airspace (a diversified, hard-currency demand base).

### Weaknesses
- **Remote-island O&M** — the most critical sites (Inagua, Mayaguana, Ragged Island) are the hardest and
  costliest to reach; sustainment is the program's hardest ongoing task.
- **Long-lead, ITAR-controlled radar** — the Raytheon primary-radar program is a dependency with export
  licensing and heavy civil works.
- **External-feed reliance** — Iridium satellite and Tomorrow.io are third-party (mitigated as
  supplementary, but real).
- **Edge-hardware obsolescence** — Jetson-class compute evolves fast over a long BOO life.
- **VHF horizon limits** — some hops exceed practical line-of-sight and depend on relay/satellite.
- **Initial local skills gap** — Bahamian operating capacity must be built (addressed by BACSWN-TRN-2026-007).
- **Program complexity** — 18 parallel workstreams across 24 months is significant execution surface.

### Opportunities
- **Regional replication** — the platform/IP could template to other hurricane-exposed Caribbean and
  small-island states (optional future upside).
- **Research & academic partnerships** — a distributed edge-AI weather network attracts collaboration
  and talent.
- **Technology transfer** — mesh, consensus, and edge-AI methods have wider application.
- **Climate-resilience funding** — the safety/impact case attracts grants and development partners.
- **National capability & leadership** — positions the Bahamas as a regional aviation-weather leader.
- **Adjacent services** — value-added products on the airspace, weather, and emissions data.

### Threats
- **Major hurricane during deployment** — a strike on a partially-built network.
- **Air-traffic volume shock** — pandemic-type downturn cutting the fee-based revenue.
- **Regulatory / ITAR / spectrum delay** — URCA spectrum and US radar export licensing on the critical path.
- **Political / mandate continuity** — administration change or re-scoping.
- **Cyber or physical attack** — critical national infrastructure is a target.
- **Supply-chain / vendor disruption** — edge hardware, radar, satellite.
- **Environmental constraints** — protected-area issues forcing site changes.

---

## 3. Risk Assessment Method

Each risk is scored **Likelihood (L) × Impact (I)** on a 1–5 scale; severity bands: **1–6 Low**,
**8–12 Medium**, **15–25 High/Critical**. Residual = rating after the stated mitigation. Owners map to
schedule workstreams (WS-A…R).

---

## 4. Consolidated Risk Register

| ID | Category | Risk | L×I | Severity | Mitigation | Residual | Owner |
|----|----------|------|:---:|:--------:|-----------|:--------:|-------|
| R01 | Force majeure | Hurricane strikes **partially-deployed** network | 4×5 | **Critical** | South-to-north sequencing; satellite fallback live before June 1; pilot/remote sites first | Medium | WS-A/C |
| R02 | Force majeure | **In-service** major hurricane damages live sites | 3×4 | High | Cat 4/5 hardening; satellite survival core; pre-positioned spares; post-storm drone-first assessment | Medium | WS-G/I |
| R03 | Regulatory | **VHF spectrum (URCA)** licensing delay | 3×4 | High | File M1; satellite/cellular interim path | Low | WS-B |
| R04 | Regulatory | **Raytheon radar — ITAR/export** delay or install complexity | 4×4 | **Critical** | File ITAR + order at M1; parallel civil works; phased install; ADS-B + Tomorrow.io interim coverage | Medium | WS-P/B |
| R05 | Environmental | Land rights / permitting / protected-area delay (gates civil works) | 3×4 | High | Start M0; engage authorities early; prioritize pilot+radar sites; hold re-siting options | Low | WS-Q |
| R06 | Commercial / demand | **Air-traffic volume** downturn cuts overflight/landing-fee revenue | 3×4 | High | Diversified airline base; minimum-traffic floor in concession; opex flexibility | Medium | WS-A |
| R07 | Commercial | Fee collection / remittance via civil-aviation authority | 2×3 | Medium | Contractual fee-share & remittance terms; reconciliation in metering (REV-1) | Low | WS-A/L |
| R08 | Security | **Cyber or physical attack** on critical infrastructure | 3×5 | **Critical** | End-to-end crypto (§4.4); SecOps/IR; pen-testing; tamper-zeroization; physical site security | Medium | WS-J |
| R09 | Technical | Edge-AI model underperformance | 3×3 | Medium | Hub-based fallback models; phased validation per gate | Low | WS-F |
| R10 | Supply chain | Edge-hardware supply disruption | 3×3 | Medium | Pre-order; qualified second sources (Pi 5 + Coral, AMD/Xilinx) | Low | WS-D |
| R11 | Technical / lifecycle | Edge-hardware **obsolescence** over BOO life | 3×3 | Medium | Refresh roadmap; modular FRU design; second sources | Medium | WS-D/I |
| R12 | Technical | VHF horizon limits leave coverage gaps | 2×3 | Medium | Multi-hop routing; satellite overlay; link-budget verification at SAT (Annex A) | Low | WS-C |
| R13 | Vendor | **Dependency / lock-in** (Raytheon, Iridium, Tomorrow.io) | 3×3 | Medium | Treat external feeds as supplementary; support contracts; avoid sole-source critical paths | Medium | WS-A/L |
| R14 | Regulatory | U.S./military **data-sharing** agreement delayed (military track fusion) | 3×3 | Medium | Commercial ADS-B first; pursue MOU early; primary-radar fallback | Low | WS-L/O |
| R15 | Regulatory | Drone/UAS approval (BCAA) | 2×3 | Medium | Early BCAA engagement; use own air picture for deconfliction | Low | WS-N |
| R16 | Operational | **Remote-island O&M access** (cost, weather, logistics) | 4×3 | High | Regional service hubs; drone-assisted triage; predictive maintenance; satellite keeps sites reporting | Medium | WS-I |
| R17 | Operational / people | **Local skills gap** / staffing for sovereign operation | 3×3 | Medium | Training & Capacity-Building Plan; train-the-trainer; academic partnerships; phased localization | Low | WS-R |
| R18 | Political | Administration change / mandate continuity | 2×4 | Medium | BOO asset ownership; essential-service status; contractual term protections | Medium | WS-A |
| R19 | Program | Execution complexity across 18 workstreams | 3×3 | Medium | Phase gates; PMO; critical-path focus; change control; consolidated risk reviews | Low | WS-A |

---

## 5. Top Risks (focus list)

The **critical-band** risks demanding continuous owner/CEO attention:
1. **R01 — Hurricane during deployment** (sequencing + satellite-first remote sites).
2. **R04 — Raytheon radar / ITAR** (longest defense lead time; file and order at M1).
3. **R08 — Cyber/physical attack** (security is a design baseline, not an add-on).

High-band watch list: **R03** (URCA), **R05** (permitting), **R06** (air-traffic demand), **R16**
(remote O&M).

---

## 6. Risk Governance

- **Living register:** this document is maintained under WS-A; risks re-scored and residuals reviewed at
  the schedule's governance cadence (weekly RAG to owner/CEO; monthly review).
- **Escalation:** any risk moving into the critical band, or a new critical risk, is escalated to the
  owner/CEO immediately.
- **Gate linkage:** open critical/major risks block the relevant phase gate (per the V&V plan).
- **Contingency:** schedule float and re-siting/second-source options are held for the highest-impact
  dependencies (radar, permitting, supply chain).

---

*See also: Master Framework Schedule §7 (schedule-impacting risks, now consolidated here); V&V Plan
(BACSWN-VV-2026-006); O&M Plan (BACSWN-OM-2026-004); Training & Capacity-Building Plan (BACSWN-TRN-2026-007).*
