"""Personalized trading recommendation engine.

Combines multiple signals (sentiment, price trend, volatility, fear/greed,
volume) with the user's investment profile (goals, risk tolerance, strategy,
time horizon) to generate recommendations that align with what the user is
actually trying to achieve — not just what the market is doing.
"""

import logging
import time
from typing import Any

from config import DEFAULT_COINS
from services.sentiment_analyzer import get_coin_sentiment
from services.investment_profile import (
    get_profile,
    get_strategy_weights,
    get_risk_params,
    STRATEGIES,
    RISK_LEVELS,
    TIME_HORIZONS,
    PORTFOLIO_GOALS,
    DEFAULT_PROFILE,
)

logger = logging.getLogger(__name__)

# Default weights (used when no user profile)
DEFAULT_WEIGHTS = {
    "sentiment": 0.30,
    "price_trend": 0.25,
    "volatility": 0.15,
    "fear_greed": 0.15,
    "volume": 0.15,
}

# Large-cap coins (top ~15 by market cap) for risk filtering
LARGE_CAP_COINS = {
    "bitcoin", "ethereum", "binancecoin", "ripple", "solana",
    "cardano", "dogecoin", "avalanche-2", "polkadot", "chainlink",
    "litecoin", "uniswap", "matic-network", "tron", "near",
}


def _price_trend_signal(coin_data: dict) -> float:
    """Score price trend from -1 (strong down) to +1 (strong up)."""
    change_24h = coin_data.get("price_change_percentage_24h", 0) or 0
    clamped = max(-20, min(20, change_24h))
    return clamped / 20


def _volatility_signal(coin_data: dict, risk_params: dict) -> float:
    """Score volatility, adjusted for the user's risk tolerance.

    Conservative users get penalized more for volatile coins.
    Aggressive users see volatility as opportunity.
    """
    change_24h = abs(coin_data.get("price_change_percentage_24h", 0) or 0)
    vol_tolerance = risk_params.get("volatility_tolerance", 0.6)

    # Base signal: high volatility = negative
    if change_24h > 15:
        base = -1.0
    elif change_24h > 10:
        base = -0.5
    elif change_24h > 5:
        base = 0.0
    else:
        base = 0.3

    # Adjust based on risk tolerance:
    # High tolerance (aggressive) sees vol as less negative / more positive
    # Low tolerance (conservative) sees vol as more negative
    adjusted = base + (vol_tolerance - 0.5) * 0.4
    return max(-1.0, min(1.0, adjusted))


def _volume_signal(coin_data: dict) -> float:
    """Score volume relative to market cap."""
    volume = coin_data.get("total_volume", 0) or 0
    market_cap = coin_data.get("market_cap", 0) or 1
    ratio = volume / market_cap if market_cap > 0 else 0

    if ratio > 0.15:
        return 0.8
    if ratio > 0.08:
        return 0.4
    if ratio > 0.03:
        return 0.0
    return -0.3


def _fear_greed_signal(fg_value: int | None, risk_params: dict) -> float:
    """Map Fear & Greed to a signal, adjusted for user's contrarian appetite.

    Conservative: follow the crowd (fear = sell, greed = hold)
    Aggressive: contrarian (fear = buy opportunity, greed = take profit)
    """
    if fg_value is None:
        return 0.0

    contrarian_weight = risk_params.get("contrarian_weight", 0.3)

    # Consensus signal: fear is bad, greed is good
    if fg_value <= 25:
        consensus = -0.8
    elif fg_value <= 40:
        consensus = -0.3
    elif fg_value <= 60:
        consensus = 0.0
    elif fg_value <= 75:
        consensus = 0.3
    else:
        consensus = 0.6

    # Contrarian signal: opposite
    contrarian = -consensus

    # Blend based on user's contrarian appetite
    return consensus * (1 - contrarian_weight) + contrarian * contrarian_weight


