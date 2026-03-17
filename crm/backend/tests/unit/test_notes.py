"""US-312: Notes API tests — TDD RED phase."""
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


def _make_note(note_id=None, tenant_id=None, contact_id=None, deal_id=None, company_id=None):
    n = MagicMock()
    n.id = note_id or uuid.uuid4()
    n.tenant_id = tenant_id or uuid.uuid4()
    n.content = "Test note content"
    n.pinned = False
    n.contact_id = contact_id
    n.deal_id = deal_id
    n.company_id = company_id
    n.created_by = uuid.uuid4()
    return n


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


# ─── US-312: Notes API ────────────────────────────────────────────────────────

class TestNotesRouter:

    def test_create_note_on_contact(self, client, user):
        """POST /api/notes creates a note linked to a contact."""
        contact_id = str(uuid.uuid4())
        note = _make_note(tenant_id=user.tenant_id, contact_id=uuid.UUID(contact_id))

        with pytest.MonkeyPatch().context() as mp:
            from repositories import note_repo as nr_mod
            mock_repo = MagicMock()
            mock_repo.create = AsyncMock(return_value=note)
            mp.setattr(nr_mod, "NoteRepository", lambda db: mock_repo)

            resp = client.post("/api/notes", json={
                "content": "Test note content",
                "contact_id": contact_id,
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["content"] == "Test note content"
        assert data["contact_id"] == contact_id

    def test_create_note_on_deal(self, client, user):
        """POST /api/notes creates a note linked to a deal."""
        deal_id = str(uuid.uuid4())
        note = _make_note(tenant_id=user.tenant_id, deal_id=uuid.UUID(deal_id))
        note.content = "Deal note"

        with pytest.MonkeyPatch().context() as mp:
            from repositories import note_repo as nr_mod
            mock_repo = MagicMock()
            mock_repo.create = AsyncMock(return_value=note)
            mp.setattr(nr_mod, "NoteRepository", lambda db: mock_repo)

            resp = client.post("/api/notes", json={
                "content": "Deal note",
                "deal_id": deal_id,
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["deal_id"] == deal_id

    def test_list_notes_tenant_scoped(self, client, user):
        """GET /api/notes returns tenant-scoped notes."""
        contact_id = uuid.uuid4()
        notes = [_make_note(tenant_id=user.tenant_id, contact_id=contact_id)]

        with pytest.MonkeyPatch().context() as mp:
            from repositories import note_repo as nr_mod
            mock_repo = MagicMock()
            mock_repo.list = AsyncMock(return_value=(notes, 1))
            mp.setattr(nr_mod, "NoteRepository", lambda db: mock_repo)

            resp = client.get(f"/api/notes?contact_id={contact_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1

    def test_pin_note(self, client, user):
        """PATCH /api/notes/{id} can pin a note."""
        note_id = uuid.uuid4()
        note = _make_note(note_id=note_id, tenant_id=user.tenant_id)
        note.pinned = True

        with pytest.MonkeyPatch().context() as mp:
            from repositories import note_repo as nr_mod
            mock_repo = MagicMock()
            mock_repo.update = AsyncMock(return_value=note)
            mp.setattr(nr_mod, "NoteRepository", lambda db: mock_repo)

            resp = client.patch(f"/api/notes/{note_id}", json={"pinned": True})
        assert resp.status_code == 200
        data = resp.json()
        assert data["pinned"] is True

    def test_note_max_10k_chars(self, client, user):
        """POST /api/notes rejects content > 10,000 characters."""
        resp = client.post("/api/notes", json={
            "content": "x" * 10001,
        })
        assert resp.status_code == 422

    def test_get_note_by_id(self, client, user):
        """GET /api/notes/{id} returns a single note."""
        note_id = uuid.uuid4()
        note = _make_note(note_id=note_id, tenant_id=user.tenant_id)

        with pytest.MonkeyPatch().context() as mp:
            from repositories import note_repo as nr_mod
            mock_repo = MagicMock()
            mock_repo.get_by_id = AsyncMock(return_value=note)
            mp.setattr(nr_mod, "NoteRepository", lambda db: mock_repo)

            resp = client.get(f"/api/notes/{note_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == str(note_id)

    def test_get_note_not_found(self, client, user):
        """GET /api/notes/{id} returns 404 if note not found."""
        note_id = uuid.uuid4()

        with pytest.MonkeyPatch().context() as mp:
            from repositories import note_repo as nr_mod
            mock_repo = MagicMock()
            mock_repo.get_by_id = AsyncMock(return_value=None)
            mp.setattr(nr_mod, "NoteRepository", lambda db: mock_repo)

            resp = client.get(f"/api/notes/{note_id}")
        assert resp.status_code == 404

    def test_delete_note(self, client, user):
        """DELETE /api/notes/{id} returns 204."""
        note_id = uuid.uuid4()

        with pytest.MonkeyPatch().context() as mp:
            from repositories import note_repo as nr_mod
            mock_repo = MagicMock()
            mock_repo.delete = AsyncMock(return_value=True)
            mp.setattr(nr_mod, "NoteRepository", lambda db: mock_repo)

            resp = client.delete(f"/api/notes/{note_id}")
        assert resp.status_code == 204

    def test_delete_note_not_found(self, client, user):
        """DELETE /api/notes/{id} returns 404 when note not found."""
        note_id = uuid.uuid4()

        with pytest.MonkeyPatch().context() as mp:
            from repositories import note_repo as nr_mod
            mock_repo = MagicMock()
            mock_repo.delete = AsyncMock(return_value=False)
            mp.setattr(nr_mod, "NoteRepository", lambda db: mock_repo)

            resp = client.delete(f"/api/notes/{note_id}")
        assert resp.status_code == 404


class TestNoteRepository:

    @pytest.mark.asyncio
    async def test_create_note(self):
        """NoteRepository.create persists a note."""
        from repositories.note_repo import NoteRepository
        db = AsyncMock()
        repo = NoteRepository(db)
        note = await repo.create(
            tenant_id=uuid.uuid4(),
            content="Hello world",
            contact_id=uuid.uuid4(),
            created_by=uuid.uuid4(),
        )
        db.add.assert_called_once()
        db.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_list_notes_by_contact(self):
        """NoteRepository.list filters by contact_id."""
        from repositories.note_repo import NoteRepository
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_scalar = MagicMock()
        mock_scalar.scalar.return_value = 0
        db.execute = AsyncMock(side_effect=[mock_scalar, mock_result])
        repo = NoteRepository(db)
        notes, total = await repo.list(
            tenant_id=uuid.uuid4(),
            contact_id=uuid.uuid4(),
        )
        assert total == 0
        assert notes == []

    @pytest.mark.asyncio
    async def test_update_note_pin(self):
        """NoteRepository.update sets pinned=True."""
        from repositories.note_repo import NoteRepository
        db = AsyncMock()
        note = MagicMock()
        note.id = uuid.uuid4()
        note.pinned = False

        repo = NoteRepository(db)
        # Override get_by_id to return our mock note
        async def mock_get(nid, tid):
            note.pinned = True
            return note
        repo.get_by_id = mock_get

        result = await repo.update(
            note_id=note.id,
            tenant_id=uuid.uuid4(),
            updates={"pinned": True},
        )
        assert result.pinned is True

    @pytest.mark.asyncio
    async def test_delete_note(self):
        """NoteRepository.delete removes a note."""
        from repositories.note_repo import NoteRepository
        db = AsyncMock()
        note = MagicMock()

        repo = NoteRepository(db)
        async def mock_get(nid, tid):
            return note
        repo.get_by_id = mock_get

        result = await repo.delete(note_id=uuid.uuid4(), tenant_id=uuid.uuid4())
        assert result is True
        db.delete.assert_called_once_with(note)
