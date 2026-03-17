"""User settings endpoints."""

from datetime import datetime, timezone
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Any
from services.theme import get_theme, set_theme
from services.widget_settings import get_layout, save_layout
from services.technical_layout import (
    get_technical_layout, save_technical_layout, AVAILABLE_INDICATORS, DEFAULT_LAYOUT as DEFAULT_TECHNICAL_LAYOUT,
)
from services.currency import get_supported_currencies
from services.user_data import load_user_data, save_user_data

router = APIRouter()


class ThemeUpdate(BaseModel):
    theme: str  # "dark" or "light"


class CurrencyUpdate(BaseModel):
    currency: str


class WidgetLayoutUpdate(BaseModel):
    layout: List[Any]


class TechnicalLayoutUpdate(BaseModel):
    layout: List[Any]


@router.get("/")
async def get_settings(request: Request):
    try:
        username = request.state.user.get("sub", "")
        return {
            "username": username,
            "theme": get_theme(username),
            "currency": load_user_data(username, "currency") or "USD",
            "widget_layout": get_layout(username),
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.put("/theme")
async def update_theme(request: Request, body: ThemeUpdate):
    try:
        username = request.state.user.get("sub", "")
        if body.theme not in ("dark", "light"):
            return JSONResponse({"error": "Theme must be 'dark' or 'light'"}, status_code=400)
        set_theme(username, body.theme)
        return {"theme": body.theme, "message": "Theme updated"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.put("/currency")
async def update_currency(request: Request, body: CurrencyUpdate):
    try:
        username = request.state.user.get("sub", "")
        supported = get_supported_currencies()
        if body.currency not in supported:
            return JSONResponse(
                {"error": f"Unsupported currency. Choose from: {supported}"},
                status_code=400,
            )
        save_user_data(username, "currency", body.currency)
        return {"currency": body.currency, "message": "Currency updated"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.put("/widgets")
async def update_widget_layout(request: Request, body: WidgetLayoutUpdate):
    try:
        username = request.state.user.get("sub", "")
        save_layout(username, body.layout)
        return {"layout": body.layout, "message": "Widget layout updated"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/technical-layout")
async def get_technical_layout_endpoint(request: Request):
    try:
        username = request.state.user.get("sub", "")
        return {
            "layout": get_technical_layout(username),
            "available_indicators": AVAILABLE_INDICATORS,
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.put("/technical-layout")
async def update_technical_layout_endpoint(request: Request, body: TechnicalLayoutUpdate):
    try:
        username = request.state.user.get("sub", "")
        save_technical_layout(username, body.layout)
        return {"layout": body.layout, "message": "Technical layout updated"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/technical-layout/reset")
async def reset_technical_layout(request: Request):
    try:
        username = request.state.user.get("sub", "")
        layout = [dict(w) for w in DEFAULT_TECHNICAL_LAYOUT]
        save_technical_layout(username, layout)
        return {"layout": layout, "message": "Technical layout reset to defaults"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/currencies")
async def list_currencies(request: Request):
    try:
        return {"currencies": get_supported_currencies()}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/guide-status")
async def guide_status(request: Request):
    """Check if the user has completed the interactive guide."""
    try:
        username = request.state.user.get("sub", "")
        data = load_user_data(username, "guide_status")
        completed = data.get("guide_completed", False) if isinstance(data, dict) else False
        return {"guide_completed": completed}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/guide-completed")
async def mark_guide_completed(request: Request):
    """Mark the interactive guide as completed for this user."""
    try:
        username = request.state.user.get("sub", "")
        save_user_data(username, "guide_status", {"guide_completed": True})
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/guide-reset")
async def reset_guide(request: Request):
    """Reset the guide so it shows again on next page load."""
    try:
        username = request.state.user.get("sub", "")
        save_user_data(username, "guide_status", {"guide_completed": False})
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/export")
async def export_all_data(request: Request):
    """Export all user data as JSON."""
    username = request.state.user.get("sub", "")

    export = {
        "username": username,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "wallets": [],
        "trades": [],
        "alerts": [],
        "dca_plans": [],
        "portfolio_history": [],
        "settings": {},
        "copy_trading_wallets": [],
        "notifications": [],
    }

    from services.alerts import get_alerts
    from services.trades import get_trades
    from services.dca_automation import get_dca_plans
    from services.copy_trading import get_watched_wallets
    from services.notifications import get_notifications
    from services.portfolio_history import get_history

    try: export["wallets"] = load_user_data(username, "wallets") or []
    except: pass
    try: export["trades"] = get_trades(username)
    except: pass
    try: export["alerts"] = get_alerts(username)
    except: pass
    try: export["dca_plans"] = get_dca_plans(username)
    except: pass
    try: export["copy_trading_wallets"] = get_watched_wallets(username)
    except: pass
    try: export["notifications"] = get_notifications(username)
    except: pass
    try: export["portfolio_history"] = await get_history(username, days=365)
    except: pass
    try:
        export["settings"] = {
            "theme": get_theme(username),
            "widget_layout": get_layout(username),
        }
    except: pass

    return export