def _goal_alignment_signal(
    coin_id: str,
    coin_data: dict,
    profile: dict,
    risk_params: dict,
) -> float:
    """Score how well a coin aligns with the user's investment goals.

    Considers: portfolio goal, preferred/avoided coins, risk tolerance,
    large-cap bias, and target return expectations.
    """
    score = 0.0
    goal = profile.get("portfolio_goal", "growth")
    preferred = profile.get("preferred_coins", [])
    avoided = profile.get("avoid_coins", [])

    # User explicitly wants/avoids this coin
    if coin_id in avoided:
        return -1.0
    if coin_id in preferred:
        score += 0.5

    # Large-cap bias from risk tolerance
    large_cap_bias = risk_params.get("large_cap_bias", 0.5)
    is_large_cap = coin_id in LARGE_CAP_COINS
    if is_large_cap:
        score += large_cap_bias * 0.3
    else:
        score -= large_cap_bias * 0.3

    # Goal-specific scoring
    market_cap = coin_data.get("market_cap", 0) or 0
    change_24h = coin_data.get("price_change_percentage_24h", 0) or 0

    if goal == "preservation":
        # Favor stable, high-cap coins; penalize volatility
        if abs(change_24h) < 3:
            score += 0.3
        elif abs(change_24h) > 10:
            score -= 0.4
        if market_cap > 50e9:
            score += 0.2

    elif goal == "growth":
        # Balanced: some growth potential, not too risky
        if change_24h > 0:
            score += 0.1
        if market_cap > 5e9:
            score += 0.1

    elif goal == "income":
        # Favor coins known for staking/yield
        staking_coins = {"ethereum", "solana", "cardano", "polkadot", "avalanche-2", "near", "cosmos"}
        if coin_id in staking_coins:
            score += 0.4
        if abs(change_24h) < 5:
            score += 0.2  # stability for yield farming

    elif goal == "speculation":
        # Favor momentum and volatility
        if abs(change_24h) > 5:
            score += 0.3
        if change_24h > 10:
            score += 0.2

    return max(-1.0, min(1.0, score))


def _apply_strategy_modifiers(
    composite: float,
    price_signal: float,
    profile: dict,
) -> float:
    """Apply strategy-specific post-processing to the composite score.

    - HODL/DCA: makes it harder to trigger sell signals
    - Dip buying: boosts buy signal when prices are dropping
    """
    strategy_key = profile.get("strategy", "hodl")
    strategy = STRATEGIES.get(strategy_key, STRATEGIES["hodl"])

    sell_reluctance = strategy.get("sell_reluctance", 0.0)
    dip_bonus = strategy.get("buy_on_dip_bonus", 0.0)

    # If composite is negative (sell territory) and strategy has sell reluctance,
    # pull it toward zero (hold). This means HODL strategies need a much stronger
    # sell signal to actually recommend selling.
    if composite < 0 and sell_reluctance > 0:
        composite = composite * (1 - sell_reluctance)

    # Dip buying: if price is dropping but other signals are neutral/positive,
    # boost the buy signal for strategies that like buying dips
    if price_signal < -0.2 and composite > -0.3 and dip_bonus > 0:
        composite += dip_bonus * abs(price_signal)

    return max(-1.0, min(1.0, composite))


def _noise_filter(composite: float, profile: dict) -> float:
    """Filter out weak signals based on time horizon.

    Long-term investors shouldn't see a flurry of minor hold/buy/sell
    changes day to day. Only report when there's a strong signal.
    """
    horizon_key = profile.get("time_horizon", "medium")
    horizon = TIME_HORIZONS.get(horizon_key, TIME_HORIZONS["medium"])
    noise_filter = horizon.get("noise_filter", 0.3)

    # If the absolute signal is below the noise threshold, flatten to zero (hold)
    if abs(composite) < noise_filter * 0.3:
        return 0.0
    return composite


