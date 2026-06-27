# BACSWN Distributed Mesh Network — Master Architecture Plan

**Document:** BACSWN-MARCH-2026-002
**Classification:** CONFIDENTIAL — For Authorized Recipients Only
**Prepared for:** Owner & CEO, BACSWN (private delivery partner)
**Prepared by:** Sky Miles Limited — AI Elevate Division
**Version:** 1.9 — June 2026
**Supersedes/extends:** BACSWN-ARCH-2026-001 (Distributed Intelligence Architecture Whitepaper)
**Change log:** v1.9 adds the **trusted model supply-chain** constraint — no Chinese-built models (§4.1). v1.8 specifies the tower edge AI as a **multimodal model** (trained on weather + relevant data) running a **2-of-3 model-consensus ensemble** before autonomous action (§4.1), distinct from the multi-station consensus; notes the resulting Orin NX 16GB compute baseline. v1.7 adds **Annex A — RF Link Budgets** (VHF link budgets, radio-horizon analysis, and the engineering basis for the satellite-critical remote edge). v1.6 references the Master V&V and ICD Plan (BACSWN-VV-2026-006), which governs the per-station acceptance in §11 and the interface contracts across §4, §8, and §9. v1.5 adds **hub disaster recovery / control-plane redundancy** (§4.5) and **lightning, grounding & corrosion** hardening (§7.7); references the new O&M Plan (BACSWN-OM-2026-004) and Data Governance & Sovereignty Policy (BACSWN-GOV-2026-005). v1.4 names the primary radar as **Raytheon** equipment at designated radar towers (§8.8, cross-ref to Schedule WS-P) and adds **Tomorrow.io** space-based-radar weather ingestion (§4.3). v1.3 adds a sensing & response extensions section — distributed IoT sensor network and drone/UAS technology (§9). v1.2 extends §8 with commercial & military airspace surveillance (§8.8) and external/U.S. interoperability (§8.9). v1.1 added three mandated baselines — Category 4/5 hurricane survivability (§7), full end-to-end cryptographic security (§4.4), and emergency-services / inter-agency integration (§8) — with matching hardware, standards, and acceptance updates.

---

## 1. Purpose & Scope

This Master Architecture Plan is the controlling engineering reference for the BACSWN
distributed mesh network. Where the original whitepaper (BACSWN-ARCH-2026-001) made the
*case* for moving from hub-and-spoke to an autonomous mesh, this document specifies the
**buildable architecture** across two tightly coupled domains:

1. **Software architecture** — the edge-node software stack, the central hub/cloud services,
   the mesh protocol, the edge-AI runtime, data and security models, and the operator platform.
2. **Communications network architecture** — the physical and link-layer design for **each of
   the 15 radar/weather stations**, including primary, secondary, and tertiary transport,
   antennas, power, link budgets, and per-station resilience posture.

The plan covers all 15 stations of the Bahamas archipelago network and is the reference of
record for procurement, site engineering, spectrum licensing, and acceptance testing.

---

## 2. Architectural Principles

| # | Principle | Implication |
|---|-----------|-------------|
| P1 | **Autonomy first** | Every station must continue sensing, predicting, and alerting locally with zero connectivity to the Nassau hub. |
| P2 | **No single point of failure** | The hub is a coordinator, not a dependency. Loss of Nassau degrades but never halts the network. |
| P3 | **Defense in depth (comms)** | Each station carries three independent transport layers; failover is automatic and hysteresis-controlled. |
| P4 | **Category 4/5 survivable** | The survival core of every node (edge compute, satellite link, battery, local alerting) is engineered to ride through a Cat 4/5 strike (≥157 mph / 252 km/h sustained) and keep warning. See §7. |
| P5 | **Edge-correlated intelligence** | Hazard detection emerges from multi-station consensus, not a single sensor — eliminating false positives. |
| P6 | **Open, versioned contracts** | Mesh protocol, message schema, and APIs are versioned; nodes of different firmware revisions interoperate. |
| P7 | **Observable & serviceable** | Every node self-diagnoses sensor and link health and reports it; field service is data-driven. |
| P8 | **Cryptographically secured end-to-end** | Every message, link, firmware artifact, and operator action is authenticated, integrity-protected, and (where applicable) encrypted from a hardware root of trust. No plaintext control path exists. See §4.4. |

---

## 3. System-Level Architecture

```
                 ┌──────────────────────────────────────────────┐
                 │   NASSAU HUB / CLOUD CONTROL PLANE (MYNN)     │
                 │  • Operations dashboard (React SPA)           │
                 │  • 7-agent orchestrator (wx-monitor, chief,   │
                 │    sigmet-drafter, flight-tracker, emissions, │
                 │    qc, dispatch)                              │
                 │  • Hub AI models + forecast verification/MOS  │
                 │  • SQLite/WAL store, WebSocket fan-out        │
                 │  • Multi-channel dispatch (42 channels)       │
                 └───────────────▲───────────────▲──────────────┘
                                 │  (coordination, non-critical)
        VHF mesh backbone  ┌─────┴─────┐   Iridium SBD (always-on backup)
                           │           │
   ┌───────────┐     ┌─────┴─────┐     ┌─────┴─────┐         ┌───────────┐
   │ STATION   │◄───►│ STATION   │◄───►│ STATION   │◄── ... ─►│ STATION   │
   │ Edge Node │ VHF │ Edge Node │ VHF │ Edge Node │   VHF    │ Edge Node │
   └───────────┘     └───────────┘     └───────────┘         └───────────┘
   Each Edge Node = Autonomous Agent: local sensors + edge AI + mesh radio +
   satellite + cellular + solar/battery + local VHF/SMS alerting
```

