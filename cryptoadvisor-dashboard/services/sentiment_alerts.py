"""Sentiment-based alert system.

Detects significant sentiment shifts and generates alerts for users.
Runs as a background task, checking every 5 minutes.
"""

import logging
import time
from typing import Any

from config import DEFAULT_COINS
from services.sentiment_analyzer import get_coin_sentiment
from services.user_data import load_user_data, save_user_data

logger = logging.getLogger(__name__)

# Track previous sentiment scores to detect shifts
_prev_scores: dict[str, int] = {}

# Threshold for alerting on sentiment shift (points on -100 to 100 scale)
SHIFT_THRESHOLD = 25


def _get_all_usernames() -> list[str]:
    """Get all usernames with favorites configured."""
    from pathlib import Path
    from config import BASE_DIR
    fav_dir = BASE_DIR / "data" / "favorites"
    if not fav_dir.exists():
        return []
    return [f.stem for f in fav_dir.glob("*.json")]


async def check_sentiment_alerts():
    """Background task: check for sentiment shifts and create alerts.

    Called every 5 minutes by the scheduler.
    """
    global _prev_scores

    logger.info("Checking sentiment alerts...")

    # Check all default coins + any user favorites
    all_coins = set(DEFAULT_COINS)
    for username in _get_all_usernames():
        try:
            favs = load_user_data(username, "favorites")
            if isinstance(favs, list):
                for fav in favs:
                    coin_id = fav.get("coin_id") if isinstance(fav, dict) else fav
                    if coin_id:
                        all_coins.add(coin_id)
        except Exception:
            pass

    alerts_generated = 0

    for coin_id in all_coins:
        try:
            sentiment = get_coin_sentiment(coin_id)
            current_score = sentiment.get("overall_score", 0)
            prev_score = _prev_scores.get(coin_id)

            if prev_score is not None:
                shift = current_score - prev_score

                if abs(shift) >= SHIFT_THRESHOLD:
                    direction = "bullish" if shift > 0 else "bearish"
                    alert = {
                        "type": "sentiment_shift",
                        "coin_id": coin_id,
                        "direction": direction,
                        "shift": shift,
                        "previous_score": prev_score,
                        "current_score": current_score,
                        "label": sentiment.get("label", "Unknown"),
                        "article_count": sentiment.get("article_count", 0),
                        "timestamp": time.time(),
                        "read": False,
                    }

                    # Save alert for all users tracking this coin
                    _distribute_alert(coin_id, alert)
                    alerts_generated += 1
                    logger.info(
                        "Sentiment alert: %s shifted %+d (%d -> %d)",
                        coin_id, shift, prev_score, current_score,
                    )

            _prev_scores[coin_id] = current_score

        except Exception as exc:
            logger.warning("Sentiment alert check error for %s: %s", coin_id, exc)

    if alerts_generated:
        logger.info("Generated %d sentiment alerts", alerts_generated)


def _distribute_alert(coin_id: str, alert: dict):
    """Save a sentiment alert to all users who track this coin."""
    for username in _get_all_usernames():
        try:
            favs = load_user_data(username, "favorites")
            tracked_coins = set(DEFAULT_COINS)
            if isinstance(favs, list):
                for fav in favs:
                    cid = fav.get("coin_id") if isinstance(fav, dict) else fav
                    if cid:
                        tracked_coins.add(cid)

            if coin_id in tracked_coins:
                # Append to user's sentiment alerts
                user_alerts = load_user_data(username, "sentiment_alerts")
                if not isinstance(user_alerts, list):
                    user_alerts = []

                user_alerts.insert(0, alert)
                # Keep last 100 alerts
                user_alerts = user_alerts[:100]
                save_user_data(username, "sentiment_alerts", user_alerts)

        except Exception as exc:
            logger.warning("Error distributing alert to %s: %s", username, exc)


def get_user_sentiment_alerts(
    username: str, unread_only: bool = False, limit: int = 20
) -> list[dict[str, Any]]:
    """Get sentiment alerts for a user."""
    alerts = load_user_data(username, "sentiment_alerts")
    if not isinstance(alerts, list):
        return []

    if unread_only:
        alerts = [a for a in alerts if not a.get("read", False)]

    return alerts[:limit]


def mark_alert_read(username: str, timestamp: float):
    """Mark a sentiment alert as read."""
    alerts = load_user_data(username, "sentiment_alerts")
    if not isinstance(alerts, list):
        return

    for alert in alerts:
        if alert.get("timestamp") == timestamp:
            alert["read"] = True
            break

    save_user_data(username, "sentiment_alerts", alerts)
