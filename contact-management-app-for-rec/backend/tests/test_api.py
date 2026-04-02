"""
Black-box API tests for ContactBase.

Tests every endpoint defined in the API reference:
  - Health
  - Auth  (login, logout)
  - Contacts  (CRUD, search, filter, sort, pagination, tag assignment)
  - Tags      (list, create, delete, system-tag protection)
  - CSV       (import success, import errors, export)

All tests use httpx against the live running API.
See conftest.py for fixture setup and environment variable configuration.
"""

import io
import uuid

import httpx
import pytest


# ===========================================================================
# Helpers
# ===========================================================================


def assert_envelope(body: dict, *, has_data: bool = True, has_error: bool = False) -> None:
    """Assert the standard {data, error} response envelope."""
    assert "data" in body, f"Missing 'data' key: {body}"
    assert "error" in body, f"Missing 'error' key: {body}"
    if has_data:
        assert body["data"] is not None, f"Expected data but got None: {body}"
    if has_error:
        assert body["error"] is not None, f"Expected error but got None: {body}"
    else:
        assert body["error"] is None, f"Unexpected error: {body['error']}"


# ===========================================================================
# Health
# ===========================================================================


class TestHealth:
    def test_health_returns_200(self, client: httpx.Client) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_returns_ok_status(self, client: httpx.Client) -> None:
        body = client.get("/health").json()
        assert_envelope(body)
        assert body["data"]["status"] == "ok"

    def test_health_includes_timestamp(self, client: httpx.Client) -> None:
        body = client.get("/health").json()
        assert "timestamp" in body["data"]

    def test_health_no_auth_required(self, client: httpx.Client) -> None:
        """Health endpoint must be publicly accessible."""
        resp = client.get("/health")
        assert resp.status_code != 401


# ===========================================================================
# Authentication
# ===========================================================================


class TestLogin:
    def test_valid_credentials_return_200(self, client: httpx.Client) -> None:
        resp = client.post(
            "/auth/login",
            json={"email": "admin@gigforge.ai", "password": "demo1234"},
        )
        assert resp.status_code == 200

    def test_valid_login_returns_token(self, client: httpx.Client) -> None:
        body = client.post(
            "/auth/login",
            json={"email": "admin@gigforge.ai", "password": "demo1234"},
        ).json()
        assert_envelope(body)
        assert "token" in body["data"]
        assert isinstance(body["data"]["token"], str)
        assert len(body["data"]["token"]) > 20

    def test_valid_login_returns_user_object(self, client: httpx.Client) -> None:
        body = client.post(
            "/auth/login",
            json={"email": "admin@gigforge.ai", "password": "demo1234"},
        ).json()
        user = body["data"]["user"]
        assert "id" in user
        assert user["email"] == "admin@gigforge.ai"
        assert "name" in user

    def test_wrong_password_returns_401(self, client: httpx.Client) -> None:
        resp = client.post(
            "/auth/login",
            json={"email": "admin@gigforge.ai", "password": "wrong-password"},
        )
        assert resp.status_code == 401

    def test_unknown_email_returns_401(self, client: httpx.Client) -> None:
        resp = client.post(
            "/auth/login",
            json={"email": "nobody@example.com", "password": "password"},
        )
        assert resp.status_code == 401

    def test_wrong_credentials_return_error_envelope(self, client: httpx.Client) -> None:
        body = client.post(
            "/auth/login",
            json={"email": "admin@gigforge.ai", "password": "wrong"},
        ).json()
        assert_envelope(body, has_data=False, has_error=True)

    def test_missing_email_returns_422(self, client: httpx.Client) -> None:
        resp = client.post("/auth/login", json={"password": "demo1234"})
        assert resp.status_code == 422

    def test_missing_password_returns_422(self, client: httpx.Client) -> None:
        resp = client.post("/auth/login", json={"email": "admin@gigforge.ai"})
        assert resp.status_code == 422

    def test_invalid_email_format_returns_422(self, client: httpx.Client) -> None:
        resp = client.post(
            "/auth/login",
            json={"email": "not-an-email", "password": "demo1234"},
        )
        assert resp.status_code == 422

    def test_no_user_enumeration(self, client: httpx.Client) -> None:
        """Unknown email and wrong password should return same status code."""
        r1 = client.post(
            "/auth/login",
            json={"email": "nobody@example.com", "password": "any"},
        )
        r2 = client.post(
            "/auth/login",
            json={"email": "admin@gigforge.ai", "password": "wrong"},
        )
        assert r1.status_code == r2.status_code


