"""User investment profile and goal management.

Stores per-user investment goals, risk tolerance, strategy preferences,
and time horizons. Used by the recommendation engine to personalize
buy/hold/sell signals to match what the user is actually trying to achieve.
"""

from typing import Any
from services.user_data import load_user_data, save_user_data

NAMESPACE = "investment_profiles"

# Risk tolerance levels and their numeric multipliers
RISK_LEVELS = {
    "conservative": {
        "label": "Conservative",
        "description": "Preserve capital. Prefer stable, large-cap assets. Avoid high-volatility coins.",
        "volatility_tolerance": 0.3,   # penalizes volatile coins heavily
        "dip_buy_appetite": 0.2,       # low appetite for buying dips
        "contrarian_weight": 0.1,      # mostly follows consensus
        "large_cap_bias": 0.8,         # strong preference for top-10 coins
        "max_drawdown_pct": 10,        # uncomfortable losing more than 10%
    },
    "moderate": {
        "label": "Moderate",
        "description": "Balanced growth. Mix of stable and growth assets. Some risk acceptable.",
        "volatility_tolerance": 0.6,
        "dip_buy_appetite": 0.5,
        "contrarian_weight": 0.3,
        "large_cap_bias": 0.5,
        "max_drawdown_pct": 25,
    },
    "aggressive": {
        "label": "Aggressive",
        "description": "Maximize returns. Willing to hold through drawdowns. Comfortable with volatility.",
        "volatility_tolerance": 0.9,
        "dip_buy_appetite": 0.8,
        "contrarian_weight": 0.6,
        "large_cap_bias": 0.2,
        "max_drawdown_pct": 50,
    },
    "degen": {
        "label": "High Risk / Degen",
        "description": "Maximum upside. Actively seeks volatile, speculative opportunities. Embraces fear.",
        "volatility_tolerance": 1.0,
        "dip_buy_appetite": 1.0,
        "contrarian_weight": 0.9,
        "large_cap_bias": 0.0,
        "max_drawdown_pct": 80,
    },
}

# Strategy presets that adjust signal weights
STRATEGIES = {
    "hodl": {
        "label": "Long-Term HODL",
        "description": "Buy and hold for years. Ignore short-term noise. Focus on fundamentals and adoption.",
        "weight_overrides": {
            "sentiment": 0.15,      # less reactive to daily news
            "price_trend": 0.15,    # short-term price doesn't matter much
            "volatility": 0.10,     # vol is just noise for long-term
            "fear_greed": 0.30,     # contrarian: buy fear, ignore greed
            "volume": 0.10,
            "goal_alignment": 0.20, # how well does this coin fit the portfolio goal
        },
        "sell_reluctance": 0.7,     # requires much stronger sell signal
        "buy_on_dip_bonus": 0.3,    # extra buy signal when prices drop
    },
    "swing": {
        "label": "Swing Trading",
        "description": "Capture multi-day to multi-week moves. Follow momentum and sentiment shifts.",
        "weight_overrides": {
            "sentiment": 0.30,
            "price_trend": 0.25,
            "volatility": 0.10,
            "fear_greed": 0.10,
            "volume": 0.15,
            "goal_alignment": 0.10,
        },
        "sell_reluctance": 0.0,
        "buy_on_dip_bonus": 0.0,
    },
    "dca": {
        "label": "Dollar-Cost Averaging",
        "description": "Regular buys regardless of price. Recommendations focus on allocation sizing.",
        "weight_overrides": {
            "sentiment": 0.20,
            "price_trend": 0.10,    # DCA doesn't care about short-term direction
            "volatility": 0.10,
            "fear_greed": 0.25,     # buy more during fear, less during greed
            "volume": 0.05,
            "goal_alignment": 0.30, # strongly prioritize goal fit
        },
        "sell_reluctance": 0.9,     # almost never recommends selling
        "buy_on_dip_bonus": 0.2,
    },
    "active": {
        "label": "Active Trading",
        "description": "Frequent trades based on short-term signals. Maximize every opportunity.",
        "weight_overrides": {
            "sentiment": 0.35,
            "price_trend": 0.25,
            "volatility": 0.05,     # volatility is opportunity, not risk
            "fear_greed": 0.05,
            "volume": 0.20,
            "goal_alignment": 0.10,
        },
        "sell_reluctance": 0.0,
        "buy_on_dip_bonus": 0.0,
    },
    "income": {
        "label": "Yield / Income",
        "description": "Generate passive income through staking, DeFi yields, and dividends.",
        "weight_overrides": {
            "sentiment": 0.15,
            "price_trend": 0.10,
            "volatility": 0.20,     # prefer stability for yield farming
            "fear_greed": 0.10,
            "volume": 0.10,
            "goal_alignment": 0.35, # heavily weight coins with staking/yield
        },
        "sell_reluctance": 0.5,
        "buy_on_dip_bonus": 0.15,
    },
}

