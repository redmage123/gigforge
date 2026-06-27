# BACSWN — Master Framework Schedule & Milestone Plan

**Document:** BACSWN-SCHED-2026-003
**Classification:** CONFIDENTIAL — For Authorized Recipients Only
**Prepared for:** Owner & CEO, BACSWN (private delivery partner)
**Prepared by:** Sky Miles Limited — AI Elevate Division
**Version:** 1.8 — June 2026
**Delivery model:** Build-Own-Operate (BOO) public-private partnership with the Bahamian government.
**Program:** 24-month implementation, 4 phases, 18 parallel workstreams.
**Scope:** This is an **implementation plan** — workstreams, milestones, dependencies, and risks. Financial and commercial modeling is intentionally **out of scope** and handled separately.
**Change log:** v1.8 adds the consolidated **SWOT & Risk Analysis** (BACSWN-RISK-2026-008) as the authoritative living risk register; §7 here is the schedule-impacting subset. v1.7 adds the **Training & Capacity-Building Plan** (BACSWN-TRN-2026-007) as workstream WS-R with gates TRN-1/TRN-2, and narrows WS-I to operations/O&M/handover. v1.6 adds the **Master V&V and Interface Control (ICD) Plan** (BACSWN-VV-2026-006) — gates VV-1 (V&V plan + ICD register baselined) and VV-2 (operational validation) — and broadens WS-H to cover FAT/SAT/IV&V and ICD management. v1.5 adds the **Environmental, Land & Permitting** workstream (WS-Q) with gates ENV-1/ENV-2 — land rights, environmental impact assessment, protected-area clearance, and building/civil-aviation siting permits — which gate all civil works (risk R12). v1.4 integrates four Day-2 / governance items — **hub disaster-recovery failover (DR-1)**, **O&M / sustainment readiness (OM-1)**, **data-governance & sovereignty sign-off (GOV-1)**, and **lightning/grounding/corrosion in structural design (STR-1)** — and adds the O&M Plan (BACSWN-OM-2026-004) and Data Governance & Sovereignty Policy (BACSWN-GOV-2026-005) as companions. v1.3 removes budget/financial framing to keep this a pure implementation plan. v1.2 added the **primary surveillance radar program** (Raytheon radar at designated radar towers) as workstream WS-P with gates RAD-1…RAD-4, long-lead defense procurement, **US export/ITAR licensing**, and heavy radar-tower civil works; and wired in the **Tomorrow.io** space-based-radar weather feed (WS-F). v1.1 added workstreams/gates for cryptographic security, Cat 4/5 structural certification, emergency-services integration, commercial+military surveillance & overflight-fee metering, the IoT sensor network, drones/UAS, and external/U.S. interoperability.

---

## 1. How to Read This Schedule

- **Timeline:** 24 months, Month 0 (M0) = program kickoff. Anchored to a **south-to-north**
  hardware rollout so the highest hurricane-exposure stations are protected before each June 1.
- **Workstreams** run in parallel; **milestones (M-gates)** are go/no-go decision points with
  defined exit criteria. A phase does not advance until its gate is signed off by the program's
  technical authority (owner/CEO).
- **Critical path** is marked ⛓. Hurricane-season constraints are marked 🌀.

---

## 2. Phase Overview

| Phase | Window | Theme | Headline outcome |
|-------|--------|-------|------------------|
| **Phase 0** | M0 (pre-kickoff) | Mobilization & authorizations | Governance, URCA filing, Raytheon/ITAR procurement underway |
| **Phase 1** | M1–M6 | **Foundation** | 4 pilot stations live on VHF + Iridium; radar program kicked off |
| **Phase 2** | M7–M12 | **Intelligence** | Edge AI on pilots; consensus & autonomy proven; security hardened |
| **Phase 3** | M13–M18 | **Full Network** | All 15 stations; emergency-services integration; primary radar + surveillance live |
| **Phase 4** | M19–M24 | **Advanced Capabilities** | Propagation forecasting, IoT/drones, full autonomy, handover |

