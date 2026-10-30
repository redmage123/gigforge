"""BACSWN — Forecast verification engine tests."""

import pytest

from services import forecast_verification as fv
from services import forecast_correction as fc
from services.database import db_insert, db_execute


# ── Pure helpers ─────────────────────────────────────────────────────────────
class TestFlightCategory:
    def test_vfr(self):
        assert fv.flight_category(10, 10) == "VFR"

    def test_lifr_low_vis(self):
        assert fv.flight_category(0.5, 95) == "LIFR"

    def test_ifr(self):
        assert fv.flight_category(2, 80) == "IFR"

    def test_mvfr(self):
        assert fv.flight_category(4, 50) == "MVFR"

    def test_overcast_lowers_category(self):
        # Heavy cloud cover proxies a low ceiling even with good visibility.
        assert fv.flight_category(10, 95) in ("IFR", "LIFR")

    def test_none_inputs(self):
        assert fv.flight_category(None, None) is None


class TestClassifyFlightCategory:
    def test_vfr(self):
        assert fv.classify_flight_category(10, 5000) == "VFR"

    def test_lifr_ceiling(self):
        assert fv.classify_flight_category(10, 300) == "LIFR"

    def test_ifr_vis(self):
        assert fv.classify_flight_category(2, 5000) == "IFR"

    def test_mvfr_ceiling(self):
        assert fv.classify_flight_category(10, 2000) == "MVFR"

    def test_none(self):
        assert fv.classify_flight_category(None, None) is None


class TestCategoryFromMetar:
    def test_vfr_clear(self):
        # 10 km vis, only FEW/SCT (no ceiling) -> VFR
        assert fv.category_from_metar("MYNN 011200Z 09012KT 9999 FEW020 SCT040 30/24 Q1016") == "VFR"

    def test_ifr_low_ceiling(self):
        # Broken layer at 800 ft -> IFR
        assert fv.category_from_metar("MYNN 011200Z 09012KT 9999 BKN008 28/24 Q1015") == "IFR"

    def test_lifr_low_vis_and_ceiling(self):
        # 800 m vis, overcast 300 ft -> LIFR
        assert fv.category_from_metar("MYNN 011200Z 09012KT 0800 OVC003 26/25 Q1012") == "LIFR"

    def test_unparseable_returns_none(self):
        assert fv.category_from_metar("not a metar") is None

    def test_empty_returns_none(self):
        assert fv.category_from_metar("") is None


class TestMetarPressure:
    def test_inhg_to_hpa(self):
        assert round(fv.metar_pressure_hpa({"altimeter_inhg": 29.92})) == 1013

    def test_already_hpa_passthrough(self):
        assert fv.metar_pressure_hpa({"altimeter_inhg": 1015.0}) == 1015.0

    def test_missing(self):
        assert fv.metar_pressure_hpa({}) is None


class TestStats:
    def test_empty(self):
        s = fv._stats([])
        assert s["n"] == 0 and s["mae"] is None

    def test_known_values(self):
        s = fv._stats([2.0, -2.0, 2.0, -2.0])
        assert s["bias"] == 0.0
        assert s["mae"] == 2.0
        assert s["rmse"] == 2.0

    def test_bias_detects_systematic(self):
        s = fv._stats([1.0, 1.0, 1.0])
        assert s["bias"] == 1.0


class TestAccuracyPct:
    def test_perfect(self):
        assert fv._accuracy_pct(0.0, 1.5) == 100.0

    def test_floor_at_zero(self):
        assert fv._accuracy_pct(100.0, 1.5) == 0.0

    def test_none(self):
        assert fv._accuracy_pct(None, 1.5) is None


