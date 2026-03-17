"""Impermanent loss calculator for AMM liquidity providers."""

import math
from typing import Any


def calculate_il(price_ratio: float) -> dict[str, Any]:
    """Calculate impermanent loss given a price change ratio.

    Args:
        price_ratio: The ratio of final price to initial price (e.g. 2.0 means
                     the token doubled in price relative to the other).

    Returns:
        Dict with il_percentage, value_retained, and interpretation.

    Formula: IL = 2 * sqrt(r) / (1 + r) - 1
    """
    if price_ratio <= 0:
        return {
            "price_ratio": price_ratio,
            "il_percentage": 0,
            "value_retained": 1.0,
            "error": "Price ratio must be positive",
        }

    try:
        sqrt_r = math.sqrt(price_ratio)
        il = 2 * sqrt_r / (1 + price_ratio) - 1

        il_pct = il * 100  # Negative value = loss

        if abs(il_pct) < 0.5:
            severity = "Negligible"
        elif abs(il_pct) < 2:
            severity = "Low"
        elif abs(il_pct) < 5:
            severity = "Moderate"
        elif abs(il_pct) < 10:
            severity = "Significant"
        else:
            severity = "Severe"

        return {
            "price_ratio": price_ratio,
            "il_percentage": round(il_pct, 4),
            "value_retained": round(1 + il, 6),
            "severity": severity,
        }

    except Exception as exc:
        return {
            "price_ratio": price_ratio,
            "il_percentage": 0,
            "value_retained": 1.0,
            "error": str(exc),
        }


def simulate_lp(
    token_a_price_start: float,
    token_b_price_start: float,
    token_a_price_end: float,
    token_b_price_end: float,
    initial_value: float,
) -> dict[str, Any]:
    """Simulate a 50/50 LP position and compare against simply holding.

    Args:
        token_a_price_start: Initial price of token A in USD.
        token_b_price_start: Initial price of token B in USD.
        token_a_price_end:   Final price of token A in USD.
        token_b_price_end:   Final price of token B in USD.
        initial_value:       Total initial value deposited (USD).

    Returns:
        Dict with lp_value, hold_value, impermanent_loss_pct, impermanent_loss_usd.
    """
    if any(p <= 0 for p in [token_a_price_start, token_b_price_start,
                            token_a_price_end, token_b_price_end]):
        return {
            "lp_value": 0,
            "hold_value": 0,
            "impermanent_loss_pct": 0,
            "impermanent_loss_usd": 0,
            "error": "All prices must be positive",
        }

    if initial_value <= 0:
        return {
            "lp_value": 0,
            "hold_value": 0,
            "impermanent_loss_pct": 0,
            "impermanent_loss_usd": 0,
            "error": "Initial value must be positive",
        }

    try:
        # Initial amounts: split 50/50
        half = initial_value / 2
        amount_a = half / token_a_price_start
        amount_b = half / token_b_price_start

        # HODL value: just hold original amounts
        hold_value = (amount_a * token_a_price_end) + (amount_b * token_b_price_end)

        # LP value uses the constant product invariant
        # price_ratio = (end_a / start_a) / (end_b / start_b)
        ratio_a = token_a_price_end / token_a_price_start
        ratio_b = token_b_price_end / token_b_price_start
        price_ratio = ratio_a / ratio_b

        # IL formula applied to the hold value
        sqrt_r = math.sqrt(price_ratio)
        il_factor = 2 * sqrt_r / (1 + price_ratio)
        lp_value = hold_value * il_factor

        il_usd = lp_value - hold_value  # Negative = loss
        il_pct = (il_usd / hold_value) * 100 if hold_value != 0 else 0

        return {
            "initial_value": round(initial_value, 2),
            "token_a": {
                "amount": round(amount_a, 6),
                "price_start": token_a_price_start,
                "price_end": token_a_price_end,
                "change_pct": round((ratio_a - 1) * 100, 2),
            },
            "token_b": {
                "amount": round(amount_b, 6),
                "price_start": token_b_price_start,
                "price_end": token_b_price_end,
                "change_pct": round((ratio_b - 1) * 100, 2),
            },
            "lp_value": round(lp_value, 2),
            "hold_value": round(hold_value, 2),
            "impermanent_loss_pct": round(il_pct, 4),
            "impermanent_loss_usd": round(il_usd, 2),
        }

    except Exception as exc:
        return {
            "lp_value": 0,
            "hold_value": 0,
            "impermanent_loss_pct": 0,
            "impermanent_loss_usd": 0,
            "error": str(exc),
        }