The network is a **partial mesh**: stations peer over licensed VHF where geography permits
(see §6 topology), and every station additionally holds an always-on Iridium satellite path to
the hub and to designated relay peers. The hub coordinates but does not gate station operation.

---

## 4. Software Architecture

### 4.1 Edge Node Software Stack (per station)

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| L5 — Application | **Station Agent** | Local reasoning, microclimate prediction, anomaly/hazard detection, consensus participation, local alert decisions. |
| L4 — Edge AI Runtime | **Multimodal models + 2-of-3 ensemble** | Runs the on-node multimodal model (sensor time-series + radar/satellite imagery + METAR/text) for microclimate prediction, anomaly detection, and nowcasting; a **2-of-3 model-consensus ensemble** must agree before any autonomous correction/action. Trained on weather + site history; updated via signed OTA. |
| L3 — Mesh Protocol Stack | **Transport + routing** | Distance-vector routing optimized for low-bandwidth radio; store-and-forward; transport abstraction over VHF / cellular / satellite. |
| L2 — Data & State | **Local time-series + event store** | Ring-buffered observations, alert log, peer-link health, signed message journal for store-and-forward replay. |
| L1 — Sensor & Radio HAL | **Hardware abstraction** | Drivers for the sensor suite (temperature, pressure, wind, humidity, visibility, ceilometer) and the three radios. |
| L0 — Platform | **Hardened Linux on Jetson Orin** | Read-only root, watchdog, secure boot, OTA-updatable firmware with A/B rollback. |

**Multimodal edge model & on-node consensus.** Each tower's decision model is **multimodal** — it fuses
heterogeneous inputs (numeric sensor time-series, the Tomorrow.io space-based and Raytheon primary-radar
imagery, and METAR/text) — and is **trained on weather and other relevant domain data** (site
microclimate history, ERA5 normals). To make safe correction decisions, the node runs **three
independent models** and requires a **2-of-3 majority** before acting — a triple-modular-redundancy /
Byzantine-tolerant approach at the *inference* layer. This on-node model consensus is distinct from, and
complementary to, the **multi-station** consensus in §4.2: one guards against a bad *model*, the other
against a bad *station*. Running the multimodal ensemble drives the per-node compute baseline up to a
Jetson **Orin NX 16GB** (with AGX Orin / independent triple-module options for higher assurance — see the
Edge AI Node Hardware Budget, BACSWN-HWB-2026-009). Models are versioned and updated via signed OTA (§4.4.5). **Trusted model supply chain:** all
models — base weights and fine-tunes — must come from **trusted, non-Chinese sources** (no
Chinese-built model weights or training pipelines), with documented provenance and integrity
verification, consistent with the system's sovereignty and US/allied interoperability posture
(§4.4, §8.9; policy in BACSWN-GOV-2026-005).

### 4.2 Mesh Protocol

- **Message types:** `HEARTBEAT` (keepalive with sensor/battery/link health), `OBSERVATION`,
  `HAZARD`, `CONSENSUS_VOTE`, `PROPAGATION` (station-to-station forecast handoff), `ALERT`,
  `OTA_FRAGMENT`, `ROUTE_UPDATE`.
- **Routing:** simplified distance-vector tuned for 9.6 kbps radio links; metric blends hop
  count, measured link quality, and transport cost (VHF cheapest, satellite most expensive).
- **Store-and-forward:** messages are queued and replayed when a degraded peer/link recovers;
  every message carries a monotonic sequence and signature for de-duplication and integrity.
- **Consensus:** weather hazards are confirmed by a quorum of in-range stations before a network
  alert is raised, virtually eliminating single-sensor false positives.

### 4.3 Hub / Cloud Control Plane

Built on the **already-live BACSWN platform** (FastAPI + React, SQLite/WAL, WebSocket
fan-out, APScheduler). Adds, for the mesh:

- **Mesh Coordinator service** — ingests `HEARTBEAT`/`OBSERVATION`, renders live topology, holds
  the authoritative-but-non-blocking network picture, and brokers OTA model/firmware rollouts.
- **Hub AI + Forecast Verification** — trains the bias-correction (MOS) models and ERA5 climate
  normals centrally, then pushes versioned model artifacts to the edge.
- **External weather data ingestion** — fuses public feeds (AWC, NWS, OpenMeteo) and the commercial
  **Tomorrow.io** feed, whose **space-based radar** adds precipitation coverage over open ocean where
  ground radar is sparse. External feeds are supplementary; BACSWN's own sensors/radar remain
  authoritative (no sole-source dependency).
- **Operator platform** — the existing dashboard gains a Mesh Network view (node health, link
  quality, consensus log, autonomous-mode indicators) already prototyped in `api/mesh.py`.

### 4.4 Cryptographic Security Architecture (full, end-to-end)

Security is a **mandated baseline**, not an add-on. The design provides confidentiality,
integrity, authenticity, anti-replay, and non-repudiation across every plane — node-to-node,
node-to-hub, firmware/model distribution, and operator access — anchored in a per-node hardware
root of trust. **There is no unauthenticated or plaintext control path anywhere in the system.**

