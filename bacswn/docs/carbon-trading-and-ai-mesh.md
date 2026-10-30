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
- State is in memory per process and resets on restart. Contract specs are realistic; **prices are synthetic.**
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
