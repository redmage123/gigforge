"""CryptoAdvisor Dashboard — FastAPI backend with React SPA frontend."""

import asyncio
import os
import matplotlib
matplotlib.use("Agg")

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from middleware.auth import AuthMiddleware
from middleware.rate_limiter import RateLimiter
from middleware.request_logger import RequestLogger
from middleware.csrf import CSRFMiddleware
from services.auth import ensure_default_admin
from services.database import init_db
from services.scheduler import register_task, cancel_all
from services.alerts import check_all_alerts
from services.portfolio_history import take_snapshot
from services.user_data import load_user_data
from services.websocket_prices import price_manager
from services.dca_automation import check_and_execute_dcas

# API routers
from api.alerts import router as alerts_router
from api.blockchain import router as blockchain_router
from api.charts import router as charts_router
from api.dca import router as dca_router
from api.defi import router as defi_router
from api.exchanges import router as exchanges_router
from api.gas import router as gas_router
from api.market import router as market_router
from api.networth import router as networth_router
from api.nfts import router as nfts_router
from api.notifications import router as notifications_router
from api.portfolio_history import router as portfolio_history_router
from api.portfolio import router as portfolio_router
from api.risk import router as risk_router
from api.tax import router as tax_router
from api.tokens import router as tokens_router
from api.trades import router as trades_router
from api.transactions import router as transactions_router
from api.wallet import router as wallet_api_router
from api.whales import router as whales_router
from api.token_approvals import router as token_approvals_router
from api.staking import router as staking_router
from api.airdrops import router as airdrops_router
from api.onchain_pnl import router as onchain_pnl_router
from api.impermanent_loss import router as impermanent_loss_router
from api.correlation import router as correlation_router
from api.sentiment import router as sentiment_router
from api.totp import router as totp_router
from api.audit import router as audit_router
from api.user_sessions import router as user_sessions_router
from api.push import router as push_router
from api.pdf_report import router as pdf_report_router
from api.settings import router as settings_router
from api.websocket_prices import router as websocket_prices_router
from api.ai_analysis import router as ai_analysis_router
from api.orderbook import router as orderbook_router
from api.liquidations import router as liquidations_router
from api.mempool import router as mempool_router
from api.token_unlocks import router as token_unlocks_router
from api.backtest import router as backtest_router
from api.yields import router as yields_router
from api.dca_plans import router as dca_plans_router
from api.copy_trading import router as copy_trading_router
from api.governance import router as governance_router
from api.dev_activity import router as dev_activity_router
from api.wallet_health import router as wallet_health_router
from api.rugpull import router as rugpull_router
from api.multisig import router as multisig_router
from api.ai_advanced import router as ai_advanced_router
from api.telegram_config import router as telegram_config_router
from api.csv_import import router as csv_import_router
from api.share import router as share_router
from api.pwa import router as pwa_router
from api.wizard import router as wizard_router
from api.health import router as health_router
from api.payments import router as payments_router
from api.converter import router as converter_router
from api.api_keys import router as api_keys_router
from api.activity import router as activity_router
from api.favorites import router as favorites_router
from api.sidebar_prefs import router as sidebar_prefs_router
from api.sentiment_advisor import router as sentiment_advisor_router
from api.memory import router as memory_router
from api.search import router as search_router

# Auth router (JSON API)
from routers.auth import router as auth_router

# React SPA directory
REACT_DIR = Path(__file__).parent / "static" / "react"


# --- Chat endpoint model ---
class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []  # optional conversation history for fact extraction


