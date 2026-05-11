# Local Smoke Test Runbook

Step-by-step guide for verifying the JudicialPredict dev stack from a clean checkout.

## Prerequisites

- Docker + Docker Compose running
- `uv` installed
- Dev stack up: `docker compose -f docker-compose.dev.yml up -d`

## 1. Start ml-inference-svc

```bash
cd python/ml-inference-svc
# Train the champion model first if mlruns/champion.json is missing:
uv run python scripts/train_first_models.py

# Start the dual-protocol server (HTTP :8001 + gRPC :51051):
uv run uvicorn ml_inference_svc.main:app --host 0.0.0.0 --port 8001
```

## 2. HTTP probes

```bash
# Liveness
curl -s http://127.0.0.1:8001/healthz
# Expected: {"status":"ok"}

# Readiness (requires champion.json)
curl -s http://127.0.0.1:8001/readyz
# Expected: {"status":"ready"}

# Prediction
curl -s -X POST http://127.0.0.1:8001/predict \
  -H "Content-Type: application/json" \
  -d '{
    "judge_severity": 0.6,
    "attorney_win_rate": 0.7,
    "ideology_distance": 0.3,
    "materiality_score": 0.8,
    "procedural_motion_count": 2,
    "case_type": "civil",
    "jurisdiction": "Federal"
  }'
# Expected: JSON with p_win, ci_lower, ci_upper, model_version, predicted_at_unix
```

## 3. gRPC server

### Verify port 51051 is listening

```bash
nc -zv 127.0.0.1 51051
# Expected: Connection to 127.0.0.1 51051 port [tcp/*] succeeded!
```

### Probe with grpcurl (if installed)

```bash
grpcurl -plaintext 127.0.0.1:51051 list
# Expected: judicialpredict.ml_plane.inference.v1.InferenceService

grpcurl -plaintext \
  -d '{"case_id":"smoke-001","feature_ids":["judge_severity:0.6","attorney_win_rate:0.7","ideology_distance:0.3","materiality_score:0.8","procedural_motion_count:2","case_type:civil","jurisdiction:Federal"]}' \
  127.0.0.1:51051 \
  judicialpredict.ml_plane.inference.v1.InferenceService/PredictCaseOutcome
```

> **Note:** `grpcurl list` requires server reflection to be enabled. Reflection is not
> yet wired in this sprint (deferred); use `nc -zv` as the connectivity probe instead.
> Full reflection support is a deferred item — see JP-70 deferred list.

### Environment variable

Set `ML_INFERENCE_GRPC_PORT` to override the default port (51051):

```bash
ML_INFERENCE_GRPC_PORT=51052 uv run uvicorn ml_inference_svc.main:app --port 8001
```

## 4. Run the test suite

```bash
cd python/ml-inference-svc
uv run pytest
# All tests should pass (HTTP + gRPC).
```
