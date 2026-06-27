# BACSWN — Edge AI Agent Node: Hardware Budget (Towers)

**Document:** BACSWN-HWB-2026-009
**Classification:** CONFIDENTIAL — For Authorized Recipients Only
**Prepared for:** Owner & CEO, BACSWN (private delivery partner)
**Prepared by:** Sky Miles Limited — AI Elevate Division
**Version:** 1.1 — June 2026
**Companion to:** Mesh Architecture Master Plan (BACSWN-MARCH-2026-002, §5.2 hardware baseline)

---

## 1. Purpose & Scope

This is a **budgetary hardware estimate** for deploying the autonomous **AI agent node** at each of the
15 tower/weather stations — the compute, connectivity, sensing, power, and protection that turn a tower
into an intelligent BACSWN station. Figures are **indicative planning estimates (USD), not vendor
quotes**, intended to size the hardware program; firm pricing requires RFQs.

**In scope:** per-node edge hardware (compute, radios, sensors, power, enclosure/protection); the
**central hub / NOC and off-island standby room infrastructure** (racks, servers, network, UPS, cooling,
**fire suppression**, physical security, NOC fit-out); spares, assembly/integration & factory test, depot
tooling, contingency.
**Out of scope (budgeted elsewhere):** tower/mast civil structures and foundations, the **Raytheon
primary radar** program (WS-P), and all **recurring costs** (Iridium airtime, cellular plans, power,
licences) which are operating expenses, not hardware.

---

## 2. Key Finding (read this first)

**The AI itself is still the cheap part.** Even with a **multimodal model** and a **2-of-3
model-consensus ensemble** (§7), the edge-AI compute is only **~$2,100/node** — about **4%** of an
instrumented node. The cost is dominated by **aviation-grade meteorological sensors** (especially the
ceilometer and visibility sensor) and **resilient solar/battery power**, and now also the **central
hub/NOC room** (cooling, UPS, fire suppression — §5). Budget decisions should focus on the *sensor-suite
tier*, *power autonomy*, and *facility*, not the AI compute.

---

## 3. Assumptions & Basis

- 15 stations; one agent node each. Costs are mid-points within the ranges shown.
- Aviation-grade (AWOS/ASOS-class) sensors assumed at all sites in the baseline (see §6 for a tiered
  alternative that materially reduces cost).
- VHF baseline uses the architecture's **Motorola MTR3000** repeater-grade radio; §6 notes a
  data-radio alternative.
- Remote/relay nodes (MYBC, MYIG, MYMM, MYRD) carry larger batteries (96–120 h) — a per-node uplift.
- Excludes shipping/duties, install labour (civil), and recurring airtime/licences.
- **Trusted supply chain:** edge compute is NVIDIA (US-built); AI **models must be non-Chinese,
  trusted-provenance** (policy: Data Governance BACSWN-GOV-2026-005) — a procurement constraint on the
  model ensemble, not a hardware cost.

---

## 4. Per-Node Bill of Materials (indicative)

| Tier | Item | Unit cost (USD, range) | Midpoint |
|------|------|------------------------|---------:|
| **A — Edge AI compute** | NVIDIA Jetson Orin NX 16GB (~100 TOPS) + industrial carrier — runs the **multimodal 2-of-3 model ensemble** | $1,300–1,900 | $1,600 |
| | Ruggedized compute enclosure, cooling, conformal coat | $250–450 | $300 |
| | Industrial storage (SSD — larger for models/imagery) | $120–200 | $150 |
| | Secure element / TPM 2.0 (FIPS) | $20–60 | $40 |
| | **Subtotal — AI compute** | | **~$2,090** |
| **B — Connectivity** | VHF mesh radio (MTR3000) + duplexer + antenna/feeder | $4,000–6,000 | $5,000 |
| | Iridium 9603 SBD transceiver + antenna | $500–700 | $600 |
| | Industrial LTE modem + antenna | $300–450 | $400 |
| | **Subtotal — connectivity** | | **~$6,000** |
| **C — Meteorological sensors** | Temp / humidity / pressure | $700–1,200 | $1,000 |
| | Ultrasonic anemometer (wind) | $1,200–1,800 | $1,500 |
| | Visibility / present-weather sensor | $6,000–10,000 | $8,000 |
| | **Ceilometer (cloud base, laser)** | $18,000–30,000 | $22,000 |
| | Precipitation + lightning sensor | $1,200–2,000 | $1,500 |
| | **Subtotal — sensors** | | **~$34,000** |
| **D — Power & protection** | Solar array (48 V) + MPPT charge controller | $2,000–3,000 | $2,500 |
| | Battery bank (72–120 h autonomy) | $3,000–4,500 | $3,500 |
| | Grid-tie + automatic transfer switch | $600–1,000 | $800 |
| | NEMA-4X / IP66 missile-rated enclosures | $1,200–1,800 | $1,500 |
| | Lightning protection, SPDs, grounding | $900–1,500 | $1,200 |
| | **Subtotal — power & protection** | | **~$9,500** |
| | **PER-NODE TOTAL (baseline)** | | **~$51,600** |