# ── Scoreboard aggregation over a seeded DB ──────────────────────────────────
async def _insert(var, lead, signed=None, source="live", **extra):
    row = {
        "station_id": "MYNN", "variable": var, "lead_h": lead,
        "issued_at": fv._iso(fv._now()), "valid_at": fv._iso(fv._now()),
        "source": source, "status": "verified",
    }
    if signed is not None:
        row.update({"forecast_value": 20 + signed, "observed_value": 20,
                    "signed_error": signed, "abs_error": abs(signed)})
    row.update(extra)
    await db_insert("forecast_verifications", row)


@pytest.mark.asyncio
class TestScoreboard:
    async def test_empty_mode(self):
        sb = await fv.scoreboard()
        assert sb["data_mode"] == "empty"
        assert sb["sample_size"] == 0

    async def test_aggregates_continuous(self):
        await _insert("temp_c", 6, 1.0)
        await _insert("temp_c", 6, -1.0)
        sb = await fv.scoreboard()
        assert sb["variables"]["temp_c"]["n"] == 2
        assert sb["variables"]["temp_c"]["mae"] == 1.0
        assert sb["data_mode"] == "live"

    async def test_category_hit_rate(self):
        await _insert("flight_category", 6, source="live",
                      forecast_cat="VFR", observed_cat="VFR", cat_hit=1)
        await _insert("flight_category", 6, source="live",
                      forecast_cat="VFR", observed_cat="IFR", cat_hit=0)
        sb = await fv.scoreboard()
        assert sb["category_n"] == 2
        assert sb["category_hit_rate"] == 50.0

    async def test_seed_mode_flagged(self):
        await _insert("temp_c", 6, 1.0, source="seed")
        sb = await fv.scoreboard()
        assert sb["data_mode"] == "seed"

    async def test_mixed_mode_flagged(self):
        await _insert("temp_c", 6, 1.0, source="live")
        await _insert("temp_c", 6, 1.0, source="seed")
        sb = await fv.scoreboard()
        assert sb["data_mode"] == "mixed"

    async def test_by_lead_present(self):
        for lead in fv.LEAD_TIMES:
            await _insert("temp_c", lead, 1.0)
        sb = await fv.scoreboard()
        leads = {r["lead_h"] for r in sb["by_lead"]}
        assert leads == set(fv.LEAD_TIMES)

    async def test_by_lead_dynamic_includes_day_leads(self):
        # Previous-runs backfill writes 24/48/72h leads — they must surface.
        for lead in (6, 24, 48, 72):
            await _insert("temp_c", lead, 1.0)
        sb = await fv.scoreboard()
        leads = {r["lead_h"] for r in sb["by_lead"]}
        assert {6, 24, 48, 72} <= leads


class TestWarningMetrics:
    def test_perfect(self):
        m = fv._warn_metrics(10, 0, 0, 90)
        assert m["pod"] == 100.0 and m["far"] == 0.0 and m["csi"] == 100.0

    def test_all_false_alarms(self):
        m = fv._warn_metrics(0, 5, 0, 95)
        assert m["far"] == 100.0 and m["pod"] is None  # no events -> POD undefined

    def test_misses_lower_pod(self):
        m = fv._warn_metrics(5, 0, 5, 90)
        assert m["pod"] == 50.0

    def test_hss_chance(self):
        # No skill beyond base rate -> HSS near 0
        m = fv._warn_metrics(1, 1, 1, 1)
        assert m["hss"] == 0.0


@pytest.mark.asyncio
class TestWarningScoreboard:
    async def test_counts_contingency(self):
        async def ins(fcat, ocat):
            await db_insert("forecast_verifications", {
                "station_id": "MYNN", "variable": "flight_category", "lead_h": 6,
                "issued_at": fv._iso(fv._now()), "valid_at": fv._iso(fv._now()),
                "forecast_cat": fcat, "observed_cat": ocat,
                "cat_hit": 1 if fcat == ocat else 0,
                "source": "live", "status": "verified",
            })
        await ins("IFR", "IFR")    # hit
        await ins("LIFR", "VFR")   # false alarm
        await ins("VFR", "IFR")    # miss
        await ins("VFR", "VFR")    # correct negative
        sb = await fv.warning_scoreboard()
        o = sb["overall"]
        assert o["hits"] == 1 and o["false_alarms"] == 1 and o["misses"] == 1 and o["correct_negatives"] == 1
        assert o["pod"] == 50.0 and o["far"] == 50.0