# Time horizons affect how signals are interpreted
TIME_HORIZONS = {
    "short": {
        "label": "Short-Term (< 3 months)",
        "trend_lookback_days": 7,
        "noise_filter": 0.0,       # react to everything
    },
    "medium": {
        "label": "Medium-Term (3-12 months)",
        "trend_lookback_days": 30,
        "noise_filter": 0.3,       # filter out minor noise
    },
    "long": {
        "label": "Long-Term (1-3 years)",
        "trend_lookback_days": 90,
        "noise_filter": 0.6,       # only react to significant moves
    },
    "very_long": {
        "label": "Very Long-Term (3+ years)",
        "trend_lookback_days": 365,
        "noise_filter": 0.8,       # almost no reaction to short-term
    },
}

# Default profile for new users
DEFAULT_PROFILE: dict[str, Any] = {
    "risk_tolerance": "moderate",
    "strategy": "hodl",
    "time_horizon": "medium",
    "target_return_pct": 50,          # target annual return %
    "portfolio_goal": "growth",       # growth | income | preservation | speculation
    "monthly_investment": 0,          # how much they plan to invest per month (0 = not set)
    "preferred_coins": [],            # coins they're specifically interested in
    "avoid_coins": [],                # coins they want excluded from recommendations
    "notes": "",                      # free-text investment thesis / notes
    "completed": False,               # whether the user has filled out their profile
}

PORTFOLIO_GOALS = {
    "growth": {
        "label": "Capital Growth",
        "description": "Grow your portfolio value over time. Accept some risk for higher returns.",
    },
    "income": {
        "label": "Passive Income",
        "description": "Generate regular income through staking, yields, and dividends.",
    },
    "preservation": {
        "label": "Capital Preservation",
        "description": "Protect what you have. Minimize downside risk. Focus on stablecoins and blue chips.",
    },
    "speculation": {
        "label": "Speculative Gains",
        "description": "Maximize upside potential. Actively chase high-risk/high-reward opportunities.",
    },
}


def get_profile(username: str) -> dict[str, Any]:
    """Load user's investment profile, returning defaults if not set."""
    data = load_user_data(username, NAMESPACE)
    if not data or not isinstance(data, dict):
        return {**DEFAULT_PROFILE}
    # Merge with defaults so new fields are always present
    profile = {**DEFAULT_PROFILE, **data}
    return profile


def save_profile(username: str, profile: dict[str, Any]) -> dict[str, Any]:
    """Save user's investment profile after validation."""
    # Validate risk tolerance
    if profile.get("risk_tolerance") not in RISK_LEVELS:
        profile["risk_tolerance"] = "moderate"
    # Validate strategy
    if profile.get("strategy") not in STRATEGIES:
        profile["strategy"] = "hodl"
    # Validate time horizon
    if profile.get("time_horizon") not in TIME_HORIZONS:
        profile["time_horizon"] = "medium"
    # Validate portfolio goal
    if profile.get("portfolio_goal") not in PORTFOLIO_GOALS:
        profile["portfolio_goal"] = "growth"
    # Clamp target return
    profile["target_return_pct"] = max(0, min(1000, profile.get("target_return_pct", 50)))

    profile["completed"] = True
    save_user_data(username, NAMESPACE, profile)
    return profile


def get_strategy_weights(profile: dict[str, Any]) -> dict[str, float]:
    """Get signal weights adjusted for the user's strategy."""
    strategy_key = profile.get("strategy", "hodl")
    strategy = STRATEGIES.get(strategy_key, STRATEGIES["hodl"])
    return strategy.get("weight_overrides", {})


def get_risk_params(profile: dict[str, Any]) -> dict[str, Any]:
    """Get risk parameters for the user's tolerance level."""
    risk_key = profile.get("risk_tolerance", "moderate")
    return RISK_LEVELS.get(risk_key, RISK_LEVELS["moderate"])
