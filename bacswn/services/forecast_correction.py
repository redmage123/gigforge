"""BACSWN — Forecast bias correction (MOS).

Model-output-statistics that learns each station's forecast error and removes
it. Three candidate correctors compete, the winner chosen on a validation split:

  * mean-bias  — subtract the average error (robust baseline)
  * linear     — observed ~ a + b·forecast + c·lead + diurnal terms
  * gbm        — gradient-boosted trees over the same features (conditional,
                 non-linear bias; e.g. over-forecasting only strong winds)

Honesty guardrails:
  * Reporting is OUT-OF-SAMPLE via a 3-way temporal split — train (60%) fits the
    candidates, validation (20%) picks the method, and the untouched test (20%)
    measures raw-vs-corrected error. The model never sees the test period.
  * The deployable corrector (applied to live forecasts at capture time) is the
    val-selected method refit on all available history, persisted to disk.

scikit-learn is optional — if unavailable the GBM candidate is skipped and we
fall back to linear / mean-bias, so the feature degrades gracefully.
"""

from __future__ import annotations

import logging
import math
import pickle
from datetime import datetime, timedelta, timezone
from itertools import groupby

import numpy as np

from config import STATION_COORDS, DATA_DIR
from services.database import db_execute
from services.forecast_verification import VARIABLES, _now, _iso, _accuracy_pct

logger = logging.getLogger("bacswn.correction")

try:
    from sklearn.ensemble import HistGradientBoostingRegressor
    _HAS_SKLEARN = True
except Exception:  # pragma: no cover - environment without sklearn
    _HAS_SKLEARN = False

try:
    from threadpoolctl import threadpool_limits
except Exception:  # pragma: no cover
    import contextlib

    def threadpool_limits(*a, **k):  # type: ignore
        return contextlib.nullcontext()

_MODELS_PATH = str(DATA_DIR / "correctors.pkl")
_REGISTRY: dict = {}

# Cached scoreboard — the out-of-sample eval is expensive (dozens of model
# fits), so it is computed on a schedule and served from here, never per-request.
_SCOREBOARD_CACHE: dict | None = None

_MIN_GROUP = 50          # min rows per (station, variable, lead) cell
_MIN_GBM = 80            # GBM only fits where a cell has enough training rows


# ── Features ─────────────────────────────────────────────────────────────────
def _hour_of(valid_at: str) -> float:
    try:
        return datetime.fromisoformat(valid_at).astimezone(timezone.utc).hour
    except Exception:
        return 12.0


def _features(rows: list[dict]):
    X, y = [], []
    for r in rows:
        h = _hour_of(r["valid_at"])
        X.append([
            float(r["forecast_value"]), float(r["lead_h"]),
            math.sin(2 * math.pi * h / 24), math.cos(2 * math.pi * h / 24),
        ])
        y.append(float(r["observed_value"]))
    return np.array(X, dtype=float), np.array(y, dtype=float)


def _feature_row(forecast_value: float, lead_h: float, valid_at: str):
    h = _hour_of(valid_at)
    return np.array([[float(forecast_value), float(lead_h),
                      math.sin(2 * math.pi * h / 24), math.cos(2 * math.pi * h / 24)]], dtype=float)


# ── Candidate correctors ─────────────────────────────────────────────────────
def _fit_candidates(X, y) -> dict:
    cands = {}
    cands["identity"] = ("identity", None)          # raw forecast, no correction
    cands["mean-bias"] = ("meanbias", float(np.mean(X[:, 0] - y)))
    try:
        A = np.column_stack([np.ones(len(X)), X])
        coef, *_ = np.linalg.lstsq(A, y, rcond=None)
        cands["linear"] = ("linear", coef)
    except Exception:
        pass
    if _HAS_SKLEARN and len(X) >= _MIN_GBM:
        try:
            # Monotonic in the forecast value (feature 0): a corrector must never
            # map a higher forecast to a lower expected observation. This blocks
            # the most common overfit and keeps the correction physically sane.
            m = HistGradientBoostingRegressor(
                max_iter=80, max_depth=2, learning_rate=0.05,
                l2_regularization=2.0, min_samples_leaf=40, random_state=0,
                monotonic_cst=[1, 0, 0, 0],
            )
            # Cap threads: unbounded OpenMP stalls on busy multi-tenant hosts.
            with threadpool_limits(limits=1):
                m.fit(X, y)
            cands["gbm"] = ("gbm", m)
        except Exception as e:  # pragma: no cover
            logger.debug(f"GBM fit skipped: {e}")
    return cands


def _fit_one(name: str, X, y):
    return _fit_candidates(X, y).get(name) or ("meanbias", float(np.mean(X[:, 0] - y)))


