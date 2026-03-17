"""US-316: CSV Contact Import tests — RED phase."""
import io
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from core.dependencies import get_current_user, get_tenant_id
from database import get_db
from models import User


TENANT_ID = uuid.uuid4()
USER_ID = uuid.uuid4()

MOCK_USER = User(id=USER_ID, tenant_id=TENANT_ID, email="dev@test.com", role="admin")


def _mock_db():
    db = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    # execute() should return a MagicMock (not AsyncMock) so that
    # calling .scalar_one_or_none() on the result returns None (not a coroutine)
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = None
    exec_result.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=exec_result)
    return db


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    app.dependency_overrides[get_tenant_id] = lambda: TENANT_ID
    app.dependency_overrides[get_db] = lambda: _mock_db()
    yield TestClient(app)
    app.dependency_overrides.clear()


VALID_CSV = (
    "first_name,last_name,email,phone,company_name,title,tags\n"
    "Alice,Smith,alice@example.com,555-0001,Acme,Engineer,vip;enterprise\n"
    "Bob,Jones,bob@example.com,555-0002,Beta,Manager,\n"
    "Charlie,Brown,,,,Sales Rep,\n"
)

MINIMAL_CSV = (
    "first_name,last_name\n"
    "Dana,White\n"
)

MALFORMED_ROWS_CSV = (
    "first_name,last_name,email\n"
    "Valid,Row,valid@test.com\n"
    ",MissingFirst,nofirst@test.com\n"        # missing first_name
    "MissingLast,,nolast@test.com\n"           # missing last_name
    "Good,Row2,good2@test.com\n"
)

EMPTY_CSV = "first_name,last_name,email\n"

TAGS_CSV = (
    "first_name,last_name,tags\n"
    "Eva,Green,vip,enterprise\n"   # tags column present
)

OVER_LIMIT_CSV = (
    "first_name,last_name\n"
    + "Row,Data\n" * 1001
)


class TestCSVImportEndpoint:
    def test_import_valid_csv_returns_200(self, client):
        csv_bytes = VALID_CSV.encode()
        response = client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        assert response.status_code == 200

    def test_import_returns_imported_count(self, client):
        csv_bytes = VALID_CSV.encode()
        response = client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        data = response.json()
        assert "imported" in data
        assert data["imported"] == 3

    def test_import_returns_skipped_and_errors(self, client):
        csv_bytes = MALFORMED_ROWS_CSV.encode()
        response = client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        data = response.json()
        assert data["imported"] == 2
        assert data["skipped"] == 2
        assert len(data["errors"]) == 2

    def test_import_error_includes_row_number(self, client):
        csv_bytes = MALFORMED_ROWS_CSV.encode()
        response = client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        errors = response.json()["errors"]
        for err in errors:
            assert "row" in err
            assert "message" in err

    def test_import_empty_csv_returns_zero(self, client):
        csv_bytes = EMPTY_CSV.encode()
        response = client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        data = response.json()
        assert data["imported"] == 0
        assert data["skipped"] == 0

    def test_import_missing_required_headers_returns_422(self, client):
        bad_csv = "email,phone\nalice@test.com,555\n".encode()
        response = client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(bad_csv), "text/csv")},
        )
        assert response.status_code == 422

    def test_import_minimal_csv_first_last_only(self, client):
        csv_bytes = MINIMAL_CSV.encode()
        response = client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        assert response.status_code == 200
        assert response.json()["imported"] == 1

    def test_import_no_file_returns_422(self, client):
        response = client.post("/contacts/import")
        assert response.status_code == 422

    def test_import_response_shape(self, client):
        csv_bytes = VALID_CSV.encode()
        response = client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        data = response.json()
        assert set(data.keys()) >= {"imported", "skipped", "errors"}
        assert isinstance(data["errors"], list)

    def test_import_over_1000_rows_returns_422(self, client):
        csv_bytes = OVER_LIMIT_CSV.encode()
        response = client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        assert response.status_code == 422

    def test_import_tags_column_parsed(self, client):
        csv_bytes = VALID_CSV.encode()
        response = client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        # Tags column present — should not cause errors or skips
        data = response.json()
        assert data["imported"] == 3
        assert data["skipped"] == 0

    def test_import_company_name_column_parsed(self, client):
        csv_bytes = VALID_CSV.encode()
        response = client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_bytes), "text/csv")},
        )
        data = response.json()
        # company_name present for Alice and Bob — contacts still imported
        assert data["imported"] == 3
