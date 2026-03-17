# BACSWN AI Agents

Seven autonomous agents that form the operational backbone of the SkyWatch Bahamas platform.

## Agent Pipeline

```
bacswn-wx-monitor (60s) → bacswn-chief (escalation) → bacswn-sigmet-drafter (event)
                                    ↓
bacswn-flight-tracker (30s) → bacswn-emissions-analyst (hourly)
                                    ↓
bacswn-qc (30s) ──────────→ bacswn-dispatch (event) → 42 channels
```

## Agents

### bacswn-chief
- **Role**: Operations orchestrator
- **Trigger**: Escalation from other agents
- **Responsibilities**: Evaluates events, makes operational decisions, coordinates agent responses

### bacswn-wx-monitor
- **Role**: Weather change detection
- **Trigger**: Every 60 seconds
- **Responsibilities**: Polls AWC for METAR updates, detects significant weather changes (IFR/LIFR transitions), triggers SIGMET drafting when conditions warrant

### bacswn-flight-tracker
- **Role**: Airspace picture maintenance
- **Trigger**: Every 30 seconds
- **Responsibilities**: Polls OpenSky Network for aircraft in Bahamas FIR bounding box, maintains real-time airspace picture

### bacswn-sigmet-drafter
- **Role**: ICAO advisory generation
- **Trigger**: On significant weather change (event-driven)
- **Responsibilities**: Generates ICAO-formatted SIGMET advisories based on detected hazards, follows WMO/ICAO format standards

### bacswn-emissions-analyst
- **Role**: CORSIA carbon calculation
- **Trigger**: Hourly batch processing
- **Responsibilities**: Calculates per-flight CO2 emissions using ICAO CORSIA methodology, maintains compliance dashboard

### bacswn-dispatch
- **Role**: Multi-channel alert sender
- **Trigger**: On emergency or advisory issuance (event-driven)
- **Responsibilities**: Dispatches alerts to 42 configured channels (WhatsApp, Telegram, Slack, Discord, SMS, email, radio, satellite, etc.)

### bacswn-qc
- **Role**: Data quality validation
- **Trigger**: Every 30 seconds (continuous)
- **Responsibilities**: Validates incoming observation data, detects anomalies (out-of-range temperatures, missing reports), flags data quality issues