#### 4.4.1 Hardware Root of Trust & Secure Boot
- Each node carries a **discrete secure element / TPM 2.0** (e.g., Microchip ATECC608B or
  equivalent FIPS-validated device) alongside the Jetson Orin security engine. Private keys are
  generated **inside** the secure element at provisioning and **never leave it**.
- **Measured secure boot:** signed bootloader → kernel → read-only rootfs, each stage verified
  before execution; boot measurements sealed to the TPM. **Anti-rollback fuses** prevent
  downgrade to a vulnerable firmware.
- **Tamper response:** enclosure intrusion or environmental tamper triggers **key zeroization**,
  so a physically captured or storm-scattered node yields no usable secrets.

#### 4.4.2 Identity & PKI
- A **BACSWN national PKI**: an **offline root CA**, an online **issuing/intermediate CA**, and
  per-node **X.509 certificates** bound to the secure-element key. Each station, the hub, and each
  operator has a distinct cryptographic identity.
- **Certificate lifecycle:** automated enrollment at manufacture, scheduled rotation, and
  **revocation** via short-lived certs + signed revocation lists distributed over the mesh
  (offline-tolerant: nodes cache and honor the latest signed CRL without needing live OCSP).

#### 4.4.3 Transport & Message Cryptography
- **IP transports (cellular / satellite-IP):** **mutual TLS 1.3** with certificate pinning.
- **Non-IP transports (VHF mesh, Iridium SBD):** because these are not IP-native, every payload is
  wrapped in a compact **authenticated-encryption envelope** sized for 9.6 kbps links:
  - **AES-256-GCM** (or AES-256-CCM) for confidentiality + integrity,
  - **Ed25519** signatures for sender authenticity and non-repudiation,
  - **monotonic sequence numbers + sliding replay window + timestamp** for anti-replay,
  - per-session symmetric keys derived via **ECDH (X25519) + HKDF**, rekeyed on a time/volume
    schedule for **forward secrecy**.
- Envelope overhead is minimized (truncated tags where risk-appropriate, header compression) so
  authenticated security is affordable on low-bandwidth radio.

#### 4.4.4 Consensus & Mesh Integrity
- Every `CONSENSUS_VOTE`, `HAZARD`, and `ROUTE_UPDATE` is **signed**; the quorum logic rejects
  unsigned, duplicate, or out-of-window messages. This gives **Byzantine resistance** — a single
  spoofed or captured node cannot forge a network alert or poison routing.

#### 4.4.5 Firmware / Model (OTA) Security
- All firmware and edge-AI model artifacts are **signed by the issuing CA** and verified by the
  secure element **before** A/B activation; anti-rollback enforced. A failed verification reverts
  to the last-known-good slot automatically.

#### 4.4.6 Operator & API Plane
- Operator/API access is **JWT-gated** (already enforced and security-tested: **15/15 passing**),
  hardened with **MFA**, **role-based access control**, full **audit logging**, and centralized
  **secrets management** (no secrets in code/config; SecretRef indirection).

#### 4.4.7 RF / Spectrum Security
- VHF frames carry cryptographic station identity + replay protection to resist **spoofing** on
  the shared licensed band. **Jamming resilience** is provided by frequency agility and automatic
  failover to the satellite layer, so denial of one medium never silences a station.

#### 4.4.8 Crypto-Agility & Post-Quantum Path
- Algorithms are **negotiated and versioned**, not hard-wired, enabling rotation without re-flashing
  hardware. A defined migration path to **NIST post-quantum** primitives (**ML-KEM / FIPS 203** for
  key establishment, **ML-DSA / FIPS 204** for signatures) protects long-lived national infrastructure.

#### 4.4.9 Standards Alignment
- **FIPS 140-3**-validated crypto modules, **NIST SP 800-53** controls, **IEC 62443** for the
  OT/industrial-control surface, and ICAO security guidance for aviation data.

### 4.5 Hub Resilience & Disaster Recovery
The mesh is engineered to survive without the hub (P1/P2) — but the **hub control plane itself**
(Common Operating Picture, dashboard, coordination, external integrations) must also survive a direct
strike on Nassau:
- **Active-standby hub:** a geographically separate secondary hub (cloud region and/or a hardened
  off-island site) holds continuously replicated state and the COP; **automatic failover** with a
  defined **RTO/RPO**.
- **Data replication & backup:** the SQLite/WAL store streams to the standby and to encrypted
  off-island backups; **point-in-time recovery**.
- **Degraded-mode operation:** if *both* hubs are unreachable, stations continue in autonomous mode
  (§5.4) and reconcile via store-and-forward on recovery — **no data loss**.
- **Failover drills** are part of program acceptance, alongside the per-station autonomous-mode drill.

---

## 5. Communications Network Architecture

### 5.1 Three-Layer Transport Model

| Layer | Technology | Typical Range | Bandwidth | Role | Resilience |
|-------|-----------|---------------|-----------|------|------------|
| **Primary** | Licensed VHF radio mesh (148–174 MHz) | 100+ nm | 9.6 kbps | Station-to-station mesh backbone, local broadcast | Survives extreme weather; line-of-sight + repeater |
| **Secondary** | Cellular (LTE/where coverage exists) | Island cell coverage | Mbps | High-rate hub sync, OTA model/firmware pull | Fails early in storms / power loss |
| **Tertiary** | LEO satellite (Iridium 9603 SBD) | Global | 2.4 kbps | Always-on backup, remote-station lifeline | Hurricane-proof; antenna is the survivable element |