# --- Portfolio snapshot wrapper (scheduler needs a no-arg async fn) ---
async def _snapshot_all_users():
    """Take portfolio snapshots for all users with wallets configured."""
    data_dir = Path(__file__).parent / "data" / "wallets"
    if not data_dir.exists():
        return
    for f in data_dir.glob("*.json"):
        username = f.stem
        try:
            await take_snapshot(username)
        except Exception as e:
            print(f"[scheduler] snapshot error for {username}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    await init_db()
    from services.user_memory import init_memory_tables
    await init_memory_tables()
    from services.rag import init_rag_tables, cleanup_expired
    await init_rag_tables()
    ensure_default_admin()
    print("CryptoAdvisor Dashboard starting...")

    # Register background tasks
    register_task(check_all_alerts, interval_seconds=60, name="alert_checker")
    register_task(_snapshot_all_users, interval_seconds=3600, name="portfolio_snapshots")
    register_task(check_and_execute_dcas, interval_seconds=3600, name="dca_executor")

    # Sentiment analysis background tasks
    from services.news_scanner import scan_all_sources
    from services.sentiment_alerts import check_sentiment_alerts
    register_task(scan_all_sources, interval_seconds=900, name="news_scanner")
    register_task(check_sentiment_alerts, interval_seconds=300, name="sentiment_alerts")
    register_task(cleanup_expired, interval_seconds=3600, name="rag_cleanup")

    # Start WebSocket price feed
    asyncio.create_task(price_manager.start_price_feed())

    yield

    cancel_all()
    print("CryptoAdvisor Dashboard shutting down.")


app = FastAPI(title="CryptoAdvisor Dashboard", lifespan=lifespan)

# Middleware (outermost first — RequestLogger wraps everything)
app.add_middleware(RequestLogger)
app.add_middleware(CSRFMiddleware)
app.add_middleware(AuthMiddleware)
app.add_middleware(RateLimiter)

# Static files
app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")

# Mount ALL API routers
app.include_router(alerts_router, prefix="/api/alerts", tags=["alerts"])
app.include_router(blockchain_router, prefix="/api/blockchain", tags=["blockchain"])
app.include_router(charts_router, prefix="/api/charts", tags=["charts"])
app.include_router(dca_router, prefix="/api/dca", tags=["dca"])
app.include_router(defi_router, prefix="/api/defi", tags=["defi"])
app.include_router(exchanges_router, prefix="/api/exchanges", tags=["exchanges"])
app.include_router(gas_router, prefix="/api/gas", tags=["gas"])
app.include_router(market_router, prefix="/api/market", tags=["market"])
app.include_router(networth_router, prefix="/api/networth", tags=["networth"])
app.include_router(nfts_router, prefix="/api/nfts", tags=["nfts"])
app.include_router(notifications_router, prefix="/api/notifications", tags=["notifications"])
app.include_router(portfolio_history_router, prefix="/api/portfolio-history", tags=["portfolio-history"])
app.include_router(portfolio_router, prefix="/api/portfolio", tags=["portfolio"])
app.include_router(risk_router, prefix="/api/risk", tags=["risk"])
app.include_router(tax_router, prefix="/api/tax", tags=["tax"])
app.include_router(tokens_router, prefix="/api/tokens", tags=["tokens"])
app.include_router(trades_router, prefix="/api/trades", tags=["trades"])
app.include_router(transactions_router, prefix="/api/transactions", tags=["transactions"])
app.include_router(wallet_api_router, prefix="/api/wallet", tags=["wallet"])
app.include_router(whales_router, prefix="/api/whales", tags=["whales"])
app.include_router(token_approvals_router, prefix="/api/approvals", tags=["approvals"])
app.include_router(staking_router, prefix="/api/staking", tags=["staking"])
app.include_router(airdrops_router, prefix="/api/airdrops", tags=["airdrops"])
app.include_router(onchain_pnl_router, prefix="/api/onchain-pnl", tags=["onchain-pnl"])
app.include_router(impermanent_loss_router, prefix="/api/impermanent-loss", tags=["impermanent-loss"])
app.include_router(correlation_router, prefix="/api/correlation", tags=["correlation"])
app.include_router(sentiment_router, prefix="/api/sentiment", tags=["sentiment"])
app.include_router(totp_router, prefix="/api/2fa", tags=["2fa"])
app.include_router(audit_router, prefix="/api/audit", tags=["audit"])
app.include_router(user_sessions_router, prefix="/api/sessions", tags=["sessions"])
app.include_router(push_router, prefix="/api/push", tags=["push"])
app.include_router(pdf_report_router, prefix="/api/reports", tags=["reports"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(websocket_prices_router, tags=["websocket"])
app.include_router(ai_analysis_router, prefix="/api/ai", tags=["ai"])
app.include_router(orderbook_router, prefix="/api/orderbook", tags=["orderbook"])
app.include_router(liquidations_router, prefix="/api/liquidations", tags=["liquidations"])
app.include_router(mempool_router, prefix="/api/mempool", tags=["mempool"])
app.include_router(token_unlocks_router, prefix="/api/unlocks", tags=["unlocks"])
app.include_router(backtest_router, prefix="/api/backtest", tags=["backtest"])
app.include_router(yields_router, prefix="/api/yields", tags=["yields"])
app.include_router(dca_plans_router, prefix="/api/dca-plans", tags=["dca-plans"])
app.include_router(copy_trading_router, prefix="/api/copy-trading", tags=["copy-trading"])
app.include_router(governance_router, prefix="/api/governance", tags=["governance"])
app.include_router(dev_activity_router, prefix="/api/dev-activity", tags=["dev-activity"])
app.include_router(wallet_health_router, prefix="/api/wallet-health", tags=["wallet-health"])
app.include_router(rugpull_router, prefix="/api/rugpull", tags=["rugpull"])
app.include_router(multisig_router, prefix="/api/multisig", tags=["multisig"])
app.include_router(ai_advanced_router, prefix="/api/ai-advanced", tags=["ai-advanced"])
app.include_router(telegram_config_router, prefix="/api/telegram", tags=["telegram"])
app.include_router(csv_import_router, prefix="/api/csv-import", tags=["csv-import"])
app.include_router(share_router, prefix="/api/share", tags=["share"])
app.include_router(pwa_router, tags=["pwa"])
app.include_router(wizard_router, prefix="/api/wizard", tags=["wizard"])
app.include_router(health_router, tags=["health"])
app.include_router(payments_router, prefix="/api/payments", tags=["payments"])
app.include_router(converter_router, prefix="/api/converter", tags=["converter"])
app.include_router(api_keys_router, prefix="/api/keys", tags=["api-keys"])
app.include_router(activity_router, prefix="/api/activity", tags=["activity"])
app.include_router(favorites_router, prefix="/api/favorites", tags=["favorites"])
app.include_router(sidebar_prefs_router, prefix="/api/sidebar", tags=["sidebar"])
app.include_router(sentiment_advisor_router, prefix="/api/sentiment-advisor", tags=["sentiment-advisor"])
app.include_router(memory_router, prefix="/api/memory", tags=["memory"])
app.include_router(search_router, prefix="/api/search", tags=["search"])

# Auth API router
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])


# --- Chat endpoint ---
@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    """RAG-enhanced chat — retrieves user memories, injects context, extracts new facts."""
    from services.user_memory import (
        build_memory_context, extract_facts_from_conversation, add_facts_bulk,
    )

    username = ""
    try:
        user = getattr(request.state, "user", {})
        username = user.get("sub", "")
    except Exception:
        pass

    # Build RAG context from user memories
    memory_context = ""
    if username:
        try:
            memory_context = await build_memory_context(username, req.message)
        except Exception as e:
            print(f"[chat] memory context error: {e}")

    # Construct the augmented prompt
    prompt_parts = []
    if memory_context:
        prompt_parts.append(
            "You are a personalized crypto advisor. Use the following knowledge "
            "about this user to give tailored advice. Reference what you know "
            "about them when relevant, but don't list all facts unprompted.\n\n"
            + memory_context
        )
    prompt_parts.append(req.message)
    augmented_prompt = "\n\n---\n\n".join(prompt_parts)

    try:
        proc = await asyncio.create_subprocess_exec(
            "claude",
            "--mcp-config", "/home/bbrelin/.claude/empty-mcp.json",
            "--model", "sonnet",
            "-p", augmented_prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={k: v for k, v in os.environ.items() if k != "CLAUDECODE"},
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            return JSONResponse(
                status_code=502,
                content={"error": f"Claude CLI error: {stderr.decode().strip()}"},
            )

        response_text = stdout.decode().strip()

        # Background: extract facts from this exchange and store them
        if username and req.message.strip():
            conversation = list(req.history[-8:]) if req.history else []
            conversation.append({"role": "user", "content": req.message})
            conversation.append({"role": "assistant", "content": response_text})
            asyncio.create_task(_extract_and_store_facts(username, conversation))

        return {"response": response_text}
    except FileNotFoundError:
        return JSONResponse(
            status_code=502,
            content={"error": "Claude CLI not found. Ensure 'claude' is on PATH."},
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


async def _extract_and_store_facts(username: str, conversation: list[dict]):
    """Background task: extract personal facts from a conversation and store them."""
    from services.user_memory import extract_facts_from_conversation, add_facts_bulk
    try:
        facts = await extract_facts_from_conversation(conversation)
        if facts:
            count = await add_facts_bulk(username, facts, source="chat")
            if count:
                print(f"[memory] stored {count} new facts for user {username}")
    except Exception as e:
        print(f"[memory] extraction error: {e}")


# --- React SPA catch-all ---
@app.get("/{full_path:path}")
async def serve_react(full_path: str):
    """Serve React SPA — static assets or index.html for client-side routing."""
    # Try to serve the exact file first (JS, CSS, images, etc.)
    file_path = REACT_DIR / full_path
    if full_path and file_path.is_file():
        return FileResponse(file_path)

    # Never fall back to index.html for asset requests — return 404 instead
    if full_path.startswith("assets/"):
        return JSONResponse(status_code=404, content={"error": "Asset not found"})

    # Fall back to index.html for client-side routing
    index = REACT_DIR / "index.html"
    if index.is_file():
        return FileResponse(index)

    return JSONResponse(status_code=404, content={"error": "React build not found. Run the frontend build first."})