> **Scope note.** Beyond the core mesh, this plan sequences additive capability workstreams — primary
> surveillance radar (Raytheon, WS-P), emergency-services integration, commercial+military surveillance
> & fee metering, the IoT sensor network, drones/UAS, and external/U.S. interoperability. WS-P (Raytheon
> radar) is the largest long-lead item and is started at M1. Fee metering (REV-1) is built early so it
> is operational as soon as the airspace is monitored. *(Commercial/financial modeling is out of scope
> for this implementation plan.)*

---

## 3. Workstreams

| ID | Workstream | Owner | Spans |
|----|-----------|-------|-------|
| WS-A | Program & Governance (PMO, owner/CEO reporting, change control) | Sky Miles PMO | M0–M24 |
| WS-B | Regulatory & Spectrum (URCA licensing, BCAA/ICAO coordination) ⛓ | Regulatory lead | M0–M9 |
| WS-C | Comms Network Engineering (VHF mesh, satellite, cellular, link budgets) | Network eng | M1–M18 |
| WS-D | Edge Node Hardware (Jetson, radios, sensors, power, enclosures) | Hardware eng | M1–M18 |
| WS-E | Software & Mesh Protocol (stack, routing, store-and-forward, OTA) | Platform eng | M1–M22 |
| WS-F | Edge AI & Forecast Verification (microclimate models, MOS, consensus) | AI/ML | M5–M22 |
| WS-G | Site Civil & Power (towers, solar, battery, grid tie, enclosures) | Civil/field | M2–M18 |
| WS-H | Integration, V&V & Acceptance (FAT/SAT, IV&V, ICD management, RTM, commissioning, drills) | QA / V&V | M2–M24 |
| WS-I | Operations, O&M & Handover (NOC, watch officers, field service, spares, runbooks) | Ops | M10–M24 |
| WS-J | Security & Cryptography (PKI, secure boot/HSM, mTLS, SecOps, pen-test) | Security | M1–M24 |
| WS-K | Emergency-Services Integration (CAP/EDXL, COP, shelter & evacuation, RBDF) | Integration | M8–M22 |
| WS-L | Airspace Surveillance & Fee Accounting (commercial+military fusion, overflight/landing-fee metering, CORSIA) | Surveillance | M4–M20 |
| WS-M | IoT Sensor Network (LoRaWAN/NB-IoT gateways, surge/flood/lightning sensors) | IoT eng | M10–M22 |
| WS-N | Drone / UAS Program (survey, recon, SAR, comms relay, deconfliction) | UAS lead | M16–M24 |
| WS-O | External / International Interoperability (ICAO OPMET/WAFS/AFTN, U.S./NORAD) — phased | Integration | M18–M24+ |
| WS-P | Primary Surveillance Radar — **Raytheon** (procurement, export/ITAR, radar-tower civil works, install, calibration, integration) ⛓ | Radar / Civil | M1–M20 |
| WS-Q | Environmental, Land & Permitting (land rights/leases, EIA, protected-area clearance, building & civil-aviation siting permits) ⛓ | Legal / Env | M0–M12 |
| WS-R | Training & Capacity Building (role-based curricula, certification, train-the-trainer, Bahamian workforce, academic partnerships) | Training | M6–M24 |

> Cat 4/5 **structural survivability certification** is delivered within WS-G (Site Civil & Power) and
> gated explicitly (STR-1, plus per-station sign-off at acceptance). IoT (WS-M) uses license-exempt
> ISM spectrum, so it does **not** depend on the URCA VHF licensing critical path.

---

## 4. Milestone Register

### 4.1 Core Network Gates

