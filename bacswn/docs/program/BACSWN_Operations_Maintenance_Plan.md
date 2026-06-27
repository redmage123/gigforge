# BACSWN — Operations & Maintenance (O&M) / Day-2 Sustainment Plan

**Document:** BACSWN-OM-2026-004
**Classification:** CONFIDENTIAL — For Authorized Recipients Only
**Prepared for:** Owner & CEO, BACSWN (private delivery partner)
**Prepared by:** Sky Miles Limited — AI Elevate Division
**Version:** 1.0 — June 2026
**Companion to:** Mesh Architecture Master Plan (BACSWN-MARCH-2026-002); Master Framework Schedule (BACSWN-SCHED-2026-003)

---

## 1. Purpose

The Master Architecture Plan describes what is built; this plan describes how it is **kept running for
years** under a Build-Own-Operate model. It covers monitoring, support, field maintenance across 15
unmanned island sites plus radar/IoT/drones, spares and logistics, service levels, staffing, and
lifecycle. Day-2 sustainment is the hardest part of this program precisely because the network's most
critical sites are the hardest to reach.

---

## 2. Operating Model

- **24×7 Network Operations Centre (NOC)** in Nassau, with the off-island standby hub (Architecture
  §4.5) able to assume NOC functions if Nassau is lost.
- **Tiered support:**
  - **T1 — NOC operators:** monitor health, triage alerts, run runbooks, dispatch field tasks.
  - **T2 — Engineers (comms / edge / radar / software):** remote diagnosis, configuration, OTA.
  - **T3 — Specialists & vendors:** Raytheon (radar), Iridium, edge-hardware, deep software.
- **Autonomy-aware operations:** because stations self-heal and run autonomously, the NOC manages by
  *exception and consensus*, not by babysitting every node.

---

## 3. Monitoring & Observability

- Every node self-reports sensor health, link quality, battery state, and security posture via
  `HEARTBEAT`; the NOC dashboard renders live topology, autonomous-mode flags, and consensus state.
- **Predictive maintenance:** trend battery degradation, solar yield, signal quality, and sensor drift
  to schedule visits *before* failure — essential when a site visit means a boat or a plane.
- **Alerting thresholds** tied to severity; security events route to the SecOps/incident-response path.

---

## 4. Field Service & Island Logistics

The decisive O&M challenge. Remote sites (Inagua, Mayaguana, Ragged Island, Chub Cay, San Salvador)
have no resident staff and limited, weather-dependent access.

- **Regional service hubs:** Nassau (central), Freeport (north), and a southern hub (e.g., Long Island
  or Exuma) holding technicians and spares to cut travel time to the remote edge.
- **Access logistics:** scheduled mail-boat / inter-island flight slots, plus a charter (boat/air)
  arrangement for urgent dispatch; **drone-assisted inspection** (Architecture §9.2) to triage before
  committing a crew.
- **Visit batching:** preventive maintenance batched per island cluster to amortize travel; emergency
  visits reserved for survival-core faults.
- **Hurricane ops:** pre-season inspection sweep; post-storm rapid assessment (drones first, then crews
  south-to-north) with pre-positioned spares.

---

## 5. Spares, Logistics & Obsolescence

- **Spares pool** sized from reliability data, held at the three regional hubs: edge nodes, VHF radios,
  Iridium transceivers, sensors, SPDs, batteries, solar components.
- **Field-replaceable units (FRUs):** design favors swap-and-return so a visit is short; failed units
  RMA'd to depot or vendor.
- **Radar (Raytheon) sustainment:** dedicated spares + vendor support contract; note **ITAR/export
  controls** apply to radar spares movement and must be pre-cleared (mirrors Schedule risk R10).
- **Obsolescence management:** edge hardware (Jetson) and radios evolve fast — a refresh/qualified
  second-source plan (Raspberry Pi 5 + Coral, AMD/Xilinx) keeps the fleet serviceable over the BOO life.

---

## 6. Service Levels (targets)

| Service | Target |
|---------|--------|
| Network availability (mesh, ≥N-1 nodes) | ≥ 99.5% |
| Survival-core availability (alerting via satellite + local broadcast) | ≥ 99.9% |
| Hazard detection → advisory issued | minutes (automated) |
| NOC response to a critical node alarm | ≤ 15 min |
| Remote (software/config/OTA) fix | ≤ 4 h |
| Field dispatch — main islands | ≤ 48 h (weather permitting) |
| Field dispatch — remote edge | best-effort by next access window; satellite keeps the site reporting meanwhile |
| Hub failover (RTO) | minutes; **RPO** near-zero via replication |

*SLA values are operating targets to be confirmed with the customer; remote-island response is access-
and weather-constrained by nature, mitigated by the satellite survival core.*

---

## 7. Software & Security Sustainment

- **OTA pipeline:** signed firmware/model updates with A/B rollback (Architecture §4.4.5); staged
  rollout (canary → fleet).
- **SecOps:** continuous monitoring, incident response, periodic penetration testing, vulnerability and
  patch management, certificate/key rotation (Architecture §4.4).
- **Configuration management & as-built:** authoritative per-site configuration register and as-built
  records; a digital-twin view of the fleet for change control.
- **Backup/DR:** encrypted off-island backups; periodic hub-failover and data-restore drills.

---

## 8. Staffing & Training

- **NOC roster** for true 24×7 (operators across shifts), T2 engineers on-call, T3/vendor escalation.
- **Field technician teams** at the three regional hubs.
- **Bahamian capacity building:** train and certify local watch officers and technicians; knowledge
  transfer is an explicit deliverable (sovereign operation, not perpetual dependence on the partner).
  See the **Training & Capacity-Building Plan (BACSWN-TRN-2026-007)** for curricula, certification,
  partnerships, and localization targets.

---

## 9. Continuous Improvement

- Post-incident reviews; reliability trends feed spares sizing and the predictive-maintenance models.
- Periodic DR and inter-agency activation drills (with NEMA/Police/Fire/RBDF).
- Annual O&M review against SLAs and lifecycle/obsolescence posture.

---

*See also: Master Framework Schedule gate **OM-1** (O&M / sustainment readiness before handover) and
**DR-1** (hub failover drill).*