@pytest.mark.asyncio
class TestSeedAndLeaderboard:
    async def test_seed_populates(self):
        n = await fv._seed()
        assert n > 0
        assert await fv.count_rows() == n

    async def test_leaderboard_after_seed(self):
        await fv._seed()
        board = await fv.station_leaderboard()
        assert len(board) > 0
        assert all("accuracy_pct" in s for s in board)

    async def test_station_detail_shape(self):
        await fv._seed()
        d = await fv.station_detail("MYNN")
        assert d["station_id"] == "MYNN"
        assert "variables" in d and "temp_c" in d["variables"]
        assert "by_lead" in d and len(d["by_lead"]) > 0
        assert "category_breakdown" in d
        assert d["sample_size"] > 0
        # Latest observed value is surfaced per variable to ground the error metric.
        assert "latest_obs" in d["variables"]["temp_c"]
        assert d["variables"]["temp_c"]["latest_obs"] is not None

    async def test_station_detail_empty_station(self):
        await fv._seed()
        d = await fv.station_detail("ZZZZ")  # no data
        assert d["sample_size"] == 0
        assert d["overall_accuracy_pct"] is None

    async def test_ensure_seeded_idempotent(self, monkeypatch):
        async def fake_backfill(days=7):
            await fv._seed()
            return {"mode": "seed"}
        monkeypatch.setattr(fv, "backfill", fake_backfill)
        await fv.ensure_seeded()
        first = await fv.count_rows()
        await fv.ensure_seeded()  # no-op when already populated
        assert await fv.count_rows() == first


def _rows(n, bias, base=25.0, lead=24):
    from datetime import timedelta
    out = []
    for i in range(n):
        valid = fv._now() - timedelta(hours=i)
        obs = base + (i % 5) * 0.5
        out.append({
            "forecast_value": obs + bias, "observed_value": obs,
            "lead_h": [6, 24, 48][i % 3] if lead is None else lead,
            "valid_at": fv._iso(valid),
        })
    out.reverse()  # ascending valid_at
    return out


class TestBiasCorrection:
    def test_train_eval_removes_constant_bias(self):
        import numpy as np
        res = fc.train_eval_group(_rows(90, bias=3.0))
        assert res is not None
        assert float(np.mean(np.abs(res["corr_err"]))) < float(np.mean(np.abs(res["raw_err"])))

    def test_train_eval_too_few_rows(self):
        assert fc.train_eval_group(_rows(20, bias=3.0)) is None

    def test_train_eval_no_bias_no_harm(self):
        import numpy as np
        res = fc.train_eval_group(_rows(90, bias=0.0))
        assert float(np.mean(np.abs(res["corr_err"]))) <= float(np.mean(np.abs(res["raw_err"]))) + 0.5

    def test_predict_meanbias(self):
        import numpy as np
        X = np.array([[23.0, 24, 0.0, 1.0]])
        assert abs(fc._predict(("meanbias", 3.0), X)[0] - 20.0) < 1e-9

    def test_predict_identity(self):
        import numpy as np
        X = np.array([[23.0, 24, 0.0, 1.0]])
        assert fc._predict(("identity", None), X)[0] == 23.0

    def test_select_prefers_simpler_within_margin(self):
        import numpy as np
        # Two candidates with near-identical val MAE -> choose the simpler one.
        Xva = np.array([[20.0, 24, 0, 1], [22.0, 24, 0, 1]])
        yva = np.array([20.0, 22.0])
        cands = {
            "identity": ("identity", None),          # perfect here
            "gbm": ("meanbias", 0.001),              # essentially identical
        }
        assert fc._select(cands, Xva, yva) == "identity"

    def test_select_steps_up_when_clearly_better(self):
        import numpy as np
        Xva = np.array([[23.0, 24, 0, 1]] * 5)
        yva = np.array([20.0] * 5)
        cands = {
            "identity": ("identity", None),          # MAE 3.0
            "mean-bias": ("meanbias", 3.0),          # MAE 0.0 — far better
        }
        assert fc._select(cands, Xva, yva) == "mean-bias"