| Gate | Month | Milestone | Exit criteria (go/no-go) | Critical |
|------|:-----:|-----------|--------------------------|:--------:|
| **M0** | 0 | Program kickoff & mobilization | Contract executed; PMO stood up; governance & reporting cadence agreed | ⛓ |
| **G1** | 1 | URCA spectrum application filed | VHF (148–174 MHz) license application submitted; frequency plan drafted | ⛓ |
| **G2** | 2 | Architecture & site survey baseline | Master Architecture Plan signed; all 15 sites surveyed; link budgets validated | ⛓ |
| **G3** | 3 | Pilot hardware procured | Long-lead items (Jetson, MTR3000, Iridium 9603) ordered; supply risk mitigated | |
| **G4** | 4 | First pilot node bench-accepted | One node passes lab acceptance (sensors, 3 radios, power, OTA A/B) | |
| **G5** | 6 | **Phase 1 complete — Pilot mesh live** 🌀 | 4 pilots (MYNN, MYGF, MYAM, MYEG) on VHF + Iridium; heartbeat/observation flowing; satellite fallback verified | ⛓ |
| **G6** | 8 | Edge AI v1 on pilots | Microclimate + anomaly models running at edge within latency budget | |
| **G7** | 10 | Consensus & autonomous-mode proven | Multi-station consensus vote + hub-disconnect drill pass on pilot cluster | ⛓ |
| **G8** | 12 | **Phase 2 complete — Intelligence validated** | Forecast-verification scoreboard live; MOS bias-correction improving accuracy; autonomy drill signed off | ⛓ |
| **G9** | 14 | Southern remote stations live 🌀 | MYIG, MYMM, MYRD, MYLD, MYES commissioned **satellite-first**; SE edge has verified lifeline before June 1 | ⛓🌀 |
| **G10** | 16 | Central + northern stations live | Remaining stations (MYBC, MYCB, MYEM, MYER, MYAT, MYBS) joined; full 15-node mesh forming | |
| **G11** | 18 | **Phase 3 complete — Full network operational** | All 15 nodes commissioned to acceptance spec; emergency VHF + SMS broadcast commissioned; topology resilient to single-node loss | ⛓ |
| **G12** | 21 | Advanced capabilities online | Propagation (station-to-station) forecasting; network-wide self-healing & store-and-forward at scale | |
| **G13** | 23 | Operations handover & training complete | Watch officers trained; runbooks delivered; 30-day stability soak passed | |
| **G14** | 24 | **Program close & national acceptance** | Final acceptance by Ministry / customer; warranty + support contract active; as-built docs delivered | ⛓ |

### 4.2 Capability & Integration Gates

These run in parallel with the core gates and inherit the same go/no-go discipline.