Each station runs **all applicable layers concurrently** with automatic, hysteresis-controlled
failover. Order of preference for hub sync: Cellular → VHF-relay → Satellite. Order for
mesh/consensus: VHF → Satellite. Local alerting (VHF voice/SMS gateway) is independent of all
backhaul and works in full isolation.

### 5.2 Per-Station Hardware Baseline (all 15 nodes)

| Component | Specification |
|-----------|---------------|
| Compute | NVIDIA Jetson Orin Nano (8 GB) — 40 TOPS edge AI inference |
| Primary radio | Motorola MTR3000 VHF repeater (licensed 148–174 MHz) + omni/yagi antenna |
| Satellite | Iridium 9603 SBD transceiver, hurricane-rated patch antenna |
| Cellular | Industrial LTE modem with external antenna (coverage sites only) |
| Sensor suite | Temperature, pressure, wind, humidity, visibility, ceilometer |
| Power | 48 V DC solar array (stowable/cyclone-rated) + battery backup + grid tie + automatic transfer |
| Security | Discrete secure element / TPM 2.0 (FIPS-validated) holding per-node keys; tamper-zeroization |
| Enclosure | NEMA-4X / IP66, large-missile-impact-rated (ASTM E1996/E1886), surge-elevated mounting |
| Structure | Mast/tower to TIA-222-H / ASCE 7 Risk Category IV, ≥180 mph design wind (see §7) |

### 5.3 Per-Station Communications Profile

Tiers: **Hub** = national coordinator; **Major** = regional sub-hub / high traffic;
**Regional** = standard node; **Remote** = isolated, satellite-critical.
VHF# = count of stations reachable on the primary VHF mesh.

| Code | Station | Tier | Cell | Sat | VHF# | Primary VHF neighbors (nm) | Resilience posture |
|------|---------|------|:----:|:---:|:----:|---------------------------|--------------------|
| MYNN | Nassau / Lynden Pindling Intl | Hub | ✅ | ✅ | 5 | MYBC(32), MYCB(53), MYEM(63), MYER(71) | Hub: redundant power + dual cellular; coordinates but non-blocking |
| MYGF | Freeport / Grand Bahama Intl | Major | ✅ | ✅ | 4 | MYBS(60), MYAT(71), MYBC(81), MYAM(87) | Northern sub-hub; relays Abaco/Bimini cluster |
| MYAM | Marsh Harbour / Abaco | Major | ✅ | ✅ | 5 | MYAT(22), MYBC(78), MYEM(84), MYGF(87) | Abaco sub-hub; hurricane-history priority site |
| MYBC | Chub Cay / Berry Islands | Regional | — | ✅ | 8 | MYNN(32), MYBS(77), MYCB(77), MYAM(78) | **Central mesh relay** — best-connected node; satellite-backed (no cell) |
| MYAT | Treasure Cay / Abaco | Regional | ✅ | ✅ | 3 | MYAM(22), MYGF(71), MYBC(84) | Pairs with Marsh Harbour |
| MYEM | Governor's Harbour / Eleuthera | Regional | ✅ | ✅ | 5 | MYER(25), MYNN(63), MYAM(84), MYBC(84) | Eleuthera north anchor |
| MYER | Rock Sound / Eleuthera | Regional | ✅ | ✅ | 5 | MYEM(25), MYNN(71), MYEG(82), MYCB(89) | Eleuthera south anchor |
| MYCB | Congo Town / Andros | Regional | ✅ | ✅ | 4 | MYNN(53), MYBC(77), MYER(89), MYEM(96) | Western flank; links Nassau↔Berry↔Andros |
| MYBS | South Bimini | Regional | ✅ | ✅ | 2 | MYGF(60), MYBC(77) | Western gateway; thin VHF, cell-backed |
| MYLD | Deadman's Cay / Long Island | Regional | ✅ | ✅ | 3 | MYEG(49), MYES(62), MYRD(69) | **Southern chain anchor** — gateway to remote south |
| MYEG | Exuma International | Regional | ✅ | ✅ | 4 | MYLD(49), MYES(80), MYER(82), MYRD(83) | Central-south junction |
| MYES | San Salvador | Remote | ✅ | ✅ | 2 | MYLD(62), MYEG(80) | Eastern outlier; satellite-critical in storms |
| MYRD | Duncan Town / Ragged Island | Remote | — | ✅ | 2 | MYLD(69), MYEG(83) | No cell; VHF to southern chain + satellite |
| MYMM | Mayaguana | Remote | — | ✅ | 1 | MYIG(92) | **Far SE edge** — VHF only to Inagua; satellite is lifeline |
| MYIG | Inagua / Matthew Town | Remote | — | ✅ | 1 | MYMM(92) | **Far SE edge** — VHF only to Mayaguana; satellite is lifeline; first landfall sentinel |

**Key engineering consequences**

- **Chub Cay (MYBC)** is the structural backbone of the mesh (8 neighbors). It must be engineered
  as a hardened relay — extended battery autonomy, repeater-grade VHF, redundant satellite — even
  though it is a small island with no cellular.
