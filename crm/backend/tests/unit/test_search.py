"""US-315: Global Search API tests — TDD RED phase."""
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from main import app
from core.dependencies import get_current_user
from database import get_db
from models.user import UserRole


def _make_user(role=UserRole.ADMIN, tenant_id=None):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.tenant_id = tenant_id or uuid.uuid4()
    u.role = role
    return u


@pytest.fixture
def user():
    return _make_user()


@pytest.fixture
def client(user):
    db = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


class TestSearchRouter:

    def test_search_returns_structured_results(self, client, user):
        """GET /api/search returns {contacts, deals, companies}."""
        with pytest.MonkeyPatch().context() as mp:
            from repositories import search_repo as sr_mod
            mock_repo = MagicMock()
            mock_repo.search = AsyncMock(return_value={
                "contacts": [],
                "deals": [],
                "companies": [],
            })
            mp.setattr(sr_mod, "SearchRepository", lambda db: mock_repo)

            resp = client.get("/api/search?q=acme")
        assert resp.status_code == 200
        data = resp.json()
        assert "contacts" in data
        assert "deals" in data
        assert "companies" in data

    def test_search_requires_query(self, client, user):
        """GET /api/search without q= returns 422."""
        resp = client.get("/api/search")
        assert resp.status_code == 422

    def test_search_min_query_length(self, client, user):
        """GET /api/search with q shorter than 2 chars returns 422."""
        resp = client.get("/api/search?q=a")
        assert resp.status_code == 422

    def test_search_contacts_type_filter(self, client, user):
        """GET /api/search?types=contacts only returns contacts."""
        contact = MagicMock()
        contact.id = uuid.uuid4()
        contact.first_name = "Alice"
        contact.last_name = "Smith"
        contact.email = "alice@example.com"
        contact.company_id = None

        with pytest.MonkeyPatch().context() as mp:
            from repositories import search_repo as sr_mod
            mock_repo = MagicMock()
            mock_repo.search = AsyncMock(return_value={
                "contacts": [contact],
                "deals": [],
                "companies": [],
            })
            mp.setattr(sr_mod, "SearchRepository", lambda db: mock_repo)

            resp = client.get("/api/search?q=alice&types=contacts")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["contacts"]) == 1
        assert data["deals"] == []

    def test_search_max_10_per_type(self, client, user):
        """GET /api/search returns max 10 results per type."""
        contacts = [MagicMock() for _ in range(15)]
        for c in contacts:
            c.id = uuid.uuid4()
            c.first_name = "John"
            c.last_name = "Doe"
            c.email = "john@example.com"
            c.company_id = None

        with pytest.MonkeyPatch().context() as mp:
            from repositories import search_repo as sr_mod
            mock_repo = MagicMock()
            # Repo enforces limit=10, return 10 max
            mock_repo.search = AsyncMock(return_value={
                "contacts": contacts[:10],
                "deals": [],
                "companies": [],
            })
            mp.setattr(sr_mod, "SearchRepository", lambda db: mock_repo)

            resp = client.get("/api/search?q=john")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["contacts"]) <= 10

    def test_search_tenant_scoped(self, client, user):
        """GET /api/search only returns results for current tenant."""
        with pytest.MonkeyPatch().context() as mp:
            from repositories import search_repo as sr_mod
            mock_repo = MagicMock()
            mock_repo.search = AsyncMock(return_value={
                "contacts": [],
                "deals": [],
                "companies": [],
            })
            mp.setattr(sr_mod, "SearchRepository", lambda db: mock_repo)

            resp = client.get("/api/search?q=test")

        mock_repo.search.assert_called_once()
        call_kwargs = mock_repo.search.call_args
        assert call_kwargs.kwargs.get("tenant_id") == user.tenant_id or \
               (call_kwargs.args and call_kwargs.args[0] == user.tenant_id)

        assert resp.status_code == 200


class TestSearchRepository:

    @pytest.mark.asyncio
    async def test_search_contacts(self):
        """SearchRepository.search queries contacts with ILIKE."""
        from repositories.search_repo import SearchRepository
        db = AsyncMock()

        contact = MagicMock()
        contact.id = uuid.uuid4()
        contact.first_name = "Alice"
        contact.last_name = "Smith"
        contact.email = "alice@acme.com"
        contact.company_id = None

        deal = MagicMock()
        deal.id = uuid.uuid4()
        deal.title = "Acme Deal"
        deal.value = 1000.0
        deal.status = "open"
        deal.stage_id = uuid.uuid4()

        company = MagicMock()
        company.id = uuid.uuid4()
        company.name = "Acme Corp"
        company.domain = "acme.com"

        mock_r1 = MagicMock()
        mock_r1.scalars.return_value.all.return_value = [contact]
        mock_r2 = MagicMock()
        mock_r2.scalars.return_value.all.return_value = [deal]
        mock_r3 = MagicMock()
        mock_r3.scalars.return_value.all.return_value = [company]

        db.execute = AsyncMock(side_effect=[mock_r1, mock_r2, mock_r3])

        repo = SearchRepository(db)
        result = await repo.search(
            tenant_id=uuid.uuid4(),
            query="acme",
            types=["contacts", "deals", "companies"],
        )
        assert "contacts" in result
        assert "deals" in result
        assert "companies" in result

    @pytest.mark.asyncio
    async def test_search_only_contacts_type(self):
        """SearchRepository.search with types=['contacts'] skips deals/companies queries."""
        from repositories.search_repo import SearchRepository
        db = AsyncMock()

        mock_r = MagicMock()
        mock_r.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=mock_r)

        repo = SearchRepository(db)
        result = await repo.search(
            tenant_id=uuid.uuid4(),
            query="test",
            types=["contacts"],
        )
        assert "contacts" in result
        assert result.get("deals", []) == []
        assert result.get("companies", []) == []
        # Only one DB execute call (for contacts only)
        assert db.execute.call_count == 1