| Gate | Month | Capability | Exit criteria (go/no-go) | Critical |
|------|:-----:|-----------|--------------------------|:--------:|
| **STR-1** | 2 | Cat 4/5 structural design certified | Tower/mast/enclosure design certified to TIA-222-H / ASCE 7 Risk Cat IV (≥180 mph) + ASTM E1996 missile; per-site surge elevation set; **lightning/grounding (IEC 62305) + C5-M corrosion** design included | ⛓ |
| **GOV-1** | 4 | Data Governance & Sovereignty Policy approved | Policy signed (BACSWN-GOV-2026-005): data classification, residency, retention, sharing rules — required before any inter-agency/external integration | ⛓ |
| **ENV-1** | 2 | Site land rights & environmental screening | Land leases/access secured for pilot + designated radar sites; environmental screening done; protected-area constraints identified | ⛓ |
| **ENV-2** | 8 | Permits & clearances complete | Environmental impact assessment approved; building + civil-aviation siting permits issued for all station and radar-tower sites | ⛓ |
| **VV-1** | 3 | Master V&V plan + ICD register baselined | V&V plan signed (BACSWN-VV-2026-006); requirements-traceability matrix established; all internal/external ICDs registered under change control | ⛓ |
| **RAD-1** | 2 | **Raytheon radar procurement initiated** | Radar siting/coverage analysis done; designated radar-tower sites fixed; Raytheon contract + **US export/ITAR licensing** filed; long-lead order placed | ⛓ |
| **RAD-2** | 10 | Radar-tower civil works complete | Heavy radar-tower foundations/structures built at designated sites (Cat 4/5-rated); power + shelter ready for radar install |  |
| **RAD-3** | 15 | First Raytheon radar installed & accepted | First primary radar installed, calibrated, and feeding the surveillance picture; vendor acceptance signed | ⛓ |
| **RAD-4** | 18 | Radar coverage operational | Primary radar operational across designated coverage sites; **enables military / non-cooperative fusion (SUR-2)** and FIR-wide picture | ⛓ |
| **SEC-1** | 3 | Crypto root-of-trust baseline | National PKI stood up; secure element/TPM provisioning + measured secure boot proven on pilot node | ⛓ |
| **REV-1** | 6 | **Overflight/landing-fee metering MVP** | Surveillance-driven fee-accounting pipeline live (count → bill basis); reconciles with civil-aviation authority | ⛓ |
| **SUR-1** | 8 | Commercial surveillance live | ADS-B/Mode-S airspace picture over the Bahamas FIR; feeds safety + fee + CORSIA |  |
| **SEC-2** | 9 | SecOps & first pen-test | Incident response runbook live; RBAC/audit; independent penetration test passed | ⛓ |
| **EMG-1** | 12 | CAP/EDXL alerting gateway live | Standards-based alerts ingested by a first agency CAD/dispatch (NEMA) |  |
| **SUR-2** | 15 | Military/non-cooperative fusion | Raytheon primary radar (RAD-3) + secondary radar + partner data-share fused into the track picture (Mode 5 / non-ADS-B coverage) | ⛓ |
| **EMG-2** | 16 | COP + shelter/evacuation integration | Common Operating Picture shared with NEMA, Police, Fire/Rescue, RBDF; shelter activation/occupancy + surge-aware evacuation routing live |  |
| **IOT-1** | 14 | IoT sensor pilot | LoRaWAN pilot cluster reporting via station gateways into the COP |  |
| **EMG-3** | 18 | Inter-agency activation drill | Full multi-agency hurricane-activation exercise passes end-to-end | ⛓ |
| **DRN-1** | 20 | UAS capability + deconfliction | Drone survey/recon flown with BACSWN live-traffic deconfliction; telemetry into COP; under BCAA UAS rules |  |
| **IOT-2** | 22 | IoT network rollout | Priority islands densified; edge-AI fusing IoT into surge/flood nowcasts |  |
| **INT-1** | 22 | International exchange live | ICAO OPMET/WAFS/AFTN exchange operating; U.S. (NOAA/NWS/NHC, FAA Miami Oceanic, NORAD) integration scoped/initiated — may extend past M24 |  |
| **DRN-2** | 23 | Drone operations + SAR drill | UAS post-storm + SAR drill with RBDF; comms-relay restore demonstrated |  |
| **DR-1** | 21 | Hub disaster-recovery failover drill | Secondary/off-island standby hub + replication proven; COP failover within RTO, near-zero RPO; data restore verified | ⛓ |
| **OM-1** | 22 | O&M / sustainment readiness | NOC, 3 regional service hubs, spares pool, island field-logistics, predictive maintenance & SLAs operational before handover (BACSWN-OM-2026-004) | ⛓ |
| **TRN-1** | 10 | Training programme established | Role-based curricula + competency framework approved; academic partnerships (UB, BTVI, Dept. of Met, BCAA) signed; train-the-trainer cohort under way |  |
| **TRN-2** | 23 | Operational certification complete | Bahamian watch officers, NOC operators, and field/radar/drone technicians certified and operationally ready; localization targets on track | ⛓ |
| **VV-2** | 23 | Operational validation complete | Live hurricane-season exercise + full inter-agency drill + hub failover passed; requirements-traceability matrix fully closed | ⛓ |
| **SEC-3** | 24 | Full security acceptance | Network-wide crypto, signed-OTA, tamper-zeroization verified; final pen-test + remediation closed | ⛓ |

