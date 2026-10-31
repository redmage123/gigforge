# Carbon Desk & Distributed AI Mesh

Two demo capabilities added to SkyWatch. Both are **simulations** and are labelled as such in the UI.

## 1. Carbon Desk — CME emissions-offset futures (`/carbon-trading`)

### Can BACSWN trade on CME directly? Not today.
CME Group lists physically delivered offset futures, all **1,000 offsets per contract**:

| Product | Code | Underlying |
|---|---|---|
| CBL Global Emissions Offset | GEO | CORSIA-eligible units (Verra, ACR, CAR) |
| CBL Nature-Based Global Emissions Offset | N-GEO (Globex `NGO`) | Verra AFOLU nature-based units |
| CBL Core Global Emissions Offset | C-GEO (`CGO`) | Energy/technology Verra units |

Order entry to CME Globex goes through **iLink 3** (binary/SBE over Market Segment Gateways) or CME's
order-entry web APIs (REST / WebSocket). Either way it requires a **clearing FCM** that enables your firm ID,
plus CME connectivity certification. CME's WebSocket *market-data* API (launched Nov 2023) gives top of book,
trades, settlement, volume and open interest, but it is not an order-entry route. There is no public
API key that lets an application place CME orders.

**Practical route to live trading:** open an account with an FCM or broker that clears CME energy/emissions
futures and exposes an API (e.g. CQG, Trading Technologies, Rithmic or Interactive Brokers). Then implement the
`TradingVenue` protocol in `services/carbon_exchange.py` against that API. The UI and REST/WebSocket contract
stay the same. Confirm the specific GEO/N-GEO/C-GEO listing and permissions with the broker first. Volumes in
these contracts are thin.

Sources: CME product pages and SER 9375 (vintage rules), CME electronic-trading notices on iLink 3 and
Market Data over WebSocket.

### What the simulator does
- `services/carbon_exchange.py`: a price-time-priority matching engine per contract (next 4 quarterly
  expiries per product). Order types MKT / LMT / STP / STL, TIF DAY / GTC / IOC / FOK. Simulated market
  makers quote around a mean-reverting fair value with contango, and noise traders and market headlines
  move it.
- Risk: initial-margin buying-power check, ±20% price banding, 500-lot max. P&L is marked to last; fees are
  $1.85 per contract per side.
- The engine matches in memory; `services/trading_store.py` writes changes behind to SQLite every
  second (market data every 15 s) and on shutdown, and restores them at startup: accounts, positions,
  open orders (back in the book in time priority), order history, fills, spot levels, instrument stats
  and 1-minute bars. A crash loses at most the last second. Positions in contracts that expired while
  the server was down are closed at their last price (an `EXPIRY` fill) and their orders cancelled.
  Contract specs are realistic; **prices are synthetic.**
- `GET /api/trading/corsia-obligation` turns BACSWN's live CORSIA fuel-burn emissions for Bahamas FIR traffic
  into an annualised offset requirement (illustrative 10% sector growth factor). It measures coverage by
  long GEO positions, and the UI can load a hedge ticket from it.
- Streaming: `ws /ws/trading?token=…` pushes market data and the caller's account every 500 ms. The client
  sends `{"focus": "<symbol>"}` to choose which contract's depth and tape are included.

## 2. Distributed AI Mesh (`/mesh`)

`services/mesh_network.py` implements Mesh Architecture Master Plan §4.1–4.2 as a live simulation (each
wall-clock second is 5 simulated minutes):

- **Weather field:** convective cells, frontal squall lines and fog banks drift across the islands. They are
  the ground truth.
- **Three models per station, 2-of-3 to act:** each model works from a different modality.
  - **TEMPO** reads the station's sensor time-series.
  - **VISTA** reads radar/satellite with a 30-minute nowcast.
  - **LEXIS** reads METAR text, climatology, and upstream peer hand-offs.
  - When they split, the station holds its last verdict and takes no autonomous action.
- **Minority reports:** a lone dissent that persists for ≥2 ticks is logged. After 40 simulated minutes it is
  scored against ground truth as *vindicated* or *dismissed*. A model with 3 dismissed reports in 150
  simulated minutes is **quarantined**, and the station continues 2-of-2. Dissent alone never quarantines a
  model: VISTA often dissents correctly while a storm is still inbound.
- **Multi-station consensus:** a new hazard call is put to up to 4 neighbours. They vote from their *own radar*
  view of the originator. If confirmed, an ALERT is routed to the Nassau hub. If rejected, the station is
  flagged for maintenance. This catches a stuck sensor that fools two of the station's own models.
- **Routing:** Dijkstra over live links (latency cost). With no route to the hub, alerts wait in a
  store-and-forward queue and are delivered when the mesh heals.
- **Fault injection / scenarios:** `POST /api/mesh/fault`, `/api/mesh/storm`, and
  `/api/mesh/scenario/{squall_line|rogue_precog|sensor_fault|partition|reset}`.