def _predict(model, X):
    kind, obj = model
    if kind == "identity":
        return X[:, 0]
    if kind == "meanbias":
        return X[:, 0] - obj
    if kind == "linear":
        return np.column_stack([np.ones(len(X)), X]) @ obj
    return obj.predict(X)


# Simple -> complex. A more complex model is only chosen if it beats every
# simpler one on validation by more than this margin — Occam's razor, which
# keeps noise on a single split from selecting an overfit model that
# generalizes worse out-of-sample.
_COMPLEXITY_ORDER = ["identity", "mean-bias", "linear", "gbm"]
# A complex model must beat every simpler one on validation by this margin to be
# chosen. Set conservatively: for low-dimensional bias correction a single split
# can flatter an overfit model, so we demand a clear, large validation win before
# stepping up — favouring robust, generalizable corrections.
_SELECT_MARGIN = 0.05


def _select(cands: dict, Xva, yva):
    """Pick the simplest model within the selection margin of the best val MAE."""
    maes = {name: float(np.mean(np.abs(_predict(model, Xva) - yva)))
            for name, model in cands.items()}
    return _pick_simplest(maes)


def _pick_simplest(maes: dict) -> str:
    if not maes:
        return "identity"
    best = min(maes.values())
    for name in _COMPLEXITY_ORDER:
        if name in maes and maes[name] <= best * (1 + _SELECT_MARGIN) + 1e-9:
            return name
    return min(maes, key=maes.get)


def _cv_mae(X, y, k: int = 4) -> dict:
    """Mean MAE per candidate across k contiguous folds (time-series CV).

    A corrector only looks good here if it helps across multiple time slices, so
    a bias that appears in one period but not others (non-stationary noise) is
    rejected — exactly what we want before trusting a learned correction.
    """
    n = len(X)
    if n < 40:
        return {}
    fold = n // k
    sums: dict[str, float] = {}
    counts: dict[str, int] = {}
    for i in range(k):
        a = i * fold
        b = n if i == k - 1 else (i + 1) * fold
        mask = np.ones(n, dtype=bool)
        mask[a:b] = False
        Xtr, ytr, Xte, yte = X[mask], y[mask], X[a:b], y[a:b]
        if len(Xtr) < 20 or len(Xte) < 5:
            continue
        for name, model in _fit_candidates(Xtr, ytr).items():
            mae = float(np.mean(np.abs(_predict(model, Xte) - yte)))
            sums[name] = sums.get(name, 0.0) + mae * len(Xte)
            counts[name] = counts.get(name, 0) + len(Xte)
    return {name: sums[name] / counts[name] for name in sums if counts.get(name)}


def _select_cv(X, y) -> str:
    """Cross-validated, simplicity-biased model selection."""
    maes = _cv_mae(X, y)
    if not maes:
        # Too little data to cross-validate — fall back to a single split.
        s = int(len(X) * 0.75)
        if s < 10 or len(X) - s < 3:
            return "mean-bias" if len(X) else "identity"
        return _select(_fit_candidates(X[:s], y[:s]), X[s:], y[s:])
    return _pick_simplest(maes)


# ── Out-of-sample evaluation (3-way temporal split) ──────────────────────────
def train_eval_group(rows: list[dict]) -> dict | None:
    """rows sorted by valid_at. Returns out-of-sample raw/corrected errors."""
    n = len(rows)
    if n < _MIN_GROUP:
        return None
    split = int(n * 0.8)
    dev, te = rows[:split], rows[split:]   # select+fit on dev; test fully held out
    if len(dev) < _MIN_GROUP or len(te) < 8:
        return None
    Xdev, ydev = _features(dev)
    Xte, yte = _features(te)
    # Cross-validate the model choice on dev, refit it on all of dev, score test.
    name = _select_cv(Xdev, ydev)
    final = _fit_one(name, Xdev, ydev)
    pte = _predict(final, Xte)
    return {
        "method": name,
        "raw_err": Xte[:, 0] - yte,
        "corr_err": pte - yte,
        "test_leads": Xte[:, 1],
        "n_test": len(te),
    }


def get_cached_scoreboard() -> dict:
    """Serve the precomputed scoreboard instantly (never fits in the request path)."""
    if _SCOREBOARD_CACHE is None:
        return {
            "variables": {}, "by_lead": [], "method_counts": {},
            "overall_raw_accuracy_pct": None, "overall_corr_accuracy_pct": None,
            "sample_size": 0, "sklearn": _HAS_SKLEARN, "live_applied": {"applied_rows": 0, "verified_rows": 0},
            "status": "computing",
            "method": "Bias-correction evaluation is computing in the background — refresh shortly.",
        }
    return _SCOREBOARD_CACHE