---

## 5. Phase Detail & Sequenced Activities

### Phase 1 — Foundation (M1–M6)
- WS-B: File URCA application **(M1, critical path)**; open BCAA/ICAO coordination.
- WS-C/D: Finalize link budgets; procure long-lead hardware; build & bench-accept first node.
- WS-E: Mesh protocol MVP (HEARTBEAT, OBSERVATION, routing, store-and-forward) on VHF backbone.
- WS-G: Civil/power at the 4 pilot sites (MYNN, MYGF, MYAM, MYEG); establish Iridium SBD fallback.
- WS-G/J: Cat 4/5 structural design certification (STR-1, M2); national PKI + secure-boot baseline (SEC-1, M3).
- WS-L: Stand up commercial ADS-B surveillance and the **overflight/landing-fee metering MVP (REV-1, M6)** — built early so fee accounting is live as soon as the airspace is monitored.
- WS-P: **Raytheon primary-radar program kickoff** — radar siting/coverage analysis; designated radar-tower sites fixed; Raytheon contract + **US export/ITAR licensing filed**; long-lead radar order placed (RAD-1, M2).
- WS-G: structural design includes **lightning/grounding (IEC 62305) + C5-M corrosion** protection (within STR-1, M2).
- WS-A/J: **Data Governance & Sovereignty Policy** drafted and approved before any external integration (GOV-1, M4).
- WS-Q: Secure **land rights/leases** and complete **environmental screening** for pilot + radar sites; identify protected-area constraints (ENV-1, M2) — this **gates all civil works**.
- WS-H: Baseline the **Master V&V plan + ICD register** and establish the requirements-traceability matrix before integration scales (VV-1, M3).
- **Gate G5 (M6):** pilot mesh live on VHF + satellite. 🌀 *Must clear before hurricane season.*

### Phase 2 — Intelligence (M7–M12)
- WS-F: Deploy edge AI (microclimate prediction, anomaly detection) to pilots; stand up
  forecast verification + MOS bias correction; build ERA5 climate normals.
- WS-E: Consensus voting, propagation message handoff, OTA model/firmware pipeline.
- WS-H: Consensus + autonomous-mode (hub-disconnect) drills on the pilot cluster.
- WS-L: Commercial surveillance operational (SUR-1, M8) feeding safety + fee + CORSIA.
- WS-J: SecOps + incident response live; first independent penetration test (SEC-2, M9).
- WS-K: CAP/EDXL alerting gateway live with NEMA (EMG-1, M12).
- WS-R: **Training programme established** — role-based curricula, academic partnerships (UB/BTVI/Dept. of Met/BCAA), and train-the-trainer cohort begun, with pilot-cluster hands-on (TRN-1, M10).
- WS-Q: **Environmental impact assessment approved**; building + civil-aviation siting permits issued for all station and radar-tower sites (ENV-2, M8).
- WS-F: Integrate the **Tomorrow.io** commercial weather + space-based radar feed (API key already wired) — supplements AWC/NWS/OpenMeteo and adds space-based precipitation radar over open ocean where ground radar is sparse.
- WS-P: Radar-tower civil works underway at designated sites (heavy Cat 4/5-rated structures, power, shelter) toward RAD-2 (M10).
- **Gate G8 (M12):** intelligence validated; autonomy proven.