@pytest.mark.asyncio
class TestCorrectionScoreboard:
    async def test_empty(self):
        sb = await fc.compute_scoreboard()
        assert sb["variables"] == {}
        assert sb["sample_size"] == 0

    async def test_improves_biased_forecasts(self):
        from datetime import timedelta
        # One (station, lead) cell with a clear, stable +2.5 bias.
        for i in range(70):
            valid = fv._now() - timedelta(hours=i)
            obs = 25.0 + (i % 5) * 0.5
            await db_insert("forecast_verifications", {
                "station_id": "MYNN", "variable": "temp_c", "lead_h": 24,
                "issued_at": fv._iso(valid - timedelta(hours=24)), "valid_at": fv._iso(valid),
                "forecast_value": obs + 2.5, "observed_value": obs,
                "signed_error": 2.5, "abs_error": 2.5,
                "source": "backfill", "status": "verified",
            })
        sb = await fc.compute_scoreboard()
        assert "temp_c" in sb["variables"]
        v = sb["variables"]["temp_c"]
        assert v["corr_mae"] < v["raw_mae"]
        assert v["improvement_pct"] > 0


@pytest.mark.asyncio
class TestCorrectorRegistry:
    async def test_train_and_apply(self, monkeypatch, tmp_path):
        from datetime import timedelta
        monkeypatch.setattr(fc, "_MODELS_PATH", str(tmp_path / "c.pkl"))
        for i in range(70):
            valid = fv._now() - timedelta(hours=i)
            obs = 25.0 + (i % 5) * 0.5
            await db_insert("forecast_verifications", {
                "station_id": "MYNN", "variable": "temp_c", "lead_h": 24,
                "issued_at": fv._iso(valid - timedelta(hours=24)), "valid_at": fv._iso(valid),
                "forecast_value": obs + 2.5, "observed_value": obs,
                "signed_error": 2.5, "abs_error": 2.5,
                "source": "backfill", "status": "verified",
            })
        res = await fc.train_correctors()
        assert res["correctors"] >= 1
        assert fc.has_models()
        # A +2.5-biased 27.5 forecast should be corrected toward ~25.
        corrected = fc.apply_to_forecast("MYNN", "temp_c", 24, fv._iso(fv._now()), 27.5)
        assert corrected is not None and abs(corrected - 25.0) < 1.5

    def test_apply_unknown_station_returns_none(self):
        assert fc.apply_to_forecast("ZZZZ", "temp_c", 24, fv._iso(fv._now()), 27.5) is None


class TestBriefingCompose:
    def test_compose_clear(self):
        from services import briefing as br
        facts = {"generated_at": "2026-05-29 12:00Z", "reporting": 3,
                 "cats": {"VFR": ["MYNN", "MYGF", "MYEG"], "MVFR": [], "IFR": [], "LIFR": []},
                 "impacted": [], "skill": {}, "climo": None, "storms": []}
        b = br._compose(facts)
        assert "VFR" in b["headline"]
        assert any(s["title"] == "Current Conditions" for s in b["sections"])
        assert b["recommendations"]

    def test_compose_ifr_headline_and_recs(self):
        from services import briefing as br
        facts = {"generated_at": "2026-05-29 12:00Z", "reporting": 2,
                 "cats": {"VFR": [], "MVFR": [], "IFR": ["MYNN"], "LIFR": []},
                 "impacted": ["MYNN"], "skill": {}, "climo": None, "storms": []}
        b = br._compose(facts)
        assert "MYNN" in b["headline"]
        assert any("MYNN" in r for r in b["recommendations"])
