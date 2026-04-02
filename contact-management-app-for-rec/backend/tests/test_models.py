"""
Pydantic model validation tests for ContactBase API response shapes.

These tests define the expected response schemas using Pydantic v2 and
validate that the live API returns data that conforms to those schemas.

Two purposes:
  1. Contract testing — if the API changes its response shape, these tests fail.
  2. Documentation — the models here serve as the canonical type reference for
     consumers integrating with the ContactBase API.

Run with:
    cd backend
    pytest tests/test_models.py -v
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, Optional, TypeVar

import httpx
import pytest
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

# ---------------------------------------------------------------------------
# Pydantic v2 models mirroring the TypeScript types in api/src/types/index.ts
# ---------------------------------------------------------------------------

T = TypeVar("T")


class TagModel(BaseModel):
    id: str
    name: str
    colour: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    is_system: bool

    @field_validator("id")
    @classmethod
    def id_is_uuid(cls, v: str) -> str:
        import uuid
        uuid.UUID(v)  # raises ValueError if invalid
        return v

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        assert len(v.strip()) > 0, "tag name must not be empty"
        return v


class ContactModel(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    notes: Optional[str] = None
    created_at: str  # ISO 8601 string from JSON
    updated_at: str
    tags: list[TagModel]

    @field_validator("id")
    @classmethod
    def id_is_uuid(cls, v: str) -> str:
        import uuid
        uuid.UUID(v)
        return v

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        assert len(v.strip()) > 0, "contact name must not be empty"
        return v

    @field_validator("created_at", "updated_at")
    @classmethod
    def is_iso_timestamp(cls, v: str) -> str:
        # Should parse as ISO 8601 datetime
        datetime.fromisoformat(v.replace("Z", "+00:00"))
        return v


class UserModel(BaseModel):
    id: str
    email: str
    name: str

    @field_validator("id")
    @classmethod
    def id_is_uuid(cls, v: str) -> str:
        import uuid
        uuid.UUID(v)
        return v


class PaginationModel(BaseModel):
    page: int = Field(ge=1)
    limit: int = Field(ge=1, le=100)
    total: int = Field(ge=0)
    pages: int = Field(ge=0)

    @model_validator(mode="after")
    def pages_consistent(self) -> "PaginationModel":
        import math
        expected = math.ceil(self.total / self.limit) if self.total > 0 else 0
        # Allow off-by-one rounding tolerance
        assert abs(self.pages - expected) <= 1, (
            f"pages={self.pages} inconsistent with total={self.total}/limit={self.limit}"
        )
        return self


class LoginDataModel(BaseModel):
    token: str
    user: UserModel

    @field_validator("token")
    @classmethod
    def token_looks_like_jwt(cls, v: str) -> str:
        parts = v.split(".")
        assert len(parts) == 3, "JWT must have three dot-separated parts"
        return v


class CsvImportResultModel(BaseModel):
    imported: int = Field(ge=0)
    skipped: int = Field(ge=0)
    errors: list[dict[str, Any]]

    @field_validator("errors")
    @classmethod
    def errors_have_row_and_reason(cls, v: list[dict]) -> list[dict]:
        for err in v:
            assert "row" in err, f"error missing 'row': {err}"
            assert "reason" in err, f"error missing 'reason': {err}"
        return v


class HealthDataModel(BaseModel):
    status: str
    timestamp: str

    @field_validator("status")
    @classmethod
    def status_is_ok(cls, v: str) -> str:
        assert v == "ok", f"status must be 'ok', got '{v}'"
        return v

    @field_validator("timestamp")
    @classmethod
    def timestamp_is_iso(cls, v: str) -> str:
        datetime.fromisoformat(v.replace("Z", "+00:00"))
        return v


# ---------------------------------------------------------------------------
# Envelope wrapper
# ---------------------------------------------------------------------------


def parse_envelope(body: dict, data_model: type) -> Any:
    """
    Parse the standard API envelope and validate the inner data against data_model.
    Returns the validated data object.
    """
    assert "data" in body, f"Missing 'data' key in response: {body}"
    assert "error" in body, f"Missing 'error' key in response: {body}"
    assert body["error"] is None, f"Unexpected error in response: {body['error']}"
    return data_model.model_validate(body["data"])


# ===========================================================================
# Health model tests
# ===========================================================================


class TestHealthModel:
    def test_health_response_matches_schema(self, client: httpx.Client) -> None:
        body = client.get("/health").json()
        health = parse_envelope(body, HealthDataModel)
        assert health.status == "ok"

    def test_health_timestamp_is_recent(self, client: httpx.Client) -> None:
        from datetime import timezone

        body = client.get("/health").json()
        ts_str = body["data"]["timestamp"].replace("Z", "+00:00")
        ts = datetime.fromisoformat(ts_str)
        now = datetime.now(tz=timezone.utc)
        delta = abs((now - ts).total_seconds())
        assert delta < 60, f"Timestamp {ts_str} is more than 60s from server time"


# ===========================================================================
# Auth model tests
# ===========================================================================


class TestAuthModel:
    def test_login_response_matches_schema(self, client: httpx.Client) -> None:
        body = client.post(
            "/auth/login",
            json={"email": "admin@gigforge.ai", "password": "demo1234"},
        ).json()
        login_data = parse_envelope(body, LoginDataModel)
        assert login_data.user.email == "admin@gigforge.ai"

    def test_login_token_is_three_part_jwt(self, client: httpx.Client) -> None:
        body = client.post(
            "/auth/login",
            json={"email": "admin@gigforge.ai", "password": "demo1234"},
        ).json()
        token = body["data"]["token"]
        parts = token.split(".")
        assert len(parts) == 3

    def test_login_error_response_has_null_data(self, client: httpx.Client) -> None:
        body = client.post(
            "/auth/login",
            json={"email": "admin@gigforge.ai", "password": "wrong"},
        ).json()
        assert body["data"] is None
        assert isinstance(body["error"], str)
        assert len(body["error"]) > 0

    def test_validation_error_response_has_null_data(self, client: httpx.Client) -> None:
        body = client.post("/auth/login", json={"password": "demo1234"}).json()
        assert body["data"] is None
        assert body["error"] is not None


# ===========================================================================
# Contact model tests
# ===========================================================================


class TestContactModel:
    def test_contact_list_items_match_schema(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/contacts").json()
        for item in body["data"]:
            ContactModel.model_validate(item)

    def test_contact_detail_matches_schema(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        body = auth_client.get(f"/contacts/{created_contact['id']}").json()
        contact = parse_envelope(body, ContactModel)
        assert contact.id == created_contact["id"]

    def test_contact_created_at_is_before_updated_at(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        body = auth_client.get(f"/contacts/{created_contact['id']}").json()
        contact = ContactModel.model_validate(body["data"])
        created = datetime.fromisoformat(contact.created_at.replace("Z", "+00:00"))
        updated = datetime.fromisoformat(contact.updated_at.replace("Z", "+00:00"))
        assert created <= updated

    def test_contact_tags_are_valid_tag_models(
        self, auth_client: httpx.Client, created_contact: dict, created_tag: dict
    ) -> None:
        auth_client.post(
            f"/contacts/{created_contact['id']}/tags",
            json={"tagId": created_tag["id"]},
        )
        body = auth_client.get(f"/contacts/{created_contact['id']}").json()
        contact = ContactModel.model_validate(body["data"])
        for tag in contact.tags:
            assert isinstance(tag, TagModel)
            assert tag.colour.startswith("#")
            assert len(tag.colour) == 7
        # Cleanup
        auth_client.delete(f"/contacts/{created_contact['id']}/tags/{created_tag['id']}")

    def test_contact_id_is_valid_uuid(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        import uuid
        uuid.UUID(created_contact["id"])  # raises if not valid UUID

    def test_created_contact_name_matches_input(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        contact = ContactModel.model_validate(created_contact)
        assert contact.name == created_contact["name"]

    def test_contact_optional_fields_can_be_none(self, auth_client: httpx.Client) -> None:
        import uuid as _uuid
        unique = _uuid.uuid4().hex[:8]
        resp = auth_client.post(
            "/contacts",
            json={"name": f"MinimalContact {unique}"},  # no email/phone/company/notes
        )
        body = resp.json()
        contact = ContactModel.model_validate(body["data"])
        assert contact.email is None
        assert contact.phone is None
        assert contact.company is None
        assert contact.notes is None
        auth_client.delete(f"/contacts/{contact.id}")


# ===========================================================================
# Pagination model tests
# ===========================================================================


class TestPaginationModel:
    def test_contacts_list_has_valid_pagination(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/contacts").json()
        assert "pagination" in body
        PaginationModel.model_validate(body["pagination"])

    def test_page_param_reflected_in_pagination(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/contacts?page=2&limit=5").json()
        pagination = PaginationModel.model_validate(body["pagination"])
        assert pagination.page == 2
        assert pagination.limit == 5

    def test_total_non_negative(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/contacts").json()
        pagination = PaginationModel.model_validate(body["pagination"])
        assert pagination.total >= 0

    def test_pages_calculated_from_total_and_limit(self, auth_client: httpx.Client) -> None:
        import math
        body = auth_client.get("/contacts?limit=10").json()
        p = PaginationModel.model_validate(body["pagination"])
        expected_pages = math.ceil(p.total / p.limit) if p.total > 0 else 0
        assert abs(p.pages - expected_pages) <= 1


# ===========================================================================
# Tag model tests
# ===========================================================================


class TestTagModel:
    def test_all_tags_match_schema(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/tags").json()
        for item in body["data"]:
            TagModel.model_validate(item)

    def test_tag_colour_is_hex(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/tags").json()
        for tag in body["data"]:
            assert tag["colour"].startswith("#"), f"Colour must start with #: {tag['colour']}"
            assert len(tag["colour"]) == 7, f"Colour must be 7 chars: {tag['colour']}"

    def test_system_tags_have_is_system_true(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/tags").json()
        system_tag_names = {"candidate", "client", "warm lead", "placed", "interviewed"}
        for tag in body["data"]:
            if tag["name"] in system_tag_names:
                assert tag["is_system"] is True, f"{tag['name']} should be a system tag"

    def test_custom_tag_has_is_system_false(
        self, auth_client: httpx.Client, created_tag: dict
    ) -> None:
        body = auth_client.get("/tags").json()
        match = next((t for t in body["data"] if t["id"] == created_tag["id"]), None)
        assert match is not None
        assert match["is_system"] is False

    def test_created_tag_colour_matches_input(
        self, auth_client: httpx.Client
    ) -> None:
        import uuid
        unique = uuid.uuid4().hex[:8]
        colour = "#CAFE01"
        body = auth_client.post(
            "/tags", json={"name": f"colour-test-{unique}", "colour": colour}
        ).json()
        tag = TagModel.model_validate(body["data"])
        assert tag.colour.upper() == colour.upper()
        auth_client.delete(f"/tags/{tag.id}")


# ===========================================================================
# CSV import result model tests
# ===========================================================================


class TestCsvImportModel:
    def test_import_result_matches_schema(
        self, auth_client: httpx.Client, csv_data: bytes
    ) -> None:
        import io
        body = auth_client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_data), "text/csv")},
        ).json()
        result = parse_envelope(body, CsvImportResultModel)
        assert result.imported >= 0
        assert result.skipped >= 0
        assert isinstance(result.errors, list)

    def test_import_imported_skipped_errors_sum(
        self, auth_client: httpx.Client, csv_data: bytes
    ) -> None:
        """imported + skipped + len(errors) should account for total rows."""
        import io
        body = auth_client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_data), "text/csv")},
        ).json()
        result = CsvImportResultModel.model_validate(body["data"])
        # CSV fixture has 3 data rows; all successful in this fixture
        total_accounted = result.imported + result.skipped + len(result.errors)
        assert total_accounted == 3

    def test_import_error_items_have_required_keys(
        self, auth_client: httpx.Client, invalid_csv_data: bytes
    ) -> None:
        import io
        body = auth_client.post(
            "/contacts/import",
            files={"file": ("bad.csv", io.BytesIO(invalid_csv_data), "text/csv")},
        ).json()
        result = CsvImportResultModel.model_validate(body["data"])
        for err in result.errors:
            assert "row" in err and isinstance(err["row"], int)
            assert "reason" in err and isinstance(err["reason"], str)