- **Inagua (MYIG) and Mayaguana (MYMM)** are the network's remote edge: each has exactly one VHF
  peer (each other, at 92 nm) and **no cellular**. Their Iridium satellite path is mission-critical
  and must be the *first* layer commissioned. Inagua is also the southernmost sentinel — typically
  the Bahamas' first contact with an incoming Atlantic hurricane — so it carries outsized early-warning value.
- The **southern chain** (MYRD ↔ MYLD ↔ MYEG ↔ MYES) is a thin, near-linear topology. Long Island
  (MYLD) is the single articulation point connecting the remote south to the rest of the mesh;
  losing it isolates Ragged Island and weakens the path to San Salvador. It warrants relay-grade
  hardening and a guaranteed satellite fallback.

### 5.4 Failover & Autonomous Operation

1. **Normal:** cellular for hub sync, VHF for mesh/consensus, satellite idle (heartbeat only).
2. **Cellular loss (storm onset):** hub sync migrates to VHF-relay → satellite; mesh continues on VHF.
3. **VHF degradation (mast/antenna damage):** affected node falls back to satellite for both hub
   and critical peer messaging; neighbors re-route around it (distance-vector reconvergence).
4. **Hub unreachable (Nassau isolated):** stations enter **autonomous mode** — local edge AI keeps
   predicting; consensus and alerting continue among reachable peers; local VHF voice/SMS broadcast
   to aviation and emergency frequencies continues uninterrupted.
5. **Recovery:** store-and-forward replays the signed message journal; the hub reconciles and
   re-establishes the authoritative picture.

---

## 6. Mesh Topology (derived)

Primary VHF adjacency (≤100 nm), forming three natural clusters bridged by Nassau and Chub Cay:

- **Northern cluster:** MYGF ↔ MYAT ↔ MYAM ↔ MYBS ↔ MYBC
- **Central cluster:** MYNN ↔ MYBC ↔ MYCB ↔ MYEM ↔ MYER
- **Southern chain:** MYER/MYEG ↔ MYLD ↔ MYRD / MYES, with **MYIG ↔ MYMM** as the detached SE pair
  bridged to the rest only via satellite.

Satellite (Iridium) overlays a **full logical mesh** on top of the VHF partial mesh, guaranteeing
every station can always reach the hub and a designated relay regardless of VHF reachability.

---

## 7. Hurricane Survivability — Category 4/5 Hardening

**Design basis:** every node must survive and keep warning through a **Saffir-Simpson Category 4/5
hurricane** — sustained winds ≥157 mph (252 km/h), gusts beyond 200 mph, multi-day grid and access
loss, flying debris, and storm surge. Hurricane Dorian (2019) — which stalled over Abaco as a Cat 5
with ~185 mph winds and ~20 ft surge — is the **reference design event**.

### 7.1 Survival Core vs. Graceful Degradation
Components are tiered so that even total loss of the exposed elements never silences a station:

| Tier | Components | Requirement under Cat 4/5 |
|------|-----------|---------------------------|
| **Survival core (must operate)** | Edge compute, secure element, battery, **Iridium satellite** link, local VHF/SMS alert broadcast | Continues sensing, predicting, and warning throughout the storm |
| **Resilient (may degrade, must recover)** | VHF mesh radio + mast, solar array | May lose the mast/array at peak; node falls back to satellite; auto-recovers post-storm |
| **Expendable (expected to fail)** | Cellular, grid power, exposed non-critical sensors | Loss is planned-for and routed around |

### 7.2 Structural & Wind Loading
- Masts/towers engineered to **TIA-222-H / ASCE 7** at **Risk Category IV** (essential facility),
  **≥180 mph design wind** with safety margin; foundations and guying certified by a licensed
  structural engineer per site survey.
- The **Iridium patch antenna is the designated survivable element** — low-profile, flush-mounted,
  cyclone-rated — chosen precisely because it presents minimal wind area. VHF masts use
  controlled-failure/breakaway design so a mast loss does not damage the survival core.

### 7.3 Debris, Water & Surge
- Enclosures **NEMA-4X / IP66** and **large-missile-impact-rated** (ASTM E1996/E1886) against
  flying debris.
- Equipment **elevated above base-flood + design surge** (site-specific; remote low-lying sites such
  as Inagua/Matthew Town and Ragged Island elevated to Dorian-class surge); sealed conduit and
  desiccant-managed enclosures against water ingress and humidity.

### 7.4 Power Autonomy
- 48 V solar + battery + grid tie with automatic transfer at every node. Because grid and physical
  access can be lost for **days to weeks**, batteries are sized for **extended autonomy**: standard
  nodes ≥72 h; **remote/relay nodes (MYBC, MYIG, MYMM, MYRD) target 96–120 h** with solar arrays
  that are **stowable or rated to survive** peak winds rather than acting as sails.

### 7.5 Communications Survivability
- The **satellite layer is the storm lifeline** — it is the one path engineered to remain up when
  VHF masts and cellular are gone, so the southern satellite-critical edge (Inagua, Mayaguana,
  Ragged Island) keeps reporting through landfall.
- Autonomous mode (see §5.4) means a node cut off from the hub still runs local edge AI and
  broadcasts local alerts on aviation/emergency VHF — exactly when it matters most.

### 7.6 Deployment Sequencing & Validation
- Stations are commissioned **south-to-north** so the highest-exposure, satellite-critical sites have
  a verified satellite lifeline **before June 1** hurricane season (Master Framework Schedule, gates
  G5/G9, risk R01).