---

## 5. Facility & Room Infrastructure (Central Hub / NOC + Standby)

The towers are self-contained outdoor enclosures, but the **central hub / Network Operations Centre**
and the **off-island standby** need a proper equipment room. *(A cloud region may serve as the standby
instead — that shifts most of §5.2 to operating cost.)*

### 5.1 Primary Hub / NOC (Nassau)
| Item | Indicative (USD) |
|------|-----------------:|
| Server racks / cabinets + PDUs (≈4 racks) | $12,000 |
| Hub server cluster (control plane, COP, database; redundant) + storage | $60,000 |
| Network — redundant switches, routers, firewalls | $25,000 |
| UPS (N+1, room-level) | $30,000 |
| Standby generator (or building tie-in) | $40,000 |
| Precision cooling / CRAC (N+1) | $40,000 |
| **Fire detection + clean-agent suppression (Novec 1230 / FM-200)** | $35,000 |
| Raised floor / room build-out / aisle containment | $30,000 |
| Physical security (access control, CCTV, intrusion) | $20,000 |
| Structured cabling, PDUs, KVM | $15,000 |
| Environmental monitoring (temp / humidity / leak / smoke) | $8,000 |
| NOC operations centre — operator workstations + video wall / displays | $40,000 |
| **Subtotal — primary hub / NOC** | **~$355,000** |

### 5.2 Off-Island Standby (DR)
| Item | Indicative (USD) |
|------|-----------------:|
| Lighter room — racks, standby servers, network, UPS, cooling, basic fire suppression, security | $120,000 |
| *Cloud-DR alternative shifts most of this to opex* | *~$15,000 capex* |
| **Subtotal — standby** | **~$120,000 (or ~$15,000 cloud)** |

**Facility subtotal: ~$475,000** (≈ $370,000 with a cloud standby).

---

## 6. Network & Facility Roll-Up

| Line | Basis | Amount (USD) |
|------|-------|-------------:|
| Agent nodes — 15 × ~$51,300 | Baseline per-node | ~$770,000 |
| Remote-node battery uplift (4 sites, extended autonomy) | +~$2,000 ×4 | ~$8,000 |
| **Facility & room infrastructure (hub/NOC + standby)** | §5 | ~$475,000 |
| Spares pool | ~15% of nodes | ~$115,000 |
| Assembly, integration & factory acceptance test | labour/build | ~$120,000 |
| Depot / field test equipment & tooling | one-time | ~$50,000 |
| **Subtotal** | | **~$1,538,000** |
| Contingency | ~15% | ~$230,000 |
| **HARDWARE PROGRAM TOTAL (baseline)** | | **~$1.77M** |

*Indicative range overall: **~$1.6M–2.2M** depending on sensor tier, VHF radio choice, and
cloud-vs-physical standby.*

---

## 7. Cost Drivers & Options

- **Sensor tiering (largest lever).** The ceilometer + visibility sensor are ~**60%** of node cost. A
  **tiered suite** — full aviation instrumentation at major/hub sites, a lighter suite (no ceilometer)
  at selected remote sites — could cut the network hardware total by **~$300,000–450,000**. This is a
  meteorological-coverage decision for the watch office, not just a budget one.
- **VHF radio.** Substituting a base/mobile **data radio** for a full MTR3000 **repeater** at non-relay
  nodes could save **~$2,500–3,500/node**; keep repeater-grade only at relay hubs (e.g., Chub Cay).
- **AI compute & model consensus.** The tower model must be **multimodal** (sensor time-series +
  radar/satellite imagery + METAR/text) and run a **2-of-3 model-consensus ensemble** — three
  independent models must reach majority before an autonomous correction/action. The baseline budgets
  one capable **Orin NX 16GB** running the ensemble. For higher assurance, **three independent compute
  modules** (true hardware redundancy) add ~$3,000–4,000/node; **AGX Orin** is an option at hub/relay
  nodes. Still modest against sensors/power.
- **Volume procurement.** A single 15-node (+ spares) buy should attract meaningful vendor discounts not
  reflected in these list-level estimates.

---

## 8. Exclusions (budgeted separately)

Tower/mast structures and foundations (WS-G civil); the **Raytheon primary radar** program (WS-P); IoT
sensor network and drones (separate BOMs); and all **recurring** costs — Iridium airtime, cellular
plans, spectrum/licences, and O&M — which are operating expenses, not node hardware.

---

*Indicative budgetary estimates for planning only; not a financial model and not vendor-quoted. Confirm
with RFQs before commitment.*