async def refresh_scoreboard(window_hours: int = 720) -> dict:
    """Compute the scoreboard and store it in the cache. Run off the request path."""
    global _SCOREBOARD_CACHE
    _SCOREBOARD_CACHE = await compute_scoreboard(window_hours)
    return _SCOREBOARD_CACHE


async def compute_scoreboard(window_hours: int = 720) -> dict:
    """Raw vs MOS-corrected forecast accuracy, evaluated out-of-sample.

    The sklearn fitting is CPU-bound, so the heavy work runs in a worker thread
    (via asyncio.to_thread) to avoid blocking the async event loop, and threads
    are capped to keep it from oversubscribing cores on a busy host.
    """
    since = _iso(_now() - timedelta(hours=window_hours))
    rows_by_var = {}
    for var in VARIABLES:
        rows_by_var[var] = await db_execute(
            "SELECT station_id, lead_h, valid_at, forecast_value, observed_value "
            "FROM forecast_verifications WHERE status='verified' AND variable=? "
            "AND valid_at>=? AND forecast_value IS NOT NULL AND observed_value IS NOT NULL "
            "ORDER BY station_id, valid_at ASC",
            [var, since],
        )
    live = await _live_applied_stats()
    import asyncio
    return await asyncio.to_thread(_scoreboard_sync, rows_by_var, window_hours, live)


def _scoreboard_sync(rows_by_var: dict, window_hours: int, live: dict) -> dict:
    variables = {}
    method_counts: dict[str, int] = {}
    lead_raw: dict[int, list] = {}
    lead_corr: dict[int, list] = {}

    with threadpool_limits(limits=1):
      for var, meta in VARIABLES.items():
        rows = rows_by_var.get(var, [])
        raw_chunks, corr_chunks = [], []
        rows.sort(key=lambda r: (r["station_id"], r["lead_h"], r["valid_at"]))
        for (sid, lead), grp in groupby(rows, key=lambda r: (r["station_id"], r["lead_h"])):
            res = train_eval_group(list(grp))
            if not res:
                continue
            method_counts[res["method"]] = method_counts.get(res["method"], 0) + 1
            raw_chunks.append(res["raw_err"])
            corr_chunks.append(res["corr_err"])
            if var == "temp_c":
                for lead, re_, ce in zip(res["test_leads"], res["raw_err"], res["corr_err"]):
                    lead_raw.setdefault(int(lead), []).append(re_)
                    lead_corr.setdefault(int(lead), []).append(ce)
        if not raw_chunks:
            continue
        raw = np.concatenate(raw_chunks)
        corr = np.concatenate(corr_chunks)
        raw_mae, corr_mae = float(np.mean(np.abs(raw))), float(np.mean(np.abs(corr)))
        variables[var] = {
            "label": meta["label"], "unit": meta["unit"],
            "raw_mae": round(raw_mae, 2), "corr_mae": round(corr_mae, 2),
            "raw_bias": round(float(np.mean(raw)), 2), "corr_bias": round(float(np.mean(corr)), 2),
            "raw_rmse": round(float(np.sqrt(np.mean(raw ** 2))), 2),
            "corr_rmse": round(float(np.sqrt(np.mean(corr ** 2))), 2),
            "n_eval": int(raw.size),
            "improvement_pct": round((raw_mae - corr_mae) / raw_mae * 100, 1) if raw_mae > 0 else 0.0,
            "raw_accuracy_pct": _accuracy_pct(raw_mae, meta["good"]),
            "corr_accuracy_pct": _accuracy_pct(corr_mae, meta["good"]),
        }

    by_lead = []
    for lead in sorted(lead_raw):
        r = np.array(lead_raw[lead])
        c = np.array(lead_corr[lead])
        by_lead.append({
            "lead_h": lead,
            "raw_mae": round(float(np.mean(np.abs(r))), 2),
            "corr_mae": round(float(np.mean(np.abs(c))), 2),
        })

    raw_accs = [v["raw_accuracy_pct"] for v in variables.values() if v["raw_accuracy_pct"] is not None]
    corr_accs = [v["corr_accuracy_pct"] for v in variables.values() if v["corr_accuracy_pct"] is not None]

    return {
        "window_hours": window_hours,
        "variables": variables,
        "by_lead": by_lead,
        "overall_raw_accuracy_pct": round(sum(raw_accs) / len(raw_accs), 1) if raw_accs else None,
        "overall_corr_accuracy_pct": round(sum(corr_accs) / len(corr_accs), 1) if corr_accs else None,
        "method_counts": method_counts,
        "sklearn": _HAS_SKLEARN,
        "live_applied": live,
        "sample_size": int(sum(v["n_eval"] for v in variables.values())),
        "method": ("Per station x variable. Candidates (mean-bias, linear, gradient-boosted) "
                   "fit on the oldest 60% of history; the method is chosen on a 20% validation "
                   "split and raw vs corrected error is measured out-of-sample on the newest 20%."),
        "generated_at": _iso(_now()),
    }