- **Validation:** structural wind certification, missile-impact testing, surge-elevation sign-off,
  and an **extended-autonomy power-cut drill** are part of per-station acceptance (§11).

### 7.7 Lightning, Grounding & Corrosion
Tropical, marine, tall-mast sites face three constant threats beyond wind and surge:
- **Lightning protection:** air terminals/finials on every mast, down-conductors, and a low-impedance
  earth per **IEC 62305 / NFPA 780**; all radios and the edge node sit behind multi-stage **surge
  protective devices (SPDs)** on power, antenna, and data lines. Lightning is a *daily* Bahamian risk,
  not a storm-only one.
- **Grounding & bonding:** a single-point ground with measured low earth resistance; all metalwork,
  enclosures, and cable shields bonded to prevent ground loops and protect the secure element / Jetson
  from transients.
- **Salt-fog corrosion:** marine-grade throughout — stainless / hot-dip-galvanized hardware,
  marine-rated connectors, conformal-coated electronics, gasketed desiccant-managed enclosures — to
  corrosivity category **ISO 9223 C5-M**. Corrosion is the slow killer of unattended coastal sites.

These are gated at design (STR-1) and verified at per-station acceptance (§11).

---

## 8. Emergency-Services & Inter-Agency Integration

BACSWN is designed for **full operational integration with the Bahamian emergency-response
ecosystem** — not merely to publish weather, but to drive and coordinate the national response.
Integration is **bidirectional**: outbound (alerting, evacuation directives, tasking) and inbound
(agency resource status, road/port closures, field incident reports) into one shared picture. This
builds directly on the platform's existing emergency, evacuation, and 42-channel dispatch services.

### 8.1 Integrated Agencies & Systems

| Agency / System | Role in response | Integration |
|-----------------|------------------|-------------|
| **NEMA** (National Emergency Management Agency) | National coordination, declarations, activation | Common Operating Picture + tiered activation triggers |
| **Royal Bahamas Police Force** | Public safety, evacuation enforcement, road closures | COP feed; closure/incident reports inbound; CAP alerts to dispatch |
| **Bahamas Fire Services / Rescue** | Fire, rescue, hazmat | Tasking via CAP/EDXL; field status inbound |
| **Royal Bahamas Defence Force (Coast Guard)** | Maritime SAR, vessel picture, outer-island support | Shared maritime/airspace picture; SAR handoff; pre-positioning |
| **Emergency shelter system** | Shelter activation, capacity, evacuee intake | Bidirectional: activation/occupancy in; surge-aware routing out |
| **EMS / Ministry of Health** | Medical response, casualty management | Alerts + COP; facility status inbound |
| **Supporting:** Port Department, Bahamas Power & Light, Dept. of Meteorology | Ports, power, official forecasts | Status exchange and advisory coordination |

### 8.2 Common Operating Picture (COP)
A single shared, real-time situational picture — storm track/cone, surge & flood overlays,
evacuation zones, shelter status, live flight & maritime tracks, and field incident reports —
available to every agency through the BACSWN dashboard and via API to agency command centers.
**One authoritative source of truth** replaces siloed, phone-and-fax coordination.

### 8.3 Alerting & Tasking (outbound)
- **Standards-based exchange:** **Common Alerting Protocol (CAP, OASIS)** for public and agency
  alerts; **EDXL** for resource and situation exchange — so existing agency CAD/dispatch systems
  can ingest BACSWN alerts natively.
- **Redundant delivery:** the existing 42-channel dispatcher reaches agency operations centers and
  field units over data + SMS + VHF + satellite simultaneously.
- **Tiered activation:** hurricane-category thresholds trigger pre-agreed, per-agency playbooks.

### 8.4 Shelter & Evacuation Integration
- Bidirectional link to the emergency shelter system: shelter **activation, real-time
  capacity/occupancy, and accessibility** feed BACSWN; the **evacuation engine** computes and pushes
  **surge-aware routing** from at-risk zones to the nearest open shelter (extends the platform's
  existing evacuation service).

### 8.5 Maritime & Coast Guard (RBDF)
- Shares the maritime/airspace picture for **search-and-rescue coordination** and outer-island
  logistics; hands off vessel and aircraft tracks; supports asset **pre-positioning** before landfall.

### 8.6 Interoperability Standards & Incident Command
- **CAP / EDXL** data exchange; alignment with the **Incident Command System (ICS)** so BACSWN
  outputs map cleanly onto the national command structure; **open APIs + webhooks** for agency
  CAD/COP systems.

### 8.7 Security, Sovereignty & Resilience of Integrations
- All inter-agency links inherit the **§4.4 cryptographic architecture** (mutual TLS, signed
  envelopes, RBAC, full audit). Data crossing into police/defence networks honors the BACSWN
  **data-sovereignty & governance policy** (national ownership; least-privilege, need-to-know sharing).
- **Resilient by design:** when terrestrial networks fail in a Cat 4/5, alerts and
  shelter/evacuation directives still reach agencies and shelters over the surviving **VHF +
  satellite** layers and each station's **local broadcast** — exactly when inter-agency coordination
  matters most.