class TestLogout:
    def test_logout_returns_200(self, auth_client: httpx.Client) -> None:
        # Use a fresh token so we don't invalidate the session token
        fresh = auth_client.post(
            "/auth/login",
            json={"email": "admin@gigforge.ai", "password": "demo1234"},
        ).json()["data"]["token"]
        resp = auth_client.post(
            "/auth/logout",
            headers={"Authorization": f"Bearer {fresh}"},
        )
        assert resp.status_code == 200

    def test_blacklisted_token_returns_401(self, client: httpx.Client) -> None:
        """After logout the token must be rejected."""
        # Get a fresh token
        fresh_token = client.post(
            "/auth/login",
            json={"email": "admin@gigforge.ai", "password": "demo1234"},
        ).json()["data"]["token"]

        # Logout
        client.post(
            "/auth/logout",
            headers={"Authorization": f"Bearer {fresh_token}"},
        )

        # Try to use the blacklisted token
        resp = client.get(
            "/contacts",
            headers={"Authorization": f"Bearer {fresh_token}"},
        )
        assert resp.status_code == 401

    def test_logout_without_token_returns_401(self, client: httpx.Client) -> None:
        resp = client.post("/auth/logout")
        assert resp.status_code == 401


# ===========================================================================
# Contacts — List
# ===========================================================================