def _generate_rationale(
    action: str,
    profile: dict,
    signals: dict,
    coin_id: str,
    composite: float,
) -> str:
    """Generate a human-readable explanation of why this recommendation
    was made, personalized to the user's goals."""

    goal_label = PORTFOLIO_GOALS.get(profile.get("portfolio_goal", "growth"), {}).get("label", "Growth")
    strategy_label = STRATEGIES.get(profile.get("strategy", "hodl"), {}).get("label", "HODL")
    risk_label = RISK_LEVELS.get(profile.get("risk_tolerance", "moderate"), {}).get("label", "Moderate")
    horizon_label = TIME_HORIZONS.get(profile.get("time_horizon", "medium"), {}).get("label", "Medium-Term")

    # Name the coin nicely
    name = coin_id.replace("-", " ").title()

    # Strongest signal
    signal_items = [(k, v.get("score", 0)) for k, v in signals.items()]
    signal_items.sort(key=lambda x: abs(x[1]), reverse=True)
    strongest_name = signal_items[0][0].replace("_", " ") if signal_items else "market"
    strongest_dir = "positive" if signal_items[0][1] > 0 else "negative" if signal_items[0][1] < 0 else "neutral"

    parts = []

    if action in ("Strong Buy", "Buy"):
        risk_article = "an" if risk_label.lower()[0] in "aeiou" else "a"
        parts.append(f"Based on your {goal_label.lower()} goal with {risk_article} {risk_label.lower()} risk profile,")
        parts.append(f"{name} looks favorable right now.")
        if "sentiment" in signals and signals["sentiment"].get("score", 0) > 0.1:
            parts.append(f"News sentiment is turning positive ({signals['sentiment'].get('label', '')}).")
        if profile.get("strategy") == "dca":
            parts.append("As part of your DCA strategy, this is a good time to maintain or increase your regular buy.")
        elif profile.get("strategy") == "hodl":
            parts.append(f"This aligns with your long-term hold approach.")
        else:
            parts.append(f"The strongest signal is {strongest_name} ({strongest_dir}).")

    elif action in ("Strong Sell", "Sell"):
        risk_article = "an" if risk_label.lower()[0] in "aeiou" else "a"
        parts.append(f"Given your {risk_label.lower()} risk tolerance and {risk_article} {horizon_label.lower()} horizon,")
        if profile.get("strategy") in ("hodl", "dca"):
            parts.append(f"consider reducing exposure to {name}, though your {strategy_label} strategy suggests patience.")
        else:
            parts.append(f"consider taking profits or reducing your {name} position.")
        if "sentiment" in signals and signals["sentiment"].get("score", 0) < -0.1:
            parts.append(f"Negative news sentiment ({signals['sentiment'].get('label', '')}) is a concern.")
        parts.append(f"The strongest signal is {strongest_name} ({strongest_dir}).")

    else:  # Hold
        parts.append(f"For your {goal_label.lower()} goal,")
        parts.append(f"{name} doesn't have a strong signal in either direction right now.")
        if profile.get("strategy") in ("hodl", "dca"):
            parts.append("Continue your current strategy.")
        else:
            parts.append("Wait for a clearer setup before acting.")

    return " ".join(parts)