async def _live_applied_stats() -> dict:
    """How the live-applied corrections are doing on already-verified rows."""
    rows = await db_execute(
        "SELECT abs_error, corrected_abs_error FROM forecast_verifications "
        "WHERE source='live' AND status='verified' AND corrected_value IS NOT NULL "
        "AND abs_error IS NOT NULL AND corrected_abs_error IS NOT NULL", [])
    pend = await db_execute(
        "SELECT COUNT(*) AS c FROM forecast_verifications "
        "WHERE source='live' AND corrected_value IS NOT NULL", [])
    out = {"applied_rows": pend[0]["c"] if pend else 0, "verified_rows": len(rows)}
    if len(rows) >= 20:
        raw = np.array([r["abs_error"] for r in rows], float)
        corr = np.array([r["corrected_abs_error"] for r in rows], float)
        out["raw_mae"] = round(float(np.mean(raw)), 2)
        out["corr_mae"] = round(float(np.mean(corr)), 2)
    return out


# ── Deployable registry (applied to live forecasts at capture time) ──────────
def load_registry() -> None:
    global _REGISTRY
    try:
        with open(_MODELS_PATH, "rb") as f:
            _REGISTRY = pickle.load(f)
        logger.info(f"Loaded {len(_REGISTRY)} forecast correctors")
    except Exception:
        _REGISTRY = {}


def save_registry() -> None:
    try:
        with open(_MODELS_PATH, "wb") as f:
            pickle.dump(_REGISTRY, f)
    except Exception as e:  # pragma: no cover
        logger.warning(f"Could not persist correctors: {e}")


def _train_sync(rows_by_var: dict) -> tuple[dict, dict]:
    reg: dict = {}
    method_counts: dict[str, int] = {}
    with threadpool_limits(limits=1):
        for var in VARIABLES:
            rows = sorted(rows_by_var.get(var, []),
                          key=lambda r: (r["station_id"], r["lead_h"], r["valid_at"]))
            for (sid, lead), grp in groupby(rows, key=lambda r: (r["station_id"], r["lead_h"])):
                grp = list(grp)
                if len(grp) < _MIN_GROUP:
                    continue
                Xall, yall = _features(grp)
                # Same CV selection as the scoreboard, then fit on all history.
                name = _select_cv(Xall, yall)
                reg[(sid, var, int(lead))] = _fit_one(name, Xall, yall)
                method_counts[name] = method_counts.get(name, 0) + 1
    return reg, method_counts


async def train_correctors(window_hours: int = 720) -> dict:
    """Fit the deployable corrector per station x variable and persist it.

    CPU-bound fitting runs in a worker thread so it never blocks the event loop.
    """
    import asyncio
    since = _iso(_now() - timedelta(hours=window_hours))
    rows_by_var = {}
    for var in VARIABLES:
        rows_by_var[var] = await db_execute(
            "SELECT station_id, lead_h, valid_at, forecast_value, observed_value "
            "FROM forecast_verifications WHERE status='verified' AND variable=? "
            "AND valid_at>=? AND forecast_value IS NOT NULL AND observed_value IS NOT NULL "
            "ORDER BY station_id, valid_at ASC",
            [var, since],
        )
    reg, method_counts = await asyncio.to_thread(_train_sync, rows_by_var)
    global _REGISTRY
    _REGISTRY = reg
    save_registry()
    logger.info(f"Trained {len(reg)} forecast correctors {method_counts}")
    # Refresh the cached out-of-sample scoreboard on the same cadence as training.
    try:
        await refresh_scoreboard(window_hours)
    except Exception as e:  # pragma: no cover
        logger.warning(f"Scoreboard refresh after training failed: {e}")
    return {"correctors": len(reg), "method_counts": method_counts}


def apply_to_forecast(station: str, variable: str, lead_h: float,
                      valid_at: str, forecast_value: float | None) -> float | None:
    """Corrected forecast for a single point, or None if no model / not applicable."""
    if forecast_value is None:
        return None
    model = _REGISTRY.get((station, variable, int(lead_h)))
    if not model:
        return None
    try:
        return round(float(_predict(model, _feature_row(forecast_value, lead_h, valid_at))[0]), 2)
    except Exception:
        return None


def has_models() -> bool:
    return bool(_REGISTRY)


# Load any persisted correctors at import so capture can apply immediately.
load_registry()
