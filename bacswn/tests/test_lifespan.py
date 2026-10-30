"""Tests for FastAPI lifespan httpx client shutdown — S2-004."""

import pytest
import unittest.mock as mock
from unittest.mock import AsyncMock, MagicMock, patch
from contextlib import asynccontextmanager


@pytest.mark.asyncio
async def test_lifespan_closes_opensky_client_on_shutdown():
    """On shutdown, lifespan must call aclose() on opensky_client._client."""
    from services import opensky_client

    mock_client = AsyncMock()
    mock_client.aclose = AsyncMock()

    with patch.object(opensky_client, "_client", mock_client):
        # Import the lifespan from main
        import importlib
        import main as main_module

        lifespan_fn = main_module.lifespan
        mock_app = MagicMock()

        # Run through the lifespan context
        async with lifespan_fn(mock_app):
            pass  # yield point — startup done, now shutdown

    mock_client.aclose.assert_called_once()


@pytest.mark.asyncio
async def test_lifespan_handles_none_clients_gracefully():
    """If _client is None on opensky or awc modules, lifespan exits without error."""
    from services import opensky_client, awc_client
    import main as main_module

    with patch.object(opensky_client, "_client", None), \
         patch.object(awc_client, "_client", None):

        lifespan_fn = main_module.lifespan
        mock_app = MagicMock()

        # Should not raise
        async with lifespan_fn(mock_app):
            pass