class TestContactsList:
    def test_unauthenticated_returns_401(self, client: httpx.Client) -> None:
        resp = client.get("/contacts")
        assert resp.status_code == 401

    def test_authenticated_returns_200(self, auth_client: httpx.Client) -> None:
        resp = auth_client.get("/contacts")
        assert resp.status_code == 200

    def test_response_has_envelope(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/contacts").json()
        assert_envelope(body)

    def test_response_data_is_list(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/contacts").json()
        assert isinstance(body["data"], list)

    def test_response_has_pagination(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/contacts").json()
        pagination = body["pagination"]
        assert "page" in pagination
        assert "limit" in pagination
        assert "total" in pagination
        assert "pages" in pagination

    def test_default_page_is_1(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/contacts").json()
        assert body["pagination"]["page"] == 1

    def test_default_limit_is_25(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/contacts").json()
        assert body["pagination"]["limit"] == 25

    def test_contact_object_shape(self, auth_client: httpx.Client, created_contact: dict) -> None:
        body = auth_client.get("/contacts").json()
        # Find our created contact
        match = next((c for c in body["data"] if c["id"] == created_contact["id"]), None)
        if match is None:
            # May be on page 2+ — fetch with higher limit
            body = auth_client.get("/contacts?limit=100").json()
            match = next((c for c in body["data"] if c["id"] == created_contact["id"]), None)
        assert match is not None, "Created contact not found in list"
        for field in ("id", "name", "email", "phone", "company", "notes", "created_at", "updated_at", "tags"):
            assert field in match, f"Missing field: {field}"

    def test_tags_is_list(self, auth_client: httpx.Client, created_contact: dict) -> None:
        body = auth_client.get(f"/contacts/{created_contact['id']}").json()
        assert isinstance(body["data"]["tags"], list)

    def test_pagination_page_param(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/contacts?page=2&limit=1").json()
        assert body["pagination"]["page"] == 2

    def test_pagination_limit_param(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/contacts?limit=5").json()
        assert len(body["data"]) <= 5

    def test_sort_by_name_asc(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/contacts?sortBy=name&sortOrder=asc").json()
        names = [c["name"] for c in body["data"]]
        assert names == sorted(names, key=str.lower)

    def test_sort_by_created_at_desc(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/contacts?sortBy=created_at&sortOrder=desc").json()
        dates = [c["created_at"] for c in body["data"]]
        assert dates == sorted(dates, reverse=True)


# ===========================================================================
# Contacts — Search
# ===========================================================================


class TestContactsSearch:
    def test_search_returns_matching_contact(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        # Search by part of the unique name
        unique_part = created_contact["name"].split()[-1]  # last word (the hex)
        body = auth_client.get(f"/contacts?q={unique_part}").json()
        ids = [c["id"] for c in body["data"]]
        assert created_contact["id"] in ids

    def test_search_returns_match_by_email(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        email_part = created_contact["email"].split("@")[0]
        body = auth_client.get(f"/contacts?q={email_part}").json()
        ids = [c["id"] for c in body["data"]]
        assert created_contact["id"] in ids

    def test_search_returns_match_by_company(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        body = auth_client.get("/contacts?q=Test+Corp").json()
        # created_contact.company = "Test Corp"
        ids = [c["id"] for c in body["data"]]
        assert created_contact["id"] in ids

    def test_search_no_match_returns_empty_list(self, auth_client: httpx.Client) -> None:
        gibberish = "zzz_no_match_xyzxyz_" + uuid.uuid4().hex
        body = auth_client.get(f"/contacts?q={gibberish}").json()
        assert body["data"] == []
        assert body["pagination"]["total"] == 0

    def test_search_with_tag_filter(
        self, auth_client: httpx.Client, created_contact: dict, created_tag: dict
    ) -> None:
        # Assign tag to contact then filter by that tag + search
        auth_client.post(
            f"/contacts/{created_contact['id']}/tags",
            json={"tagId": created_tag["id"]},
        )
        unique_part = created_contact["name"].split()[-1]
        body = auth_client.get(
            f"/contacts?q={unique_part}&tag={created_tag['id']}"
        ).json()
        ids = [c["id"] for c in body["data"]]
        assert created_contact["id"] in ids
        # Cleanup
        auth_client.delete(f"/contacts/{created_contact['id']}/tags/{created_tag['id']}")


# ===========================================================================
# Contacts — Create
# ===========================================================================


class TestContactCreate:
    def test_create_returns_201(self, auth_client: httpx.Client) -> None:
        unique = uuid.uuid4().hex[:8]
        resp = auth_client.post(
            "/contacts",
            json={"name": f"New Contact {unique}", "email": f"new-{unique}@example.com"},
        )
        assert resp.status_code == 201
        # Cleanup
        auth_client.delete(f"/contacts/{resp.json()['data']['id']}")

    def test_create_returns_contact_with_id(self, auth_client: httpx.Client) -> None:
        unique = uuid.uuid4().hex[:8]
        resp = auth_client.post(
            "/contacts",
            json={"name": f"New {unique}"},
        )
        body = resp.json()
        assert_envelope(body)
        assert "id" in body["data"]
        auth_client.delete(f"/contacts/{body['data']['id']}")

    def test_create_with_all_fields(self, auth_client: httpx.Client) -> None:
        unique = uuid.uuid4().hex[:8]
        payload = {
            "name": f"Full {unique}",
            "email": f"full-{unique}@example.com",
            "phone": "+1 555 999 8888",
            "company": "Full Corp",
            "notes": "All fields provided",
        }
        resp = auth_client.post("/contacts", json=payload)
        assert resp.status_code == 201
        data = resp.json()["data"]
        assert data["name"] == payload["name"]
        assert data["email"] == payload["email"]
        assert data["phone"] == payload["phone"]
        assert data["company"] == payload["company"]
        assert data["notes"] == payload["notes"]
        auth_client.delete(f"/contacts/{data['id']}")

    def test_create_missing_name_returns_422(self, auth_client: httpx.Client) -> None:
        resp = auth_client.post(
            "/contacts",
            json={"email": "no-name@example.com"},
        )
        assert resp.status_code == 422

    def test_create_empty_name_returns_422(self, auth_client: httpx.Client) -> None:
        resp = auth_client.post("/contacts", json={"name": ""})
        assert resp.status_code == 422

    def test_create_invalid_email_returns_422(self, auth_client: httpx.Client) -> None:
        resp = auth_client.post(
            "/contacts",
            json={"name": "Valid Name", "email": "not-an-email"},
        )
        assert resp.status_code == 422

    def test_create_unauthenticated_returns_401(self, client: httpx.Client) -> None:
        resp = client.post("/contacts", json={"name": "Ghost"})
        assert resp.status_code == 401

    def test_create_with_tag_ids(
        self, auth_client: httpx.Client, created_tag: dict
    ) -> None:
        unique = uuid.uuid4().hex[:8]
        resp = auth_client.post(
            "/contacts",
            json={"name": f"Tagged {unique}", "tagIds": [created_tag["id"]]},
        )
        assert resp.status_code == 201
        data = resp.json()["data"]
        tag_ids = [t["id"] for t in data["tags"]]
        assert created_tag["id"] in tag_ids
        auth_client.delete(f"/contacts/{data['id']}")


# ===========================================================================
# Contacts — Read
# ===========================================================================


class TestContactRead:
    def test_get_existing_contact_returns_200(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        resp = auth_client.get(f"/contacts/{created_contact['id']}")
        assert resp.status_code == 200

    def test_get_returns_correct_contact(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        body = auth_client.get(f"/contacts/{created_contact['id']}").json()
        assert_envelope(body)
        assert body["data"]["id"] == created_contact["id"]
        assert body["data"]["name"] == created_contact["name"]

    def test_get_nonexistent_returns_404(self, auth_client: httpx.Client) -> None:
        fake_id = str(uuid.uuid4())
        resp = auth_client.get(f"/contacts/{fake_id}")
        assert resp.status_code == 404

    def test_get_invalid_uuid_returns_400_or_404(self, auth_client: httpx.Client) -> None:
        resp = auth_client.get("/contacts/not-a-uuid")
        assert resp.status_code in (400, 404, 422)

    def test_get_unauthenticated_returns_401(
        self, client: httpx.Client, created_contact: dict
    ) -> None:
        resp = client.get(f"/contacts/{created_contact['id']}")
        assert resp.status_code == 401


# ===========================================================================
# Contacts — Update
# ===========================================================================


class TestContactUpdate:
    def test_update_returns_200(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        resp = auth_client.put(
            f"/contacts/{created_contact['id']}",
            json={"name": "Updated Name"},
        )
        assert resp.status_code == 200

    def test_update_changes_name(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        new_name = f"Updated {uuid.uuid4().hex[:6]}"
        body = auth_client.put(
            f"/contacts/{created_contact['id']}",
            json={"name": new_name},
        ).json()
        assert body["data"]["name"] == new_name

    def test_update_partial_preserves_other_fields(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        """Updating only company should not clear email."""
        body = auth_client.put(
            f"/contacts/{created_contact['id']}",
            json={"company": "Changed Corp"},
        ).json()
        assert body["data"]["email"] == created_contact["email"]

    def test_update_nonexistent_returns_404(self, auth_client: httpx.Client) -> None:
        resp = auth_client.put(f"/contacts/{uuid.uuid4()}", json={"name": "X"})
        assert resp.status_code == 404

    def test_update_empty_name_returns_422(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        resp = auth_client.put(
            f"/contacts/{created_contact['id']}",
            json={"name": ""},
        )
        assert resp.status_code == 422

    def test_update_unauthenticated_returns_401(
        self, client: httpx.Client, created_contact: dict
    ) -> None:
        resp = client.put(
            f"/contacts/{created_contact['id']}",
            json={"name": "Ghost Update"},
        )
        assert resp.status_code == 401

    def test_update_updated_at_changes(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        original_updated_at = created_contact["updated_at"]
        import time; time.sleep(0.05)  # ensure clock advances
        body = auth_client.put(
            f"/contacts/{created_contact['id']}",
            json={"notes": "Updated notes"},
        ).json()
        assert body["data"]["updated_at"] >= original_updated_at


# ===========================================================================
# Contacts — Delete
# ===========================================================================


class TestContactDelete:
    def test_delete_returns_204(self, auth_client: httpx.Client) -> None:
        # Create a dedicated contact to delete
        unique = uuid.uuid4().hex[:8]
        contact_id = auth_client.post(
            "/contacts", json={"name": f"ToDelete {unique}"}
        ).json()["data"]["id"]

        resp = auth_client.delete(f"/contacts/{contact_id}")
        assert resp.status_code == 204

    def test_delete_removes_contact(self, auth_client: httpx.Client) -> None:
        unique = uuid.uuid4().hex[:8]
        contact_id = auth_client.post(
            "/contacts", json={"name": f"ToDelete2 {unique}"}
        ).json()["data"]["id"]

        auth_client.delete(f"/contacts/{contact_id}")
        resp = auth_client.get(f"/contacts/{contact_id}")
        assert resp.status_code == 404

    def test_delete_nonexistent_returns_404(self, auth_client: httpx.Client) -> None:
        resp = auth_client.delete(f"/contacts/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_delete_unauthenticated_returns_401(
        self, client: httpx.Client, created_contact: dict
    ) -> None:
        resp = client.delete(f"/contacts/{created_contact['id']}")
        assert resp.status_code == 401


# ===========================================================================
# Contacts — Tag Assignment
# ===========================================================================


class TestContactTagAssignment:
    def test_assign_tag_returns_201(
        self, auth_client: httpx.Client, created_contact: dict, created_tag: dict
    ) -> None:
        resp = auth_client.post(
            f"/contacts/{created_contact['id']}/tags",
            json={"tagId": created_tag["id"]},
        )
        assert resp.status_code == 201
        # Cleanup
        auth_client.delete(f"/contacts/{created_contact['id']}/tags/{created_tag['id']}")

    def test_assigned_tag_appears_in_contact(
        self, auth_client: httpx.Client, created_contact: dict, created_tag: dict
    ) -> None:
        auth_client.post(
            f"/contacts/{created_contact['id']}/tags",
            json={"tagId": created_tag["id"]},
        )
        contact = auth_client.get(f"/contacts/{created_contact['id']}").json()["data"]
        tag_ids = [t["id"] for t in contact["tags"]]
        assert created_tag["id"] in tag_ids
        # Cleanup
        auth_client.delete(f"/contacts/{created_contact['id']}/tags/{created_tag['id']}")

    def test_duplicate_assignment_returns_409(
        self, auth_client: httpx.Client, created_contact: dict, created_tag: dict
    ) -> None:
        auth_client.post(
            f"/contacts/{created_contact['id']}/tags",
            json={"tagId": created_tag["id"]},
        )
        resp = auth_client.post(
            f"/contacts/{created_contact['id']}/tags",
            json={"tagId": created_tag["id"]},
        )
        assert resp.status_code == 409
        # Cleanup
        auth_client.delete(f"/contacts/{created_contact['id']}/tags/{created_tag['id']}")

    def test_remove_tag_returns_204(
        self, auth_client: httpx.Client, created_contact: dict, created_tag: dict
    ) -> None:
        auth_client.post(
            f"/contacts/{created_contact['id']}/tags",
            json={"tagId": created_tag["id"]},
        )
        resp = auth_client.delete(
            f"/contacts/{created_contact['id']}/tags/{created_tag['id']}"
        )
        assert resp.status_code == 204

    def test_removed_tag_no_longer_in_contact(
        self, auth_client: httpx.Client, created_contact: dict, created_tag: dict
    ) -> None:
        auth_client.post(
            f"/contacts/{created_contact['id']}/tags",
            json={"tagId": created_tag["id"]},
        )
        auth_client.delete(
            f"/contacts/{created_contact['id']}/tags/{created_tag['id']}"
        )
        contact = auth_client.get(f"/contacts/{created_contact['id']}").json()["data"]
        tag_ids = [t["id"] for t in contact["tags"]]
        assert created_tag["id"] not in tag_ids

    def test_assign_nonexistent_tag_returns_404(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        resp = auth_client.post(
            f"/contacts/{created_contact['id']}/tags",
            json={"tagId": str(uuid.uuid4())},
        )
        assert resp.status_code == 404

    def test_remove_nonexistent_assignment_returns_404(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        resp = auth_client.delete(
            f"/contacts/{created_contact['id']}/tags/{uuid.uuid4()}"
        )
        assert resp.status_code == 404

    def test_filter_by_tag_returns_correct_contacts(
        self, auth_client: httpx.Client, created_contact: dict, created_tag: dict
    ) -> None:
        auth_client.post(
            f"/contacts/{created_contact['id']}/tags",
            json={"tagId": created_tag["id"]},
        )
        body = auth_client.get(f"/contacts?tag={created_tag['id']}").json()
        ids = [c["id"] for c in body["data"]]
        assert created_contact["id"] in ids
        # All returned contacts should have this tag
        for contact in body["data"]:
            tag_ids = [t["id"] for t in contact["tags"]]
            assert created_tag["id"] in tag_ids
        # Cleanup
        auth_client.delete(f"/contacts/{created_contact['id']}/tags/{created_tag['id']}")


# ===========================================================================
# Tags
# ===========================================================================


class TestTagsList:
    def test_list_returns_200(self, auth_client: httpx.Client) -> None:
        resp = auth_client.get("/tags")
        assert resp.status_code == 200

    def test_list_returns_envelope(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/tags").json()
        assert_envelope(body)
        assert isinstance(body["data"], list)

    def test_system_tags_present(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/tags").json()
        names = [t["name"] for t in body["data"]]
        for system_tag in ("candidate", "client", "warm lead", "placed", "interviewed"):
            assert system_tag in names, f"System tag '{system_tag}' missing"

    def test_tag_object_shape(self, auth_client: httpx.Client) -> None:
        body = auth_client.get("/tags").json()
        tag = body["data"][0]
        for field in ("id", "name", "colour", "is_system"):
            assert field in tag, f"Missing tag field: {field}"

    def test_unauthenticated_returns_401(self, client: httpx.Client) -> None:
        resp = client.get("/tags")
        assert resp.status_code == 401


class TestTagCreate:
    def test_create_returns_201(self, auth_client: httpx.Client) -> None:
        unique = uuid.uuid4().hex[:8]
        resp = auth_client.post("/tags", json={"name": f"tag-{unique}", "colour": "#AABBCC"})
        assert resp.status_code == 201
        auth_client.delete(f"/tags/{resp.json()['data']['id']}")

    def test_create_returns_tag_object(self, auth_client: httpx.Client) -> None:
        unique = uuid.uuid4().hex[:8]
        body = auth_client.post("/tags", json={"name": f"tag-{unique}"}).json()
        assert_envelope(body)
        tag = body["data"]
        assert tag["name"] == f"tag-{unique}"
        assert tag["is_system"] is False
        auth_client.delete(f"/tags/{tag['id']}")

    def test_create_default_colour(self, auth_client: httpx.Client) -> None:
        unique = uuid.uuid4().hex[:8]
        body = auth_client.post("/tags", json={"name": f"nocolor-{unique}"}).json()
        assert body["data"]["colour"] is not None
        auth_client.delete(f"/tags/{body['data']['id']}")

    def test_create_duplicate_name_returns_409(
        self, auth_client: httpx.Client, created_tag: dict
    ) -> None:
        resp = auth_client.post("/tags", json={"name": created_tag["name"]})
        assert resp.status_code == 409

    def test_create_missing_name_returns_422(self, auth_client: httpx.Client) -> None:
        resp = auth_client.post("/tags", json={"colour": "#FF0000"})
        assert resp.status_code == 422

    def test_create_empty_name_returns_422(self, auth_client: httpx.Client) -> None:
        resp = auth_client.post("/tags", json={"name": ""})
        assert resp.status_code == 422


class TestTagDelete:
    def test_delete_custom_tag_returns_204(
        self, auth_client: httpx.Client
    ) -> None:
        unique = uuid.uuid4().hex[:8]
        tag_id = auth_client.post(
            "/tags", json={"name": f"deleteme-{unique}"}
        ).json()["data"]["id"]
        resp = auth_client.delete(f"/tags/{tag_id}")
        assert resp.status_code == 204

    def test_delete_system_tag_returns_403(self, auth_client: httpx.Client) -> None:
        tags = auth_client.get("/tags").json()["data"]
        system_tag = next(t for t in tags if t["is_system"])
        resp = auth_client.delete(f"/tags/{system_tag['id']}")
        assert resp.status_code == 403

    def test_delete_nonexistent_tag_returns_404(self, auth_client: httpx.Client) -> None:
        resp = auth_client.delete(f"/tags/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_deleted_tag_not_in_list(self, auth_client: httpx.Client) -> None:
        unique = uuid.uuid4().hex[:8]
        tag = auth_client.post(
            "/tags", json={"name": f"gone-{unique}"}
        ).json()["data"]
        auth_client.delete(f"/tags/{tag['id']}")
        tags = auth_client.get("/tags").json()["data"]
        ids = [t["id"] for t in tags]
        assert tag["id"] not in ids

    def test_delete_tag_removes_from_contact(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        unique = uuid.uuid4().hex[:8]
        tag = auth_client.post(
            "/tags", json={"name": f"cascade-{unique}"}
        ).json()["data"]
        auth_client.post(
            f"/contacts/{created_contact['id']}/tags",
            json={"tagId": tag["id"]},
        )
        auth_client.delete(f"/tags/{tag['id']}")
        contact = auth_client.get(f"/contacts/{created_contact['id']}").json()["data"]
        tag_ids = [t["id"] for t in contact["tags"]]
        assert tag["id"] not in tag_ids


# ===========================================================================
# CSV Import
# ===========================================================================


class TestCsvImport:
    def test_import_returns_200(
        self, auth_client: httpx.Client, csv_data: bytes
    ) -> None:
        resp = auth_client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_data), "text/csv")},
        )
        assert resp.status_code == 200

    def test_import_response_envelope(
        self, auth_client: httpx.Client, csv_data: bytes
    ) -> None:
        body = auth_client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_data), "text/csv")},
        ).json()
        assert_envelope(body)
        result = body["data"]
        assert "imported" in result
        assert "skipped" in result
        assert "errors" in result

    def test_import_counts_match_csv_rows(
        self, auth_client: httpx.Client, csv_data: bytes
    ) -> None:
        body = auth_client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_data), "text/csv")},
        ).json()
        result = body["data"]
        assert result["imported"] == 3  # three valid rows in csv_data fixture

    def test_import_errors_for_missing_names(
        self, auth_client: httpx.Client, invalid_csv_data: bytes
    ) -> None:
        body = auth_client.post(
            "/contacts/import",
            files={"file": ("bad.csv", io.BytesIO(invalid_csv_data), "text/csv")},
        ).json()
        result = body["data"]
        assert result["errors"] is not None
        assert len(result["errors"]) >= 1  # at least rows with missing name

    def test_import_error_has_row_and_reason(
        self, auth_client: httpx.Client, invalid_csv_data: bytes
    ) -> None:
        body = auth_client.post(
            "/contacts/import",
            files={"file": ("bad.csv", io.BytesIO(invalid_csv_data), "text/csv")},
        ).json()
        for err in body["data"]["errors"]:
            assert "row" in err
            assert "reason" in err

    def test_import_no_file_returns_400(self, auth_client: httpx.Client) -> None:
        resp = auth_client.post("/contacts/import")
        assert resp.status_code in (400, 422)

    def test_import_unauthenticated_returns_401(
        self, client: httpx.Client, csv_data: bytes
    ) -> None:
        resp = client.post(
            "/contacts/import",
            files={"file": ("contacts.csv", io.BytesIO(csv_data), "text/csv")},
        )
        assert resp.status_code == 401

    def test_import_creates_unknown_tags(
        self, auth_client: httpx.Client
    ) -> None:
        unique = uuid.uuid4().hex[:8]
        csv_content = (
            f"name,email,phone,company,tags\n"
            f"Auto Tag Test,autotag-{unique}@example.com,,,autotag-{unique}\n"
        ).encode()
        auth_client.post(
            "/contacts/import",
            files={"file": ("autotag.csv", io.BytesIO(csv_content), "text/csv")},
        )
        tags = auth_client.get("/tags").json()["data"]
        tag_names = [t["name"] for t in tags]
        assert f"autotag-{unique}" in tag_names
        # Cleanup the auto-created tag
        auto_tag = next((t for t in tags if t["name"] == f"autotag-{unique}"), None)
        if auto_tag:
            auth_client.delete(f"/tags/{auto_tag['id']}")


# ===========================================================================
# CSV Export
# ===========================================================================


class TestCsvExport:
    def test_export_returns_200(self, auth_client: httpx.Client) -> None:
        resp = auth_client.get("/contacts/export")
        assert resp.status_code == 200

    def test_export_content_type_is_csv(self, auth_client: httpx.Client) -> None:
        resp = auth_client.get("/contacts/export")
        assert "text/csv" in resp.headers.get("content-type", "")

    def test_export_content_disposition(self, auth_client: httpx.Client) -> None:
        resp = auth_client.get("/contacts/export")
        disposition = resp.headers.get("content-disposition", "")
        assert "attachment" in disposition
        assert ".csv" in disposition

    def test_export_has_csv_headers(self, auth_client: httpx.Client) -> None:
        resp = auth_client.get("/contacts/export")
        first_line = resp.text.split("\n")[0].lower()
        assert "name" in first_line

    def test_export_contains_contacts(
        self, auth_client: httpx.Client, created_contact: dict
    ) -> None:
        resp = auth_client.get("/contacts/export")
        assert created_contact["name"] in resp.text

    def test_export_unauthenticated_returns_401(self, client: httpx.Client) -> None:
        resp = client.get("/contacts/export")
        assert resp.status_code == 401


# ===========================================================================
# Edge cases and security
# ===========================================================================


class TestEdgeCases:
    def test_invalid_bearer_token_returns_401(self, client: httpx.Client) -> None:
        resp = client.get(
            "/contacts",
            headers={"Authorization": "Bearer this-is-not-a-valid-jwt"},
        )
        assert resp.status_code == 401

    def test_malformed_auth_header_returns_401(self, client: httpx.Client) -> None:
        resp = client.get(
            "/contacts",
            headers={"Authorization": "NotBearer token"},
        )
        assert resp.status_code == 401

    def test_nonexistent_endpoint_returns_404(self, client: httpx.Client) -> None:
        resp = client.get("/nonexistent-route-xyz")
        assert resp.status_code == 404

    def test_contacts_import_before_export_in_routing(
        self, auth_client: httpx.Client
    ) -> None:
        """
        'import' and 'export' must not be treated as :id params.
        This tests ADR-006 route ordering note.
        """
        resp = auth_client.get("/contacts/export")
        # Must be 200 (CSV), not 404 (treated as non-existent contact ID)
        assert resp.status_code == 200

    def test_pagination_beyond_last_page_returns_empty(
        self, auth_client: httpx.Client
    ) -> None:
        resp = auth_client.get("/contacts?page=99999&limit=25")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"] == []

    def test_very_long_search_query_does_not_crash(
        self, auth_client: httpx.Client
    ) -> None:
        long_query = "a" * 500
        resp = auth_client.get(f"/contacts?q={long_query}")
        assert resp.status_code in (200, 400, 422)  # must not 500