### Phase 3 — Full Network (M13–M18)
- WS-D/G: Roll out remaining 11 stations **south-to-north**, satellite-first for remote sites.
- WS-C: Commission full VHF partial-mesh + Iridium logical-mesh overlay; harden Chub Cay relay.
- WS-E/I: Commission emergency VHF voice + SMS gateway broadcast; begin operator onboarding.
- WS-M: IoT sensor pilot via station LoRaWAN gateways (IOT-1, M14).
- WS-L: Fuse military/non-cooperative radar + data-share into the track picture (SUR-2, M15).
- WS-K: Common Operating Picture + shelter/evacuation integration with NEMA, Police, Fire/Rescue, RBDF (EMG-2, M16); full inter-agency activation drill (EMG-3, M18).
- WS-P: Install, calibrate & accept first Raytheon radar (RAD-3, M15); bring primary-radar coverage operational across designated towers (RAD-4, M18) — unlocking military/non-cooperative fusion (SUR-2).
- **Gate G9 (M14) 🌀** and **G11 (M18):** remote south protected pre-season; full 15-node network operational.

### Phase 4 — Advanced Capabilities (M19–M24)
- WS-F: Network-wide propagation forecasting and emergent multi-station hazard detection.
- WS-E: Self-healing at scale; performance hardening; close test-coverage gaps to production bar.
- WS-I: Watch-officer training, runbooks, 30-day soak, knowledge transfer.
- WS-N: Drone/UAS capability with live-traffic deconfliction (DRN-1, M20) and post-storm + SAR operations (DRN-2, M23).
- WS-M: IoT network rollout to priority islands (IOT-2, M22).
- WS-O: ICAO OPMET/WAFS exchange live; U.S./NORAD interoperability initiated (INT-1, M22) — may extend past M24.
- WS-J: Full security acceptance — final pen-test + remediation closed (SEC-3, M24).
- WS-E: **Hub disaster-recovery failover drill** — secondary/off-island hub, replication, RTO/RPO verified (DR-1, M21).
- WS-I: **O&M / Day-2 sustainment readiness** — NOC, regional service hubs, spares, island field-logistics, predictive maintenance & SLAs stood up before handover (OM-1, M22).
- WS-H: **Operational validation** — live hurricane-season exercise + full inter-agency drill + hub failover; requirements-traceability matrix fully closed (VV-2, M23).
- WS-R: **Operational certification** — Bahamian watch officers, NOC, and field/radar/drone technicians certified, drilled, and operationally ready ahead of handover (TRN-2, M23).
- **Gate G14 (M24):** national acceptance, warranty & support active, program close.

---

## 6. Critical Path & Key Dependencies

```
M0 Kickoff ─► G1 URCA filing ─► G2 Arch/site baseline ─► G5 Pilot mesh (M6,🌀)
   └► G7 Autonomy proven ─► G8 Intelligence (M12) ─► G9 Remote-south live (M14,🌀)
        └► G11 Full network (M18) ─► G14 National acceptance (M24)
```

- **⛓ URCA spectrum (G1):** longest regulatory lead; any slip cascades to every VHF milestone.
  Filed M1, target approval by M9.
- **🌀 Hurricane windows:** G5 (M6) and G9 (M14) are pinned before June 1. South-to-north
  sequencing ensures exposed/satellite-critical stations are protected first (risk R01).
- **Supply chain:** long-lead edge hardware ordered at G3; second-source qualified (Raspberry Pi 5
  + Coral, AMD/Xilinx) to de-risk Jetson availability (risk R05).
- **Revenue-enabling (REV-1, M6):** under the BOO / overflight-fee model, fee metering is on the
  *value* critical path — prioritized in Phase 1 so billing begins as soon as traffic is monitored.
- **Military surveillance (SUR-2):** depends on a U.S./defence data-sharing agreement (risk R07);
  commercial ADS-B (SUR-1) proceeds first and primary radar provides fallback.
- **Security first (SEC-1 → SEC-2 → SEC-3):** the crypto root-of-trust must precede any external or
  inter-agency integration, so security gates lead the integration workstreams.
- **Off the URCA path:** the IoT layer (WS-M) uses license-exempt ISM spectrum and does not wait on
  VHF licensing.