def generate_recommendation(
    coin_id: str,
    coin_data: dict,
    fear_greed_value: int | None = None,
    profile: dict | None = None,
) -> dict[str, Any]:
    """Generate a personalized buy/hold/sell recommendation for a single coin.

    When a profile is provided, recommendations are tailored to the user's
    risk tolerance, strategy, time horizon, and portfolio goals.
    """
    profile = profile or DEFAULT_PROFILE
    risk_params = get_risk_params(profile)
    weights = get_strategy_weights(profile)

    # If profile isn't completed, fall back to default weights
    if not profile.get("completed"):
        weights = DEFAULT_WEIGHTS

    # Compute all signals
    sentiment = get_coin_sentiment(coin_id)
    sentiment_signal = sentiment.get("overall_score", 0) / 100

    price_signal = _price_trend_signal(coin_data)
    vol_signal = _volatility_signal(coin_data, risk_params)
    volume_signal = _volume_signal(coin_data)
    fg_signal = _fear_greed_signal(fear_greed_value, risk_params)
    goal_signal = _goal_alignment_signal(coin_id, coin_data, profile, risk_params)

    # Weighted composite score
    composite = (
        weights.get("sentiment", 0.30) * sentiment_signal
        + weights.get("price_trend", 0.25) * price_signal
        + weights.get("volatility", 0.15) * vol_signal
        + weights.get("fear_greed", 0.15) * fg_signal
        + weights.get("volume", 0.15) * volume_signal
        + weights.get("goal_alignment", 0) * goal_signal
    )

    # Apply strategy modifiers (sell reluctance, dip buying)
    composite = _apply_strategy_modifiers(composite, price_signal, profile)

    # Apply noise filter based on time horizon
    composite = _noise_filter(composite, profile)

    # Map to recommendation
    if composite >= 0.3:
        action = "Strong Buy"
        action_class = "strong-buy"
    elif composite >= 0.1:
        action = "Buy"
        action_class = "buy"
    elif composite > -0.1:
        action = "Hold"
        action_class = "hold"
    elif composite > -0.3:
        action = "Sell"
        action_class = "sell"
    else:
        action = "Strong Sell"
        action_class = "strong-sell"

    # Confidence = signal agreement + data quality
    all_signals = [sentiment_signal, price_signal, vol_signal, fg_signal, volume_signal, goal_signal]
    positive_count = sum(1 for s in all_signals if s > 0.1)
    negative_count = sum(1 for s in all_signals if s < -0.1)
    agreement = max(positive_count, negative_count) / len(all_signals)
    confidence = int(agreement * 100)

    if sentiment.get("article_count", 0) < 3:
        confidence = max(confidence - 20, 10)

    signals_dict = {
        "sentiment": {
            "score": round(sentiment_signal, 3),
            "weight": weights.get("sentiment", 0.30),
            "label": sentiment.get("label", "Unknown"),
            "article_count": sentiment.get("article_count", 0),
            "trend": sentiment.get("trend", "stable"),
        },
        "price_trend": {
            "score": round(price_signal, 3),
            "weight": weights.get("price_trend", 0.25),
            "change_24h": coin_data.get("price_change_percentage_24h", 0),
        },
        "volatility": {
            "score": round(vol_signal, 3),
            "weight": weights.get("volatility", 0.15),
        },
        "fear_greed": {
            "score": round(fg_signal, 3),
            "weight": weights.get("fear_greed", 0.15),
            "value": fear_greed_value,
        },
        "volume": {
            "score": round(volume_signal, 3),
            "weight": weights.get("volume", 0.15),
        },
        "goal_alignment": {
            "score": round(goal_signal, 3),
            "weight": weights.get("goal_alignment", 0),
        },
    }

    # Generate personalized rationale
    rationale = _generate_rationale(action, profile, signals_dict, coin_id, composite)

    return {
        "coin_id": coin_id,
        "action": action,
        "action_class": action_class,
        "composite_score": round(composite, 3),
        "confidence": confidence,
        "rationale": rationale,
        "timestamp": time.time(),
        "signals": signals_dict,
        "sentiment_detail": {
            "overall_score": sentiment.get("overall_score", 0),
            "trend": sentiment.get("trend", "stable"),
            "trend_delta": sentiment.get("trend_delta", 0),
            "source_breakdown": sentiment.get("source_breakdown", {}),
        },
        "strategy_applied": profile.get("strategy", "hodl"),
        "risk_level": profile.get("risk_tolerance", "moderate"),
    }


async def generate_all_recommendations(
    prices: list[dict] | None = None,
    fear_greed_value: int | None = None,
    coin_ids: list[str] | None = None,
    profile: dict | None = None,
) -> list[dict[str, Any]]:
    """Generate personalized recommendations for all tracked coins."""
    profile = profile or DEFAULT_PROFILE
    target_coins = coin_ids or DEFAULT_COINS

    # Filter out coins the user wants to avoid
    avoided = set(profile.get("avoid_coins", []))
    target_coins = [c for c in target_coins if c not in avoided]

    price_map = {}
    if prices:
        for p in prices:
            price_map[p.get("id", "")] = p

    recommendations = []
    for coin_id in target_coins:
        try:
            coin_data = price_map.get(coin_id, {})
            rec = generate_recommendation(coin_id, coin_data, fear_greed_value, profile)
            rec["current_price"] = coin_data.get("current_price")
            rec["market_cap"] = coin_data.get("market_cap")
            rec["name"] = coin_data.get("name", coin_id.replace("-", " ").title())
            rec["symbol"] = (coin_data.get("symbol", "") or "").upper()
            rec["image"] = coin_data.get("image", "")
            recommendations.append(rec)
        except Exception as exc:
            logger.warning("Recommendation error for %s: %s", coin_id, exc)

    # Sort by absolute composite score (strongest signals first)
    recommendations.sort(key=lambda r: abs(r.get("composite_score", 0)), reverse=True)
    return recommendations