## CORSIA oversight register (`/corsia-oversight`)

**Who holds credits.** Under CORSIA the offsetting obligation sits with aircraft operators: they buy
CORSIA-eligible units and cancel them in the issuing registry (Verra, Gold Standard, ACR, …). The state
that administers an operator verifies its emissions reports and its cancellations, then reports to ICAO.
The Bahamian government and ATC therefore do not acquire credits; BACSWN models the state's oversight role.
(The Carbon Desk's hedging view is an operator's perspective and is kept as a market demo.)

**What is recorded** (`services/carbon_oversight.py`, `api/carbon_oversight.py`):

| Table | Meaning |
|---|---|
| `carbon_operators` | Operators attributed to the Bahamas, by ICAO designator |
| `carbon_emission_reports` | Verified annual CO₂ and the ICAO growth factor → offsetting requirement. A new report for the same year supersedes the old one; both are kept |
| `carbon_unit_claims` | Units an operator says it cancelled: registry, serial block/range, vintage, project, registry reference |
| `carbon_claim_reviews` | The state's decisions on each claim (VERIFIED / REJECTED / REOPENED), with reviewer and reason |
| `carbon_fir_observations` | BACSWN's own sightings: one row per continuous FIR segment of an airline flight |

Evidence tables are **append-only**, enforced by SQLite triggers. Writes require the `admin` role; reads are
open to any signed-in user. The claims register exports to CSV, with formula-injection neutralised.

**Findings** (computed per compliance period): units claimed twice (overlapping serial ranges in the same
registry/block, across operators and periods), units not declared CORSIA-eligible, vintages outside the
phase window, missing annual reports, closed-period shortfalls, and reports **lower than the CO₂ BACSWN
observed inside the FIR** (an operator's network-wide total can never be below its FIR slice; 10% tolerance
for the category-based estimate). Sightings from the simulated fallback flight feed are stored and shown
but never used as evidence.

Vintage windows for the pilot (2016–2020) and first phase (2021–2026) follow ICAO's CORSIA Eligible
Emissions Units document; later phases have no window yet. Check `PERIODS` against the current ICAO
document before relying on it for real compliance work.

## Mesh: Tomorrow.io satellite input and ground sensor networks

**Satellite feed (simulated)** — `services/mesh_satellite.py`. Models Tomorrow.io's two instrument
families: a Ka-band precipitation radar (a pass over each station every 60 sim-minutes) and a microwave
sounder (every 30), with passes sweeping west to east and products arriving one tick (5 min) after the
pass. Each pass scans ~95 nm around the station. Observations come from the simulation's weather field,
so they agree with the storms on the map. Products count for decisions while ≤ 45 minutes old.

How stations use it:

| Use | Behaviour |
|---|---|
| Ensemble tie-break | When TEMPO/VISTA/LEXIS split, a fresh satellite call that matches one model decides (`SAT TIE-BREAK`) instead of holding the old verdict |
| Hazard verification | The satellite casts an extra vote alongside peers' radar; an isolated station can be confirmed by the satellite alone |
| Sensor cross-check | A rain gauge or visibility sensor contradicted by a pass taken *after* the unusual reading began is flagged SUSPECT and TEMPO's confidence is cut. Zero false flags in 36,000 fault-free station-ticks; a stuck sensor is caught at the next radar pass (~1 h) |
| Outlook | Cells due within 60 min, beyond VISTA's 30-min nowcast, shown and noted in LEXIS's reasoning |

**Live Tomorrow.io (reference only)** — `services/tomorrow_client.py`, `GET /api/mesh/node/{id}/live-weather`.
With `TOMORROW_API_KEY` set, the station dashboard shows real current conditions from Tomorrow.io's v4
realtime endpoint (Tomorrow.io's blended satellite/radar/station/model product). Not fed into the
simulation, which would contradict its synthetic storms. Fetched only when a dashboard asks, cached 30 min
per station, capped at 20 calls/hour and 400/day (free tier: 25/500), one-hour back-off on HTTP 429.
The key is never sent to the browser or logged.

**Ground sensor network (mock)** — `services/mesh_sensor_network.py`. Ten sensors per station: the
station's own anemometer, barometer, rain gauge, thermo-hygrometer, visibility/present-weather sensor and
ceilometer (the readings TEMPO uses), a lightning detector, a tide & sea-state gauge, and two remote
outstations 20–25 km out that sample the weather at their own positions, so storms appear across the
network before reaching the station. Each sensor reports battery, signal and report age, keeps a 2-hour
history (trend line plus a text summary), and can miss reports (STALE). Status is the network's own view;
injected faults are shown separately as presenter ground truth, so the demo shows detection.
Satellite and sensor noise use their own random stream, so seeded runs of the existing scenarios behave
exactly as before.