- **⛓ Environmental & land (ENV-1/2):** land rights and permits **gate all civil works** (WS-G) and
  radar-tower construction (WS-P); started at M0 so site access is never the blocker. Protected-area
  constraints on the cays can force re-siting, so screening is done before hardware is committed.
- **⛓ Raytheon radar (WS-P):** alongside URCA, this is a top long-lead critical item. **US export/ITAR
  licensing** and radar manufacturing lead times start at M1–M2; heavy radar-tower civil works (RAD-2)
  then gate installation (RAD-3, M15). The military/non-cooperative surveillance picture (SUR-2) and
  full FIR coverage depend on radar being operational (RAD-4, M18) — so any radar slip cascades into
  the surveillance and (partially) the fee/coverage value case.

---

## 7. Top Program Risks (schedule-impacting)

> The **full SWOT & consolidated risk register** is maintained separately in **BACSWN-RISK-2026-008**
> (SWOT & Risk Analysis). The table below is the schedule-impacting subset; the consolidated document is
> authoritative for scoring, residuals, and governance.

| ID | Risk | L×I | Mitigation | Owner |
|----|------|-----|-----------|-------|
| R01 | Hurricane strikes partially-deployed network | 4×5 CRITICAL | South-to-north sequencing; satellite fallback live before June 1 | WS-A/C |
| R03 | VHF spectrum delay (URCA) | 3×4 HIGH | File M1; maintain satellite/cellular interim path | WS-B |
| R04 | Edge AI underperformance | 3×3 MEDIUM | Hub-based models as fallback; phased validation per gate | WS-F |
| R05 | Edge hardware supply disruption | — MEDIUM | Pre-order at G3; qualified second sources | WS-D |
| R06 | Air-traffic volume downturn cuts overflight/landing-fee revenue | 3×4 HIGH | Diversified airline base over a busy oceanic FIR; minimum-traffic floor in the concession; opex flexibility | WS-A/L |
| R07 | U.S./military data-sharing agreement delayed (military track fusion) | 3×3 MEDIUM | Commercial ADS-B first; pursue MOU early; primary-radar fallback | WS-L/O |
| R08 | Drone/UAS regulatory approval (BCAA) | 2×3 MEDIUM | Early BCAA engagement; leverage own air picture for deconfliction | WS-N |
| R10 | Raytheon radar long-lead, **US export/ITAR** delay, or install complexity | 4×4 CRITICAL | File ITAR/export + place order at M1; radar-tower civil works in parallel; phased install; commercial ADS-B + Tomorrow.io space-radar as interim coverage | WS-P/B |
| R11 | Tomorrow.io feed dependency (commercial API availability / cost) | 2×2 LOW | Treat as supplementary, not sole-source; AWC/NWS/OpenMeteo + own sensors remain authoritative | WS-F |
| R12 | Environmental clearance / land rights / permitting delay (gates civil works) | 3×4 HIGH | Start at M0; engage Ministry + environment authority early; prioritize pilot + remote/radar sites; sequence civil works behind cleared sites; hold re-siting options | WS-Q |

---

## 8. Governance & Reporting Cadence

- **Weekly:** PMO status to the owner/CEO (RAG, milestone burn-up, risk deltas).
- **Per gate:** formal go/no-go review with documented exit-criteria sign-off.
- **Monthly:** owner/CEO review — milestone progress and forward-look.
- **Change control:** any scope/cost/schedule change >5% routed through WS-A change board.

---

*Companion documents: BACSWN Mesh Architecture Master Plan (BACSWN-MARCH-2026-002); Investor
Operations & Maintenance Plan (BACSWN-OM-2026-004); Data Governance & Sovereignty Policy (BACSWN-GOV-2026-005); Master V&V and ICD Plan (BACSWN-VV-2026-006); Training & Capacity-Building Plan (BACSWN-TRN-2026-007); SWOT & Risk Analysis (BACSWN-RISK-2026-008); Board Runbook (technology highlights).*
