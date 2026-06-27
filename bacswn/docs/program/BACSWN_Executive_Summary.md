# BACSWN — Executive Summary (Program Documentation)

**Document:** BACSWN-EXEC-2026-010
**Classification:** CONFIDENTIAL — For Authorized Recipients Only
**Prepared for:** Owner & CEO, BACSWN (private delivery partner)
**Prepared by:** Sky Miles Limited — AI Elevate Division
**Version:** 1.0 — June 2026

---

## 1. Context

BACSWN ("SkyWatch Bahamas") is a sovereign, AI-operated meteorological watch, airspace-surveillance,
and emergency-response network for the Commonwealth of The Bahamas, delivered under a **Build-Own-Operate
(BOO) public-private partnership** and funded by a share of airline **overflight and landing fees**. The
software platform is already built and live; this session produced the **full implementation
documentation set** that takes it from a working platform to a buildable, governable national program.

---

## 2. What Was Produced This Session

A complete, cross-referenced documentation set (PDF + markdown source), now committed to the project
repository under `projects/bacswn/docs/program/`.

| # | Document | ID | Audience | Purpose |
|---|----------|----|----------|---------|
| 1 | Board Brief (emailed) | — | Board | One-page adoption case (delivered to the board) |
| 2 | Board Runbook — Technology Highlights | — | **Board** | The only board-facing doc; 2-page technology overview |
| 3 | Mesh Architecture Master Plan (v1.9, + RF annex) | MARCH-2026-002 | Owner/CEO | Controlling engineering blueprint (software + per-tower comms) |
| 4 | Master Framework Schedule (v1.8) | SCHED-2026-003 | Owner/CEO | 24-month, 4-phase, 18-workstream plan with milestone gates |
| 5 | Operations & Maintenance Plan | OM-2026-004 | Owner/CEO | Day-2 sustainment, NOC, island field logistics, SLAs |
| 6 | Data Governance & Sovereignty Policy (v1.1) | GOV-2026-005 | Owner/CEO | Data ownership, residency, sharing, trusted AI supply chain |
| 7 | Master V&V and ICD Plan | VV-2026-006 | Owner/CEO | Test strategy + interface control documents |
| 8 | Training & Capacity-Building Plan | TRN-2026-007 | Owner/CEO | Bahamian workforce, certification, localization |
| 9 | SWOT & Risk Analysis | RISK-2026-008 | Owner/CEO | Consolidated living risk register (R01–R20) + SWOT |
| 10 | Edge AI Node Hardware Budget | HWB-2026-009 | Owner/CEO | Per-tower BOM + hub/NOC room infrastructure |

---

## 3. Architecture & Design Decisions Captured

- **Resilient mesh:** 15 intelligent tower nodes; three-layer comms (licensed VHF mesh + cellular +
  Iridium satellite); autonomous operation when the hub or an island is cut off.
- **Category 4/5 survivability:** structural (TIA-222 / ASCE 7), missile-impact, surge, extended power
  autonomy, plus lightning/grounding and salt-corrosion protection.
- **Full end-to-end cryptography:** hardware root-of-trust, national PKI, signed mesh, FIPS-grade,
  post-quantum path; plus **hub disaster recovery** (off-island/cloud standby).
- **Multimodal edge AI with model consensus:** each tower runs a **multimodal model** (sensors +
  radar/satellite imagery + text), trained on weather data, in a **2-of-3 model-consensus ensemble**
  before any autonomous action — distinct from the multi-station consensus. **Models must be
  non-Chinese / trusted-provenance.**
- **Airspace surveillance, three missions, one feed:** commercial **and military** overflight tracking
  (ADS-B + **Raytheon primary radar**) driving safety, overflight-fee accounting, and CORSIA carbon.
- **National-response backbone:** full emergency-services integration (NEMA, Police, Fire/Rescue, RBDF,
  shelters) via a shared Common Operating Picture and CAP/EDXL.
- **Sensing & response extensions:** IoT (LoRaWAN) sensor network and a drone/UAS program (with built-in
  airspace deconfliction). **Tomorrow.io** space-based radar integrated as a supplementary feed.
- **External interoperability (phased):** ICAO OPMET/WAFS and future U.S. (NOAA/NHC, FAA Miami Oceanic,
  NORAD).

---

## 4. Key Findings & Numbers

- **RF reality:** VHF is **horizon-limited, not power-limited**; the remote SE edge (Inagua ↔ Mayaguana,
  92 nm) is beyond practical line-of-sight — **satellite is genuinely their primary path** (the link
  budget validates the design).
- **Hardware budget ~$1.77M** (range **$1.6M–2.2M**) for 15 nodes + spares + the **hub/NOC room**
  (racks, UPS, cooling, **fire suppression**, NOC fit-out). **The AI compute is only ~4% of cost** —
  the budget is dominated by aviation-grade sensors (ceilometer, visibility), resilient power, and the
  facility.
- **Program shape:** 24 months, 4 phases, **18 parallel workstreams**, gated milestones; longest
  long-lead items are URCA spectrum and the **Raytheon radar (ITAR)**.
- **Risk posture:** 20 tracked risks; the critical few are hurricane-during-deployment, Raytheon/ITAR
  timing, and cyber/physical attack.

---

## 5. Status

All ten documents are version-controlled and pushed to the gigforge repository
(`projects/bacswn/docs/program/`). The set is internally consistent and cross-referenced. *(Financial
modeling is intentionally out of scope — this is an implementation program, not a financial model.)*

---

## 6. Open Decisions & Recommended Next Steps

1. **Model consensus topology** — software 2-of-3 ensemble on one Orin NX (cheaper) **vs.** three
   independent compute modules (true hardware redundancy, +~$3–4k/node).
2. **Sensor tiering** — full aviation instrumentation at every site vs. a lighter suite (no ceilometer)
   at selected remote sites (saves ~$300–450k; a meteorological-coverage decision).
3. **Standby hub** — cloud DR (mostly opex) vs. a physical off-island room.
4. **Branding / team** — confirm delivery-vehicle attribution; complete the leadership/track-record
   placeholder in the board runbook.
5. **Calibration** — review the risk scores and the indicative budget figures against Bahamian context
   and vendor RFQs.

---

*Index document for the BACSWN implementation set; see each referenced document for detail.*