### 8.8 Airspace Surveillance — Commercial & Military Overflights
BACSWN maintains a complete real-time picture of **all aircraft transiting the Bahamas FIR**, both
commercial and military:
- **Cooperative traffic:** ADS-B / Mode-S/C surveillance (the platform's existing flight-tracker) —
  identity, position, altitude, and type for commercial and most general-aviation traffic.
- **Military & non-cooperative traffic:** military aircraft frequently suppress ADS-B or use
  encrypted **Mode 5**; complete coverage therefore requires **fusing primary/secondary surveillance
  radar and partner data-sharing feeds** (see §8.9) into the track picture. Primary radar is provided
  by **Raytheon radar equipment installed at designated radar towers** (a distinct, long-lead
  hardware/civil program — see Master Framework Schedule, workstream WS-P). The surveillance layer is
  designed as **pluggable**, so radar and military feeds can be fused without changing the application.
- **One feed, three outputs:** every tracked overflight simultaneously drives **(1) safety &
  airspace management**, **(2) overflight & landing-fee accounting** — the commercial revenue basis,
  since you can only bill what you can count — and **(3) CORSIA carbon-emissions calculation**
  (per-flight CO₂, already implemented). Surveillance is thus the shared backbone of both the safety
  mission and the BOO revenue model.

### 8.9 External & International Interoperability (incl. United States)
The Bahamas FIR abuts U.S.-controlled oceanic airspace; the network is designed to interoperate
beyond national borders as a **phased, future capability** that does not gate the core deployment:
- **Aviation weather exchange:** ICAO **OPMET / WAFS** and **AFTN/AMHS**, so BACSWN SIGMETs and
  observations flow into the international system.
- **United States (anticipated):** **NOAA / NWS / National Hurricane Center** (forecast & storm
  data); the **FAA** — **Miami Oceanic (ZMA ARTCC)** and the **Miami WAFC** — for cross-border traffic
  and airspace coordination; and, where bilaterally agreed, **U.S. military / NORAD** channels for
  shared military-track awareness.
- **Sovereignty-preserving:** all external sharing is **least-privilege, need-to-know**, governed by
  the data-sovereignty & governance policy and secured by the §4.4 cryptographic architecture. The
  Bahamas remains the data owner; cross-border feeds are bilateral and revocable.

---

## 9. Sensing & Response Extensions — IoT Sensor Network & Drones

Beyond the 15 fixed stations, two extension layers densify sensing and add an **active** response
capability. Both attach to the existing mesh, Common Operating Picture, and §4.4 security model.

### 9.1 Distributed IoT Sensor Network
- **Purpose:** low-cost densification of the fixed-station grid — micro weather stations, tipping
  rain gauges, anemometers, **storm-surge / tide / flood-level sensors**, lightning detectors,
  soil-moisture, and marine/buoy sensors — for settlement-level microclimate and flood awareness.
- **Connectivity:** low-power wide-area (**LoRaWAN / NB-IoT**), with each BACSWN station acting as the
  **LoRaWAN gateway** for its island cluster; readings aggregate up the mesh to the COP. Sensors run
  for years on solar/battery.
- **Edge correlation:** the station's edge AI fuses dense IoT readings into its microclimate and
  surge/flood nowcasts; multi-sensor consensus suppresses false readings.
- **Security:** constrained-device profile — **DTLS / lightweight AEAD**, per-device keys, signed
  payloads — inheriting the §4.4 PKI; spoofed or compromised sensors are quarantined.

### 9.2 Drone (UAS) Technology
- **Post-storm damage assessment:** rapid aerial survey of cut-off settlements when roads/ports are
  out, feeding imagery into the COP for NEMA and responders.
- **Weather reconnaissance:** small UAS for atmospheric profiling and sampling the storm environment
  where fixed sensors cannot reach.
- **Search-and-rescue support:** tasked alongside the RBDF Coast Guard over the maritime picture (§8.5).
- **Emergency comms relay:** a drone can act as an airborne relay to **temporarily restore
  connectivity** to a station or island whose VHF/cellular was destroyed, bridging it back to the
  mesh/satellite.
- **Station servicing:** inspection and sensor deployment for remote/relay sites that are hard to reach.
- **Built-in airspace deconfliction (key synergy):** because BACSWN already holds the real-time
  commercial + military air picture (§8.8), it can **safely deconflict its own UAS operations** against
  live traffic — a capability most standalone drone programs lack.
- **Integration & autonomy:** drones are tasked through the emergency/dispatch layer, stream
  telemetry/imagery over the mesh + satellite into the COP, and use edge-AI mission planning; all links
  are secured per §4.4 and flown under **BCAA UAS regulations**.

---

## 10. Standards, Spectrum & Compliance

- **Spectrum:** licensed VHF mesh (148–174 MHz) requires allocation from **URCA**; application is a
  Month-1 critical-path item (risk R03).
- **Aviation:** advisory products conform to **ICAO/WMO SIGMET** format; local broadcast aligns to
  aviation VHF and ATIS-style conventions; coordination with **BCAA**.
- **Emissions:** per-flight CO₂ to **ICAO CORSIA** methodology (already implemented in-platform).
- **Security (§4.4):** **FIPS 140-3** crypto modules, **NIST SP 800-53**, **IEC 62443** (OT),
  signed firmware/OTA, hardware-rooted node identity, mutual TLS 1.3, post-quantum migration path.
- **Structural/survivability (§7):** **TIA-222-H / ASCE 7 Risk Category IV**, **ASTM E1996/E1886**
  missile-impact, site-specific surge elevation.

---

## 11. Acceptance Criteria (per station)

A station is "commissioned" only when: (a) all three applicable transport layers pass a link-budget
and live-traffic test; (b) the node sustains its rated extended-autonomy battery target (≥72 h
standard, 96–120 h remote/relay) in a power-cut test; (c) it joins the mesh, exchanges
`HEARTBEAT`/`OBSERVATION`, and participates in a consensus vote; (d) it runs local edge inference
within latency budget; (e) it performs an autonomous-mode drill (hub disconnected) with continued
local alerting; (f) an OTA A/B firmware update succeeds and rolls back cleanly; **(g) structural,
missile-impact, and surge-elevation survivability are certified for Cat 4/5 design loads (§7);** and
**(h) cryptographic provisioning is verified — secure-element key generation, certificate
enrollment, mutual-TLS/signed-envelope traffic, signed-OTA verification, and tamper-zeroization
(§4.4).**

---

## Annex A — RF Link Budgets

### A.1 Purpose & Method
This annex gives the RF link-budget basis for the VHF mesh and confirms the role of the satellite
overlay. Method: **EIRP − path loss + RX gain − losses**, compared to receiver sensitivity with a fade
margin, plus a **radio-horizon (line-of-sight) geometry check** — which, for VHF over sea, is the
binding constraint.

### A.2 VHF Mesh Parameters (baseline)
| Parameter | Value |
|-----------|-------|
| Band / mid-frequency | 148–174 MHz / 162 MHz, narrowband |
| Radio | Motorola MTR3000, TX 50 W (47 dBm), configurable to 100 W |
| Antenna | 6 dBi omni (mesh) / up to ~11 dBi Yagi (fixed long hops) |
| Feeder + connector loss | 2 dB per end |
| Data rate | 9.6 kbps |
| RX sensitivity | −112 dBm (typical, narrowband) |
| Target fade margin | ≥ 20 dB (over-sea multipath / variability) |
| **EIRP (omni)** | **51 dBm** |

### A.3 Path Loss & Margin (assuming line-of-sight)
| Hop | Free-space path loss | RX power | Margin over sensitivity |
|-----|---------------------:|---------:|------------------------:|
| 22 nm | 108.8 dB | −53.8 dBm | 58 dB |
| 25 nm | 109.9 dB | −54.9 dBm | 57 dB |
| 50 nm | 116.0 dB | −61.0 dBm | 51 dB |
| 77 nm | 119.7 dB | −64.7 dBm | 47 dB |
| 92 nm | 121.3 dB | −66.3 dBm | 46 dB |

**Finding:** where line-of-sight exists, every mesh hop closes with **45–58 dB** of margin — far above
the 20 dB target. **VHF links are not power-limited.**

### A.4 The Binding Constraint — Radio Horizon
VHF is line-of-sight; over sea the limit is the radio horizon (4/3-earth):
**d_LOS (nm) ≈ 2.22 (√h₁ + √h₂)**, heights in metres.

| Antenna height (each end) | LOS range |
|---------------------------|-----------|
| 30 m | 24 nm |
| 50 m | 31 nm |
| 100 m | 44 nm |
| 150 m | 54 nm |
| 200 m | 63 nm |

A 92 nm single hop would need **~430 m** of combined antenna/terrain height — impractical at the
low-lying remote sites.

### A.5 Design Consequences (validates §5–§7)
- **Single-hop VHF** is reliably engineered to **~30–45 nm** with practical 50–100 m masts (further
  where elevated terrain exists), with ample power margin.
- **Mid-range gaps** are bridged by **multi-hop routing** through intermediate stations — the routing
  graph (§6) is a *routing* topology, not a claim of direct LOS on every edge.
- **The remote SE edge (Inagua ↔ Mayaguana, 92 nm)** is **beyond practical VHF LOS**, confirming the
  architecture's decision that the **Iridium satellite overlay is their primary/critical path**
  (§5.3, §7.5) — not a fallback.
- Tropospheric ducting over warm sea can occasionally extend VHF far beyond horizon, but is **not
  relied upon** for design.

### A.6 Satellite & Cellular
- **Iridium 9603 SBD** is a closed LEO system with its own managed link budget; the design relies on
  its global availability and hurricane-proof low-profile antenna, not a site-specific budget. Its
  low rate (~2.4 kbps) is sufficient for HEARTBEAT / ALERT / critical messaging.
- **Cellular** is opportunistic (coverage islands only), treated as bonus bandwidth, not budgeted.

### A.7 Verification
Per-station SAT (§11; V&V plan BACSWN-VV-2026-006) includes a **measured link-budget + live-traffic
test** per transport layer; field-measured margins are recorded in the RTM and must meet the ≥ 20 dB
VHF target — or the hop is realized by relay/satellite.

---

*Companion documents: BACSWN Master Framework Schedule (BACSWN-SCHED-2026-003); BACSWN Operations &
Maintenance Plan (BACSWN-OM-2026-004); BACSWN Data Governance & Sovereignty Policy
(BACSWN-GOV-2026-005); BACSWN Master V&V and ICD Plan (BACSWN-VV-2026-006); BACSWN Training &
Capacity-Building Plan (BACSWN-TRN-2026-007); BACSWN SWOT & Risk Analysis (BACSWN-RISK-2026-008); Board
Runbook (technology highlights); Distributed Intelligence Architecture Whitepaper (BACSWN-ARCH-2026-001).*
