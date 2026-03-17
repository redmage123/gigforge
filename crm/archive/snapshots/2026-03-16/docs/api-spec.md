# CRM Platform — REST API Specification

**Platform:** GigForge + TechUni CRM
**Backend:** FastAPI + SQLAlchemy 2.x async + Pydantic v2
**Auth:** JWT Bearer (access token 15 min, refresh token 7 days)
**Base URL:** `https://api.crm.ai-elevate.ai`
**API Version:** v1 (path prefix: `/api`)
**Date:** 2026-03-15

---

## Table of Contents

1. [Global Conventions](#global-conventions)
2. [Authentication — /api/auth](#authentication--apiauth)
3. [Contacts — /api/contacts](#contacts--apicontacts)
4. [Companies — /api/companies](#companies--apicompanies)
5. [Pipeline Stages — /api/pipeline-stages](#pipeline-stages--apipipeline-stages)
6. [Deals — /api/deals](#deals--apideals)
7. [Activities — /api/activities](#activities--apiactivities)
8. [Tasks — /api/tasks](#tasks--apitasks)
9. [Tags — /api/tags](#tags--apitags)
10. [Custom Fields — /api/custom-fields](#custom-fields--apicustom-fields)
11. [Dashboard — /api/dashboard](#dashboard--apidashboard)
12. [Webhooks — /api/webhooks](#webhooks--apiwebhooks)
13. [Webhook Event Types](#webhook-event-types)
14. [Appendix: Pydantic v2 Model Examples](#appendix-pydantic-v2-model-examples)

---

## Global Conventions

### Authentication

All endpoints except `POST /api/auth/register` and `POST /api/auth/login` require:

```
Authorization: Bearer <access_token>
```

**JWT payload structure:**
```json
{
  "sub":       "user-uuid",
  "org_id":    "org-uuid",
  "role":      "agent",
  "is_agent":  false,
  "exp":       1234567890,
  "iat":       1234567890,
  "jti":       "unique-token-id"
}
```

### Pagination

All list endpoints use **cursor-based pagination**.

**Request query parameters:**

| Parameter | Type    | Default | Description |
|-----------|---------|---------|-------------|
| `cursor`  | string  | —       | Base64-encoded UUID of the last item from the previous page |
| `limit`   | integer | 50      | Items per page. Max: 200 |

**Response envelope (all list endpoints):**

```json
{
  "items":       [ "..." ],
  "next_cursor": "base64encodedUUID==",
  "has_more":    true,
  "total":       412
}
```

`total` is the count of all matching records (before pagination). `next_cursor` is `null` when `has_more` is `false`.

### Standard Error Format

```json
{
  "error": {
    "code":    "RESOURCE_NOT_FOUND",
    "message": "Contact with id 'abc' not found in this organization.",
    "details": {
      "field": "id",
      "value": "abc"
    }
  }
}
```

**Common error codes:**

| HTTP Status | Code | Meaning |
|-------------|------|---------|
| 401 | `UNAUTHORIZED` | Missing, expired, or blacklisted JWT |
| 403 | `FORBIDDEN` | Valid JWT but insufficient role |
| 404 | `RESOURCE_NOT_FOUND` | Entity not found in this org |
| 409 | `CONFLICT` | Unique constraint violation |
| 422 | `VALIDATION_ERROR` | Request body failed Pydantic validation |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Tenant Isolation

Every authenticated request is scoped to the `org_id` embedded in the JWT. Members of one org cannot access, create, or modify records belonging to another org. Attempting to reference a resource from another org returns `404` (not `403`) to avoid leaking existence information.

### Role-Based Access Control

| Action | `viewer` | `agent` | `manager` | `admin` |
|--------|----------|---------|-----------|---------|
| Read all org records | Y | N* | Y | Y |
| Create records | N | Y | Y | Y |
| Update own records | N | Y | Y | Y |
| Update any record | N | N | Y | Y |
| Delete records | N | N | Y | Y |
| Manage users | N | N | N | Y |
| Manage webhooks | N | N | N | Y |
| Manage pipeline stages | N | N | Y | Y |
| Manage custom fields | N | N | N | Y |

*`agent` role sees only records they own (owner_id = self) or are assigned to (assigned_to = self).

### Rate Limits

| Tier | Limit |
|------|-------|
| Default | 300 requests / 15 min per user |
| Import | 10 requests / hour per org |
| Export | 20 requests / hour per org |
| Search | 60 requests / min per user |

Headers on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

---

## Authentication — `/api/auth`

### POST /api/auth/register

Create a new organization with an initial admin user, OR add a new user to an existing org (admin JWT required for the latter).

**Authentication:** None required for new org creation. JWT Bearer with `admin` role required to add a user to an existing org.

**Request body — new org:**

```json
{
  "mode":          "new_org",
  "org_name":      "Acme Corp",
  "org_slug":      "acme-corp",
  "user_name":     "Jane Smith",
  "user_email":    "jane@acme.com",
  "user_password": "S3cur3P@ss!",
  "user_role":     "admin"
}
```

**Request body — add user to existing org:**

```json
{
  "mode":          "add_user",
  "user_name":     "Bob Jones",
  "user_email":    "bob@gigforge.io",
  "user_password": "S3cur3P@ss!",
  "user_role":     "agent",
  "is_agent":      false
}
```

**Field constraints:**
- `org_slug`: 3–100 characters, lowercase alphanumeric + hyphens, globally unique
- `user_email`: valid email format, unique within org
- `user_password`: minimum 8 characters; required when `is_agent = false`
- `user_role`: one of `admin`, `manager`, `agent`, `viewer`

**Response `201 Created`:**

```json
{
  "user": {
    "id":         "uuid",
    "org_id":     "uuid",
    "email":      "jane@acme.com",
    "name":       "Jane Smith",
    "role":       "admin",
    "is_agent":   false,
    "is_active":  true,
    "created_at": "2026-03-15T10:00:00Z"
  },
  "org": {
    "id":   "uuid",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "plan": "standard"
  },
  "access_token":  "eyJ...",
  "refresh_token": "eyJ...",
  "token_type":    "bearer"
}
```

**Status codes:** `201`, `400` (invalid mode), `401` (add_user without admin JWT), `403`, `409` (slug or email already exists), `422`

---

### POST /api/auth/login

Authenticate a user and issue tokens.

**Authentication:** None

**Request body:**

```json
{
  "email":    "jane@acme.com",
  "password": "S3cur3P@ss!",
  "org_slug": "acme-corp"
}
```

`org_slug` is required because email uniqueness is scoped per org. The same email address can exist in two different orgs.

**Response `200 OK`:**

```json
{
  "access_token":  "eyJ...",
  "refresh_token": "eyJ...",
  "token_type":    "bearer",
  "expires_in":    900,
  "user": {
    "id":            "uuid",
    "org_id":        "uuid",
    "email":         "jane@acme.com",
    "name":          "Jane Smith",
    "role":          "admin",
    "is_agent":      false,
    "last_login_at": "2026-03-15T09:55:00Z"
  },
  "org": {
    "id":   "uuid",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "plan": "standard"
  }
}
```

**Status codes:** `200`, `401` (invalid credentials or inactive account), `404` (org slug not found), `422`

---

### POST /api/auth/logout

Blacklist the current access token's `jti` claim in Redis, invalidating it immediately.

**Authentication:** JWT Bearer (required)

**Request body:** None

**Response `204 No Content`**

**Notes:** The `jti` is stored in Redis with TTL equal to the token's remaining lifetime. All subsequent requests bearing this token receive `401 UNAUTHORIZED`.

**Status codes:** `204`, `401`

---

### POST /api/auth/refresh

Exchange a valid refresh token for a new access token (and rotated refresh token).

**Authentication:** None (refresh token is passed in the request body)

**Request body:**

```json
{
  "refresh_token": "eyJ..."
}
```

**Response `200 OK`:**

```json
{
  "access_token":  "eyJ...",
  "refresh_token": "eyJ...",
  "token_type":    "bearer",
  "expires_in":    900
}
```

**Notes:** Refresh tokens are rotated on every use. The old refresh token is blacklisted; a new one is issued alongside the new access token. This limits the window of exposure if a refresh token is compromised.

**Status codes:** `200`, `401` (expired, blacklisted, or malformed refresh token)

---

## Contacts — `/api/contacts`

### GET /api/contacts

List contacts for the authenticated org. Supports filtering, sorting, and cursor-based pagination.

**Authentication:** JWT Bearer. `agent` role sees only contacts they own; `manager`/`admin` see all.

**Query parameters:**

| Parameter      | Type    | Description |
|----------------|---------|-------------|
| `cursor`       | string  | Pagination cursor |
| `limit`        | integer | Default 50, max 200 |
| `owner_id`     | UUID    | Filter by assigned owner |
| `contact_type` | string  | `lead`, `customer`, `partner`, `prospect` |
| `status`       | string  | `active`, `inactive`, `archived` |
| `company_id`   | UUID    | Filter contacts belonging to a company |
| `tag_id`       | UUID    | Filter contacts with a specific tag |
| `source`       | string  | Filter by lead source |
| `q`            | string  | Trigram full-text search on first_name + last_name + email |
| `sort`         | string  | `created_at`, `updated_at`, `last_name`. Default: `created_at` |
| `order`        | string  | `asc` or `desc`. Default: `desc` |

**Response `200 OK`:**

```json
{
  "items": [
    {
      "id":           "uuid",
      "org_id":       "uuid",
      "owner_id":     "uuid",
      "first_name":   "Alice",
      "last_name":    "Nguyen",
      "email":        "alice@example.com",
      "phone":        "+1-415-555-0100",
      "company_id":   "uuid",
      "company_name": "Acme Corp",
      "contact_type": "lead",
      "status":       "active",
      "source":       "upwork",
      "tags": [
        { "id": "uuid", "name": "VIP", "color": "#F59E0B" }
      ],
      "open_deals_count":  2,
      "open_tasks_count":  1,
      "last_activity_at":  "2026-03-12T14:30:00Z",
      "created_at":        "2026-03-01T12:00:00Z",
      "updated_at":        "2026-03-10T08:00:00Z"
    }
  ],
  "next_cursor": "dXVpZC1oZXJl",
  "has_more":    true,
  "total":       247
}
```

**Status codes:** `200`, `401`, `403`, `422`

---

### POST /api/contacts

Create a new contact.

**Authentication:** JWT Bearer. Min role: `agent`.

**Request body:**

```json
{
  "first_name":   "Alice",
  "last_name":    "Nguyen",
  "email":        "alice@example.com",
  "phone":        "+1-415-555-0100",
  "company_id":   "uuid",
  "contact_type": "lead",
  "status":       "active",
  "source":       "upwork",
  "notes":        "Met at conference. High budget.",
  "owner_id":     "uuid",
  "tag_ids":      ["uuid1", "uuid2"],
  "custom_fields": {
    "definition-uuid-1": "https://linkedin.com/in/alice"
  }
}
```

**Notes:**
- At least one of `first_name`, `last_name`, or `email` must be provided.
- `owner_id` defaults to the authenticated user if omitted.
- `tag_ids` creates `contact_tags` rows. Tags must belong to the same org.
- `custom_fields` maps `definition_id → value`. Values are validated against the field type.
- On creation, an `audit_log` entry is written with `action = "contact.created"`.

**Response `201 Created`:** Full contact object.

**Status codes:** `201`, `401`, `403`, `409` (duplicate email in org), `422`

---

### GET /api/contacts/{id}

Retrieve a single contact with full detail: related activities, tasks, deals, custom fields.

**Authentication:** JWT Bearer.

**Path parameters:** `id` — contact UUID

**Response `200 OK`:**

```json
{
  "id":           "uuid",
  "org_id":       "uuid",
  "owner_id":     "uuid",
  "first_name":   "Alice",
  "last_name":    "Nguyen",
  "email":        "alice@example.com",
  "phone":        "+1-415-555-0100",
  "company": {
    "id":   "uuid",
    "name": "Acme Corp",
    "domain": "acme.com"
  },
  "contact_type": "lead",
  "status":       "active",
  "source":       "upwork",
  "notes":        "Met at conference.",
  "tags": [
    { "id": "uuid", "name": "VIP", "color": "#F59E0B" }
  ],
  "custom_fields": [
    {
      "definition_id": "uuid",
      "field_name":    "linkedin_url",
      "field_label":   "LinkedIn URL",
      "field_type":    "text",
      "value":         "https://linkedin.com/in/alice"
    }
  ],
  "open_deals_count":  2,
  "open_tasks_count":  1,
  "activities_count":  8,
  "last_activity_at":  "2026-03-12T14:30:00Z",
  "recent_activities": [
    {
      "id":               "uuid",
      "activity_type":    "call",
      "subject":          "Discovery call",
      "occurred_at":      "2026-03-12T14:30:00Z",
      "duration_minutes": 30,
      "outcome":          "Positive — requested proposal"
    }
  ],
  "open_tasks": [
    {
      "id":          "uuid",
      "title":       "Send proposal",
      "due_date":    "2026-03-20T17:00:00Z",
      "priority":    "high",
      "assigned_to": "uuid"
    }
  ],
  "created_at": "2026-03-01T12:00:00Z",
  "updated_at": "2026-03-12T14:30:00Z"
}
```

**Status codes:** `200`, `401`, `403`, `404`

---

### PUT /api/contacts/{id}

Full replacement update of a contact. All writable fields must be provided.

**Authentication:** JWT Bearer. `agent` can update only contacts they own; `manager`/`admin` can update any.

**Request body:** Same schema as `POST /api/contacts`.

**Response `200 OK`:** Updated full contact object.

**Status codes:** `200`, `401`, `403`, `404`, `409`, `422`

---

### PATCH /api/contacts/{id}

Partial update. Only fields present in the request body are modified.

**Authentication:** JWT Bearer. Same ownership rules as PUT.

**Request body:** Any subset of fields from `POST /api/contacts`.

**Response `200 OK`:** Updated full contact object.

**Status codes:** `200`, `401`, `403`, `404`, `409`, `422`

---

### DELETE /api/contacts/{id}

Soft-delete by setting `status = 'archived'`. Hard delete is not supported to preserve audit trail integrity.

**Authentication:** JWT Bearer. Min role: `manager`.

**Response `204 No Content`**

**Status codes:** `204`, `401`, `403`, `404`

---

### GET /api/contacts/search

Full-text trigram search across contact names and emails using PostgreSQL `pg_trgm`.

**Authentication:** JWT Bearer.

**Query parameters:**

| Parameter | Type    | Required | Description |
|-----------|---------|----------|-------------|
| `q`       | string  | Yes      | Search term. Min 2 characters. |
| `limit`   | integer | No       | Default 20, max 50 |

**Response `200 OK`:**

```json
{
  "items": [
    {
      "id":           "uuid",
      "first_name":   "Alice",
      "last_name":    "Nguyen",
      "email":        "alice@example.com",
      "company_name": "Acme Corp",
      "contact_type": "lead",
      "similarity":   0.86
    }
  ],
  "total": 3
}
```

**Notes:** Results are ordered by trigram similarity score (descending). This endpoint is not paginated — results are bounded by `limit`. Use `GET /api/contacts?q=` for paginated search.

**Status codes:** `200`, `401`, `422`

---

### POST /api/contacts/{id}/tags

Add a tag to a contact.

**Authentication:** JWT Bearer. `agent` with ownership, or `manager`/`admin`.

**Request body:**

```json
{ "tag_id": "uuid" }
```

**Response `200 OK`:** Updated contact object with full `tags` array.

**Status codes:** `200`, `401`, `403`, `404`, `409` (tag already applied)

---

### DELETE /api/contacts/{id}/tags/{tag_id}

Remove a tag from a contact.

**Authentication:** JWT Bearer. Same ownership rules as tag add.

**Response `204 No Content`**

**Status codes:** `204`, `401`, `403`, `404`

---

### POST /api/contacts/import

Bulk import contacts from a CSV file. Processed asynchronously.

**Authentication:** JWT Bearer. Min role: `manager`.

**Request:** `Content-Type: multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | CSV file. Max 10 MB. |
| `owner_id` | UUID | No | Assign imported contacts to this user. Defaults to authenticated user. |
| `contact_type` | string | No | Default `lead` |
| `source` | string | No | Lead source for all imported contacts |
| `skip_duplicates` | boolean | No | If `true`, rows with existing org emails are silently skipped. Default: `false` (duplicate → error row). |

**Expected CSV column headers (case-insensitive):**
`first_name`, `last_name`, `email`, `phone`, `company_name`, `contact_type`, `source`, `notes`

**Response `202 Accepted`:**

```json
{
  "import_id":  "uuid",
  "status":     "processing",
  "total_rows": 150,
  "message":    "Import is processing in the background."
}
```

**Notes:** The `contact.bulk_imported` webhook event fires on completion. Poll `GET /api/contacts/imports/{import_id}` for status.

**Status codes:** `202`, `400` (malformed CSV or unsupported format), `401`, `403`, `422`

---

### GET /api/contacts/export

Export all matching contacts as a CSV file (streaming response).

**Authentication:** JWT Bearer. Min role: `manager`.

**Query parameters:** All filter parameters from `GET /api/contacts` (without `cursor`/`limit`). Exports all matching records up to 100,000 rows.

**Response `200 OK`:**
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="contacts-2026-03-15.csv"`

**Status codes:** `200`, `401`, `403`, `422`

---

## Companies — `/api/companies`

### GET /api/companies

List companies for the org. Filterable and paginated.

**Authentication:** JWT Bearer.

**Query parameters:**

| Parameter  | Type    | Description |
|------------|---------|-------------|
| `cursor`   | string  | Pagination cursor |
| `limit`    | integer | Default 50, max 200 |
| `q`        | string  | Trigram search on company name |
| `industry` | string  | Filter by industry |
| `size`     | string  | `1-10`, `11-50`, `51-200`, `201-1000`, `1000+` |
| `sort`     | string  | `name`, `created_at`. Default: `created_at` |
| `order`    | string  | `asc` or `desc` |

**Response `200 OK`:**

```json
{
  "items": [
    {
      "id":               "uuid",
      "org_id":           "uuid",
      "name":             "Acme Corp",
      "domain":           "acme.com",
      "industry":         "Software",
      "size":             "51-200",
      "website":          "https://acme.com",
      "phone":            "+1-415-555-0200",
      "address":          { "city": "San Francisco", "country": "US" },
      "contacts_count":   12,
      "open_deals_count": 3,
      "created_at":       "2026-02-01T00:00:00Z",
      "updated_at":       "2026-03-10T00:00:00Z"
    }
  ],
  "next_cursor": null,
  "has_more":    false,
  "total":       38
}
```

**Status codes:** `200`, `401`, `403`, `422`

---

### POST /api/companies

Create a company.

**Authentication:** JWT Bearer. Min role: `agent`.

**Request body:**

```json
{
  "name":     "Acme Corp",
  "domain":   "acme.com",
  "industry": "Software",
  "size":     "51-200",
  "website":  "https://acme.com",
  "phone":    "+1-415-555-0200",
  "address": {
    "street":  "123 Market St",
    "city":    "San Francisco",
    "state":   "CA",
    "zip":     "94105",
    "country": "US"
  },
  "notes": "Enterprise prospect."
}
```

**Response `201 Created`:** Full company object.

**Status codes:** `201`, `401`, `403`, `422`

---

### GET /api/companies/{id}

Get a single company with detail including contact and deal counts.

**Authentication:** JWT Bearer.

**Response `200 OK`:** Full company object plus `recent_activities`, `open_tasks_count`.

**Status codes:** `200`, `401`, `403`, `404`

---

### PUT /api/companies/{id}

Full replacement update of a company.

**Authentication:** JWT Bearer. Min role: `manager`.

**Request body:** Same schema as POST.

**Response `200 OK`:** Updated company object.

---

### PATCH /api/companies/{id}

Partial update of a company.

**Authentication:** JWT Bearer. Min role: `agent`.

**Request body:** Any subset of company fields.

**Response `200 OK`:** Updated company object.

---

### DELETE /api/companies/{id}

Delete a company. Associated contacts have their `company_id` nullified. Associated deals have their `company_id` nullified.

**Authentication:** JWT Bearer. Min role: `manager`.

**Response `204 No Content`**

**Status codes:** `204`, `401`, `403`, `404`

---

### GET /api/companies/{id}/contacts

List all contacts belonging to this company.

**Authentication:** JWT Bearer.

**Query parameters:** `cursor`, `limit`, `contact_type`, `status`

**Response `200 OK`:** Paginated contact list (same item shape as `GET /api/contacts`).

---

### GET /api/companies/{id}/deals

List all deals associated with this company.

**Authentication:** JWT Bearer.

**Query parameters:** `cursor`, `limit`, `status`, `stage_id`

**Response `200 OK`:** Paginated deal list (same item shape as `GET /api/deals`).

---

## Pipeline Stages — `/api/pipeline-stages`

### GET /api/pipeline-stages

List all pipeline stages for the org, ordered by `position` ascending.

**Authentication:** JWT Bearer.

**Response `200 OK`:**

```json
{
  "items": [
    {
      "id":          "uuid",
      "org_id":      "uuid",
      "name":        "Qualified",
      "position":    2,
      "probability": 25,
      "stage_type":  "active",
      "color":       "#3B82F6",
      "deals_count": 14,
      "deals_value": 187500.00,
      "created_at":  "2026-01-01T00:00:00Z",
      "updated_at":  "2026-01-01T00:00:00Z"
    }
  ]
}
```

**Notes:** This endpoint returns all stages without pagination — orgs are expected to have a small number of stages (typically 5–10). `deals_count` and `deals_value` reflect open deals only.

---

### POST /api/pipeline-stages

Create a new pipeline stage.

**Authentication:** JWT Bearer. Min role: `manager`.

**Request body:**

```json
{
  "name":        "Pilot",
  "position":    4,
  "probability": 60,
  "stage_type":  "active",
  "color":       "#6366F1"
}
```

**Notes:** If `position` conflicts with an existing stage, the new stage is inserted at that position and all existing stages at or above the position are incremented atomically.

**Response `201 Created`:** Stage object.

**Status codes:** `201`, `401`, `403`, `422`

---

### PUT /api/pipeline-stages/{id}

Full replacement update of a pipeline stage.

**Authentication:** JWT Bearer. Min role: `manager`.

**Request body:** Same as POST.

**Response `200 OK`:** Updated stage object.

**Status codes:** `200`, `401`, `403`, `404`, `422`

---

### DELETE /api/pipeline-stages/{id}

Delete a pipeline stage.

**Authentication:** JWT Bearer. Min role: `admin`.

**Request body:**

```json
{ "reassign_to_stage_id": "uuid" }
```

**Notes:** Cannot delete a stage that has deals unless `reassign_to_stage_id` is specified. All deals in the deleted stage are moved to the specified stage before deletion. The `won` and `lost` stage types cannot be deleted.

**Response `204 No Content`**

**Status codes:** `204`, `400` (stage has deals and no reassign target; or attempt to delete won/lost stage), `401`, `403`, `404`

---

### PATCH /api/pipeline-stages/reorder

Update stage positions in bulk. Used for drag-and-drop Kanban reordering.

**Authentication:** JWT Bearer. Min role: `manager`.

**Request body:**

```json
{
  "stages": [
    { "id": "uuid1", "position": 1 },
    { "id": "uuid2", "position": 2 },
    { "id": "uuid3", "position": 3 },
    { "id": "uuid4", "position": 4 }
  ]
}
```

**Notes:** All stage IDs must belong to the same org. Positions must be a contiguous sequence starting from 1. The operation is fully atomic — either all positions update or none do.

**Response `200 OK`:** Full updated list of all stages.

**Status codes:** `200`, `400` (duplicate positions or missing stages), `401`, `403`, `422`

---

## Deals — `/api/deals`

### GET /api/deals

List deals. Supports rich filtering for pipeline management and forecasting.

**Authentication:** JWT Bearer. `agent` role sees only deals they own.

**Query parameters:**

| Parameter         | Type    | Description |
|-------------------|---------|-------------|
| `cursor`          | string  | Pagination cursor |
| `limit`           | integer | Default 50, max 200 |
| `stage_id`        | UUID    | Filter by pipeline stage |
| `owner_id`        | UUID    | Filter by deal owner |
| `status`          | string  | `open`, `won`, `lost` |
| `contact_id`      | UUID    | Deals linked to a contact |
| `company_id`      | UUID    | Deals linked to a company |
| `tag_id`          | UUID    | Deals with a specific tag |
| `min_value`       | number  | Minimum deal value |
| `max_value`       | number  | Maximum deal value |
| `close_date_from` | date    | Expected close date range start (ISO 8601 date) |
| `close_date_to`   | date    | Expected close date range end |
| `sort`            | string  | `value`, `expected_close_date`, `created_at`, `updated_at` |
| `order`           | string  | `asc` or `desc` |

**Response `200 OK`:**

```json
{
  "items": [
    {
      "id":                  "uuid",
      "org_id":              "uuid",
      "title":               "Acme — Enterprise License",
      "contact_id":          "uuid",
      "contact_name":        "Alice Nguyen",
      "company_id":          "uuid",
      "company_name":        "Acme Corp",
      "owner_id":            "uuid",
      "owner_name":          "Jane Smith",
      "stage": {
        "id":    "uuid",
        "name":  "Negotiation",
        "color": "#8B5CF6"
      },
      "value":               75000.00,
      "currency":            "USD",
      "probability":         75,
      "expected_close_date": "2026-04-30",
      "actual_close_date":   null,
      "status":              "open",
      "tags":                [],
      "created_at":          "2026-02-15T09:00:00Z",
      "updated_at":          "2026-03-12T11:00:00Z"
    }
  ],
  "next_cursor": null,
  "has_more":    false,
  "total":       23
}
```

**Status codes:** `200`, `401`, `403`, `422`

---

### POST /api/deals

Create a new deal.

**Authentication:** JWT Bearer. Min role: `agent`.

**Request body:**

```json
{
  "title":               "Acme — Enterprise License",
  "contact_id":          "uuid",
  "company_id":          "uuid",
  "stage_id":            "uuid",
  "value":               75000.00,
  "currency":            "USD",
  "probability":         50,
  "expected_close_date": "2026-04-30",
  "notes":               "Multi-year deal, needs legal review.",
  "owner_id":            "uuid",
  "tag_ids":             ["uuid1"]
}
```

**Notes:** On creation, a `deal_stage_history` record is inserted with `from_stage_id = NULL` and `to_stage_id = stage_id`. Fires `deal.created` webhook event.

**Response `201 Created`:** Full deal object.

**Status codes:** `201`, `401`, `403`, `422`

---

### GET /api/deals/{id}

Get a deal with full detail: contact, company, owner, stage history, recent activities, open tasks.

**Authentication:** JWT Bearer.

**Response `200 OK`:**

```json
{
  "id":    "uuid",
  "title": "Acme — Enterprise License",
  "contact": {
    "id": "uuid", "first_name": "Alice", "last_name": "Nguyen", "email": "alice@example.com"
  },
  "company": { "id": "uuid", "name": "Acme Corp" },
  "owner":   { "id": "uuid", "name": "Jane Smith" },
  "stage": {
    "id": "uuid", "name": "Negotiation", "probability": 75, "color": "#8B5CF6"
  },
  "value":               75000.00,
  "currency":            "USD",
  "probability":         75,
  "expected_close_date": "2026-04-30",
  "actual_close_date":   null,
  "status":              "open",
  "notes":               "Multi-year deal.",
  "tags":                [],
  "custom_fields":       [],
  "stage_history": [
    {
      "id":         "uuid",
      "from_stage": null,
      "to_stage":   { "id": "uuid", "name": "Lead In" },
      "changed_by": { "id": "uuid", "name": "Jane Smith" },
      "changed_at": "2026-02-15T09:00:00Z"
    },
    {
      "id":         "uuid",
      "from_stage": { "id": "uuid", "name": "Lead In" },
      "to_stage":   { "id": "uuid", "name": "Negotiation" },
      "changed_by": { "id": "uuid", "name": "Jane Smith" },
      "changed_at": "2026-03-12T11:00:00Z"
    }
  ],
  "recent_activities": [],
  "open_tasks":        [],
  "created_at":        "2026-02-15T09:00:00Z",
  "updated_at":        "2026-03-12T11:00:00Z"
}
```

**Status codes:** `200`, `401`, `403`, `404`

---

### PUT /api/deals/{id}

Full replacement update of a deal.

**Authentication:** JWT Bearer. `agent` can update only deals they own; `manager`/`admin` can update any.

**Request body:** Same as `POST /api/deals`.

**Notes:** If `stage_id` changes, a `deal_stage_history` record is inserted automatically. If the new stage has `stage_type = 'won'` or `'lost'`, `deal.status` is updated accordingly.

**Response `200 OK`:** Updated full deal object.

---

### PATCH /api/deals/{id}

Partial update of a deal.

**Authentication:** JWT Bearer. Same ownership rules as PUT.

**Request body:** Any subset of deal fields.

**Response `200 OK`:** Updated full deal object.

---

### DELETE /api/deals/{id}

Soft-delete — marks the deal as `status = 'lost'` and sets `actual_close_date = today`. Hard deletion is not supported.

**Authentication:** JWT Bearer. Min role: `manager`.

**Response `204 No Content`**

**Status codes:** `204`, `401`, `403`, `404`

---

### PUT /api/deals/{id}/stage

Move a deal to a new pipeline stage. This is the canonical endpoint for stage transitions.

**Authentication:** JWT Bearer. `agent` can move deals they own; `manager`/`admin` can move any deal.

**Request body:**

```json
{
  "stage_id":    "uuid",
  "note":        "Client approved budget — moving to negotiation.",
  "probability": 80
}
```

**Notes:**
- A `deal_stage_history` row is inserted.
- If the target stage `stage_type = 'won'`: `deal.status = 'won'`, `actual_close_date = today()`. Fires `deal.won` webhook event.
- If the target stage `stage_type = 'lost'`: `deal.status = 'lost'`. Fires `deal.lost` webhook event.
- Otherwise fires `deal.stage_changed` webhook event.
- Cannot move to the current stage (returns `400 SAME_STAGE`).

**Response `200 OK`:** Updated deal object with new stage.

**Status codes:** `200`, `400` (same stage), `401`, `403`, `404`, `422`

---

### GET /api/deals/pipeline

Return all open deals grouped by stage. Used for the Kanban board view.

**Authentication:** JWT Bearer.

**Query parameters:**

| Parameter  | Type | Description |
|------------|------|-------------|
| `owner_id` | UUID | Scope to a specific owner's deals |

**Response `200 OK`:**

```json
{
  "pipeline": [
    {
      "stage": {
        "id":          "uuid",
        "name":        "Lead In",
        "position":    1,
        "probability": 10,
        "color":       "#6B7280"
      },
      "deals_count": 8,
      "total_value": 124000.00,
      "deals": [
        {
          "id":                  "uuid",
          "title":               "Acme — Starter",
          "value":               5000.00,
          "contact_name":        "Bob Jones",
          "expected_close_date": "2026-04-15",
          "updated_at":          "2026-03-14T10:00:00Z"
        }
      ]
    }
  ],
  "summary": {
    "total_open_value":  612000.00,
    "weighted_value":    245400.00,
    "total_open_deals":  42
  }
}
```

**Status codes:** `200`, `401`, `403`

---

## Activities — `/api/activities`

### GET /api/activities

List activity records across the org.

**Authentication:** JWT Bearer.

**Query parameters:**

| Parameter       | Type     | Description |
|-----------------|----------|-------------|
| `cursor`        | string   | Pagination cursor |
| `limit`         | integer  | Default 50, max 200 |
| `contact_id`    | UUID     | Activities for a specific contact |
| `deal_id`       | UUID     | Activities for a specific deal |
| `company_id`    | UUID     | Activities for a specific company |
| `owner_id`      | UUID     | Activities performed by a user |
| `activity_type` | string   | `call`, `email`, `meeting`, `note`, `task_complete`, `demo`, `trial`, `other` |
| `occurred_from` | datetime | ISO 8601 datetime |
| `occurred_to`   | datetime | ISO 8601 datetime |
| `sort`          | string   | `occurred_at` (default), `created_at` |
| `order`         | string   | `asc` or `desc`. Default: `desc` |

**Response `200 OK`:**

```json
{
  "items": [
    {
      "id":               "uuid",
      "activity_type":    "call",
      "subject":          "Discovery call — Alice",
      "body":             "Discussed budget and timeline.",
      "contact_id":       "uuid",
      "contact_name":     "Alice Nguyen",
      "deal_id":          "uuid",
      "deal_title":       "Acme — Enterprise License",
      "company_id":       null,
      "owner_id":         "uuid",
      "owner_name":       "Jane Smith",
      "occurred_at":      "2026-03-12T14:30:00Z",
      "duration_minutes": 30,
      "outcome":          "Positive",
      "created_at":       "2026-03-12T14:35:00Z"
    }
  ],
  "next_cursor": null,
  "has_more":    false,
  "total":       156
}
```

**Status codes:** `200`, `401`, `403`, `422`

---

### POST /api/activities

Log a new activity (call, email, meeting, note, etc.).

**Authentication:** JWT Bearer. Min role: `agent`.

**Request body:**

```json
{
  "activity_type":    "call",
  "subject":          "Discovery call — Alice",
  "body":             "Discussed budget and timeline. Client has $75k budget.",
  "contact_id":       "uuid",
  "deal_id":          "uuid",
  "company_id":       null,
  "owner_id":         "uuid",
  "occurred_at":      "2026-03-12T14:30:00Z",
  "duration_minutes": 30,
  "outcome":          "Positive — send proposal"
}
```

**Notes:** At least one of `contact_id`, `deal_id`, or `company_id` must be provided. Fires `activity.created` webhook event.

**Response `201 Created`:** Full activity object.

**Status codes:** `201`, `401`, `403`, `422`

---

### GET /api/activities/{id}

Get a single activity record.

**Authentication:** JWT Bearer.

**Response `200 OK`:** Full activity object.

**Status codes:** `200`, `401`, `403`, `404`

---

### PUT /api/activities/{id}

Full replacement update of an activity.

**Authentication:** JWT Bearer. `agent` can update own activities; `manager`/`admin` can update any.

**Request body:** Same schema as POST.

**Response `200 OK`:** Updated activity object.

---

### DELETE /api/activities/{id}

Delete an activity record.

**Authentication:** JWT Bearer. Min role: `manager`.

**Response `204 No Content`**

**Status codes:** `204`, `401`, `403`, `404`

---

## Tasks — `/api/tasks`

### GET /api/tasks

List tasks with filtering.

**Authentication:** JWT Bearer.

**Query parameters:**

| Parameter     | Type     | Description |
|---------------|----------|-------------|
| `cursor`      | string   | Pagination cursor |
| `limit`       | integer  | Default 50, max 200 |
| `assigned_to` | UUID     | Filter by assignee |
| `is_completed`| boolean  | `true` or `false` |
| `priority`    | string   | `low`, `normal`, `high`, `urgent` |
| `due_from`    | datetime | ISO 8601 |
| `due_to`      | datetime | ISO 8601 |
| `contact_id`  | UUID     | Tasks linked to a contact |
| `deal_id`     | UUID     | Tasks linked to a deal |
| `overdue`     | boolean  | If `true`, returns only past-due incomplete tasks |
| `sort`        | string   | `due_date` (default), `priority`, `created_at` |
| `order`       | string   | `asc` or `desc` |

**Response `200 OK`:**

```json
{
  "items": [
    {
      "id":            "uuid",
      "title":         "Send proposal to Alice",
      "description":   "Include pricing for 50-user tier.",
      "contact_id":    "uuid",
      "contact_name":  "Alice Nguyen",
      "deal_id":       "uuid",
      "deal_title":    "Acme — Enterprise License",
      "assigned_to":   "uuid",
      "assignee_name": "Jane Smith",
      "due_date":      "2026-03-20T17:00:00Z",
      "is_completed":  false,
      "completed_at":  null,
      "priority":      "high",
      "created_at":    "2026-03-14T09:00:00Z"
    }
  ],
  "next_cursor": null,
  "has_more":    false,
  "total":       7
}
```

**Status codes:** `200`, `401`, `403`, `422`

---

### POST /api/tasks

Create a task.

**Authentication:** JWT Bearer. Min role: `agent`.

**Request body:**

```json
{
  "title":       "Send proposal to Alice",
  "description": "Include pricing for 50-user tier.",
  "contact_id":  "uuid",
  "deal_id":     "uuid",
  "assigned_to": "uuid",
  "due_date":    "2026-03-20T17:00:00Z",
  "priority":    "high"
}
```

**Notes:** `created_by` is automatically set to the authenticated user. Fires `task.created` webhook event.

**Response `201 Created`:** Full task object.

**Status codes:** `201`, `401`, `403`, `422`

---

### GET /api/tasks/{id}

Get a single task.

**Authentication:** JWT Bearer.

**Response `200 OK`:** Full task object.

**Status codes:** `200`, `401`, `403`, `404`

---

### PUT /api/tasks/{id}

Full replacement update of a task.

**Authentication:** JWT Bearer. `agent` if assigned or created; `manager`/`admin` any.

**Response `200 OK`:** Updated task object.

---

### DELETE /api/tasks/{id}

Delete a task.

**Authentication:** JWT Bearer. Min role: `manager`.

**Response `204 No Content`**

**Status codes:** `204`, `401`, `403`, `404`

---

### PATCH /api/tasks/{id}/complete

Mark a task as complete (or re-open it).

**Authentication:** JWT Bearer. Any authenticated user who owns or is assigned the task.

**Request body:**

```json
{
  "is_completed": true,
  "note":         "Proposal sent via email at 14:30."
}
```

**Notes:**
- `is_completed = true`: sets `completed_at = now()`. Fires `task.completed` webhook event.
- `is_completed = false` (re-open): sets `completed_at = NULL`.
- If `note` is provided, an `activity` record of type `task_complete` is automatically logged.

**Response `200 OK`:** Updated task object.

**Status codes:** `200`, `401`, `403`, `404`, `422`

---

## Tags — `/api/tags`

### GET /api/tags

List all tags for the org.

**Authentication:** JWT Bearer.

**Response `200 OK`:**

```json
{
  "items": [
    {
      "id":               "uuid",
      "name":             "VIP",
      "color":            "#F59E0B",
      "contacts_count":   12,
      "deals_count":      4,
      "created_at":       "2026-01-15T00:00:00Z"
    }
  ]
}
```

**Notes:** All tags for the org are returned without pagination (orgs typically have fewer than 100 tags).

---

### POST /api/tags

Create a tag.

**Authentication:** JWT Bearer. Min role: `manager`.

**Request body:**

```json
{
  "name":  "VIP",
  "color": "#F59E0B"
}
```

**Notes:** `name` is case-sensitive and must be unique within the org. `color` must be a 6-digit hex color code (e.g. `#F59E0B`).

**Response `201 Created`:** Tag object.

**Status codes:** `201`, `401`, `403`, `409` (name already exists in org), `422`

---

### PUT /api/tags/{id}

Update a tag's name or color.

**Authentication:** JWT Bearer. Min role: `manager`.

**Request body:**

```json
{ "name": "High Value", "color": "#F59E0B" }
```

**Response `200 OK`:** Updated tag object.

**Status codes:** `200`, `401`, `403`, `404`, `409`, `422`

---

### DELETE /api/tags/{id}

Delete a tag. All associated `contact_tags` and `deal_tags` rows are cascade-deleted.

**Authentication:** JWT Bearer. Min role: `admin`.

**Response `204 No Content`**

**Status codes:** `204`, `401`, `403`, `404`

---

## Custom Fields — `/api/custom-fields`

### GET /api/custom-fields

List custom field definitions for a given entity type.

**Authentication:** JWT Bearer.

**Query parameters:**

| Parameter     | Type   | Required | Description |
|---------------|--------|----------|-------------|
| `entity_type` | string | Yes      | `contact`, `company`, or `deal` |

**Response `200 OK`:**

```json
{
  "items": [
    {
      "id":          "uuid",
      "entity_type": "contact",
      "field_name":  "linkedin_url",
      "field_label": "LinkedIn URL",
      "field_type":  "text",
      "options":     null,
      "is_required": false,
      "position":    1
    },
    {
      "id":          "uuid",
      "entity_type": "contact",
      "field_name":  "lead_score",
      "field_label": "Lead Score",
      "field_type":  "number",
      "options":     null,
      "is_required": false,
      "position":    2
    },
    {
      "id":          "uuid",
      "entity_type": "contact",
      "field_name":  "contact_source_detail",
      "field_label": "Source Detail",
      "field_type":  "select",
      "options":     ["Referral", "Inbound", "Outbound", "Partner"],
      "is_required": false,
      "position":    3
    }
  ]
}
```

**Notes:** Results are ordered by `position` ascending. Not paginated.

---

### POST /api/custom-fields

Create a new custom field definition.

**Authentication:** JWT Bearer. Min role: `admin`.

**Request body:**

```json
{
  "entity_type": "deal",
  "field_name":  "deal_source_detail",
  "field_label": "Deal Source Detail",
  "field_type":  "select",
  "options":     ["Referral", "Inbound", "Outbound", "Partner"],
  "is_required": true,
  "position":    1
}
```

For non-select types, `options` is omitted:
```json
{
  "entity_type": "contact",
  "field_name":  "linkedin_url",
  "field_label": "LinkedIn URL",
  "field_type":  "text",
  "is_required": false,
  "position":    1
}
```

**Field constraints:**
- `field_name`: lowercase alphanumeric + underscores, unique per `(org_id, entity_type)`
- `field_type`: `text`, `number`, `date`, `boolean`, `select`, `multi_select`
- `options`: required and non-empty array for `select`/`multi_select` types

**Response `201 Created`:** Custom field definition object.

**Status codes:** `201`, `401`, `403`, `409` (field_name exists for this entity_type), `422`

---

### PUT /api/custom-fields/{id}

Update a custom field definition.

**Authentication:** JWT Bearer. Min role: `admin`.

**Notes:** `field_name` and `entity_type` are immutable after creation. Only `field_label`, `options`, `is_required`, and `position` can be changed.

**Request body:**

```json
{
  "field_label": "Deal Origin",
  "options":     ["Referral", "Inbound", "Outbound", "Partner", "Event"],
  "is_required": false,
  "position":    2
}
```

**Response `200 OK`:** Updated definition object.

**Status codes:** `200`, `401`, `403`, `404`, `422`

---

### DELETE /api/custom-fields/{id}

Delete a custom field definition and all its associated values.

**Authentication:** JWT Bearer. Min role: `admin`.

**Response `204 No Content`**

**Status codes:** `204`, `401`, `403`, `404`

---

## Dashboard — `/api/dashboard`

### GET /api/dashboard/kpis

Return key pipeline and performance metrics for the authenticated org.

**Authentication:** JWT Bearer.

**Query parameters:**

| Parameter  | Type   | Description |
|------------|--------|-------------|
| `owner_id` | UUID   | Scope KPIs to a specific user's pipeline |
| `period`   | string | `this_month`, `last_month`, `this_quarter`, `last_quarter`, `this_year`. Default: `this_month` |

**Response `200 OK`:**

```json
{
  "period":               "this_month",
  "period_start":         "2026-03-01",
  "period_end":           "2026-03-31",
  "pipeline_value":       612000.00,
  "weighted_pipeline":    245400.00,
  "deals_won_count":      8,
  "deals_won_value":      94500.00,
  "deals_lost_count":     3,
  "deals_lost_value":     22000.00,
  "conversion_rate":      0.24,
  "open_tasks":           15,
  "overdue_tasks":        3,
  "contacts_this_period": 47,
  "avg_deal_size":        11812.50,
  "avg_days_to_close":    28.5,
  "by_stage": [
    {
      "stage_id":    "uuid",
      "stage_name":  "Lead In",
      "position":    1,
      "color":       "#6B7280",
      "deals_count": 12,
      "total_value": 87000.00,
      "weighted":    8700.00
    },
    {
      "stage_id":    "uuid",
      "stage_name":  "Negotiation",
      "position":    4,
      "color":       "#8B5CF6",
      "deals_count": 5,
      "total_value": 285000.00,
      "weighted":    213750.00
    }
  ],
  "by_owner": [
    {
      "owner_id":   "uuid",
      "owner_name": "Jane Smith",
      "deals_count": 18,
      "total_value": 312000.00,
      "won_count":   5,
      "won_value":   62000.00
    }
  ]
}
```

**Notes:**
- `weighted_pipeline` = sum of `deal.value * deal.probability / 100` for all open deals.
- `conversion_rate` = `deals_won_count / (deals_won_count + deals_lost_count)` for the period.
- `avg_deal_size` = `deals_won_value / deals_won_count` for the period.
- All monetary values in the org's default currency (`organizations.settings.currency`).

**Status codes:** `200`, `401`, `422`

---

## Webhooks — `/api/webhooks`

**All webhook endpoints require `admin` role.**

### GET /api/webhooks

List registered webhooks for the org.

**Authentication:** JWT Bearer. Min role: `admin`.

**Response `200 OK`:**

```json
{
  "items": [
    {
      "id":          "uuid",
      "url":         "https://hooks.agents.internal/crm",
      "events":      ["contact.created", "deal.stage_changed"],
      "is_active":   true,
      "description": "AI agent event bus",
      "created_at":  "2026-03-01T00:00:00Z",
      "updated_at":  "2026-03-01T00:00:00Z"
    }
  ]
}
```

**Notes:** The `secret` field is never returned in any GET response.

---

### POST /api/webhooks

Register a new webhook endpoint.

**Authentication:** JWT Bearer. Min role: `admin`.

**Request body:**

```json
{
  "url":         "https://hooks.agents.internal/crm",
  "events":      ["contact.created", "deal.stage_changed", "deal.won"],
  "secret":      "my-hmac-signing-secret-32-chars-min",
  "description": "AI agent event bus",
  "is_active":   true
}
```

**Notes:**
- `secret` is optional. If omitted, the server generates a cryptographically random 32-byte hex string.
- The `secret` is returned **once only** in the creation response and never again.
- `events` must contain at least one valid event type (see [Webhook Event Types](#webhook-event-types)).

**Response `201 Created`:**

```json
{
  "id":          "uuid",
  "url":         "https://hooks.agents.internal/crm",
  "events":      ["contact.created", "deal.stage_changed", "deal.won"],
  "secret":      "the-secret-value-shown-only-once",
  "is_active":   true,
  "description": "AI agent event bus",
  "created_at":  "2026-03-15T10:00:00Z"
}
```

**Status codes:** `201`, `400` (unknown event type in `events` array or invalid URL), `401`, `403`, `422`

---

### GET /api/webhooks/{id}

Get a single webhook configuration (secret not included).

**Authentication:** JWT Bearer. Min role: `admin`.

**Response `200 OK`:** Webhook object without `secret` field.

**Status codes:** `200`, `401`, `403`, `404`

---

### PUT /api/webhooks/{id}

Update a webhook. Omit `secret` to keep the existing signing secret unchanged.

**Authentication:** JWT Bearer. Min role: `admin`.

**Request body:**

```json
{
  "url":         "https://hooks.agents.internal/crm-v2",
  "events":      ["contact.created", "deal.stage_changed", "deal.won", "task.completed"],
  "is_active":   true,
  "description": "AI agent event bus (v2)"
}
```

**Response `200 OK`:** Updated webhook object (no `secret` field).

**Status codes:** `200`, `400`, `401`, `403`, `404`, `422`

---

### DELETE /api/webhooks/{id}

Delete a webhook and all its event delivery history.

**Authentication:** JWT Bearer. Min role: `admin`.

**Response `204 No Content`**

**Status codes:** `204`, `401`, `403`, `404`

---

### GET /api/webhooks/{id}/events

Retrieve the delivery history for a webhook.

**Authentication:** JWT Bearer. Min role: `admin`.

**Query parameters:**

| Parameter    | Type    | Description |
|--------------|---------|-------------|
| `cursor`     | string  | Pagination cursor |
| `limit`      | integer | Default 50, max 200 |
| `status`     | string  | `pending`, `delivered`, `failed`, `retrying` |
| `event_type` | string  | Filter by event type |

**Response `200 OK`:**

```json
{
  "items": [
    {
      "id":                   "uuid",
      "webhook_id":           "uuid",
      "event_type":           "deal.stage_changed",
      "status":               "delivered",
      "attempts":             1,
      "last_attempt_at":      "2026-03-15T10:05:01Z",
      "next_retry_at":        null,
      "response_status_code": 200,
      "response_body":        "{\"ok\":true}",
      "created_at":           "2026-03-15T10:05:00Z"
    }
  ],
  "next_cursor": null,
  "has_more":    false,
  "total":       284
}
```

**Notes:** The `payload` field is omitted from the list view for performance. To inspect the full payload, fetch the event directly: `GET /api/webhooks/{id}/events/{event_id}`.

**Status codes:** `200`, `401`, `403`, `404`, `422`

---

### POST /api/webhooks/{id}/test

Send a test delivery to the webhook URL synchronously. Does not create a persistent delivery record.

**Authentication:** JWT Bearer. Min role: `admin`.

**Request body:**

```json
{ "event_type": "contact.created" }
```

If `event_type` is omitted, the server sends a generic `webhook.test` event.

**Response `200 OK` (delivery succeeded):**

```json
{
  "success":              true,
  "response_status_code": 200,
  "response_body":        "{\"ok\":true}",
  "latency_ms":           142
}
```

**Response `200 OK` (delivery failed):**

```json
{
  "success":              false,
  "response_status_code": 500,
  "response_body":        "Internal Server Error",
  "latency_ms":           3012,
  "error":                "HTTP 500 received from endpoint"
}
```

**Notes:** HTTP `200` is always returned by this endpoint — it indicates the test was executed. Delivery outcome is reported in the `success` field of the response body.

**Status codes:** `200`, `401`, `403`, `404`

---

## Webhook Event Types

### Delivery Payload Envelope

Every webhook HTTP POST uses this top-level structure:

```json
{
  "event":      "contact.created",
  "timestamp":  "2026-03-15T10:05:00.000Z",
  "org_id":     "uuid",
  "actor_id":   "uuid",
  "actor_type": "agent",
  "data":       { "...entity fields..." }
}
```

### HMAC-SHA256 Signature

The raw JSON request body is signed with the webhook's `secret` using HMAC-SHA256:

```
X-CRM-Signature: sha256=<hex_digest>
```

**Verification (Python example):**
```python
import hmac, hashlib

def verify_signature(secret: str, body: bytes, signature_header: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

### Event Reference

| Event Type | Trigger | `data` Object |
|------------|---------|---------------|
| `contact.created` | New contact saved | Full contact object |
| `contact.updated` | Contact field(s) changed | Contact object + `changes: {field: {old, new}}` |
| `contact.deleted` | Contact archived/deleted | `{id, org_id, deleted_at}` |
| `deal.created` | New deal saved | Full deal object |
| `deal.updated` | Deal field(s) changed | Deal object + `changes` map |
| `deal.stage_changed` | Deal moved to new stage | `{deal_id, deal_title, value, from_stage, to_stage, changed_by}` |
| `deal.won` | Deal marked as won (stage_type=won) | Full deal object with `actual_close_date` |
| `deal.lost` | Deal marked as lost (stage_type=lost) | Full deal object |
| `activity.created` | Activity logged | Full activity object |
| `task.created` | Task created | Full task object |
| `task.completed` | Task marked complete | Task object including `completed_at` |

### Retry Policy

| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| Final | Status set to `failed` |

Delivery is considered successful when the endpoint returns HTTP `2xx`. Any other status (including timeouts after 10 seconds) is treated as a failure and triggers the retry schedule.

---

## Appendix: Pydantic v2 Model Examples

### ContactCreate

```python
from pydantic import BaseModel, EmailStr, field_validator, model_validator
from uuid import UUID
from typing import Optional, Any

class ContactCreate(BaseModel):
    first_name:    Optional[str] = None
    last_name:     Optional[str] = None
    email:         Optional[EmailStr] = None
    phone:         Optional[str] = None
    company_id:    Optional[UUID] = None
    contact_type:  str = "lead"
    status:        str = "active"
    source:        Optional[str] = None
    notes:         Optional[str] = None
    owner_id:      Optional[UUID] = None
    tag_ids:       list[UUID] = []
    custom_fields: dict[str, Any] = {}

    model_config = {"str_strip_whitespace": True}

    @field_validator("contact_type")
    @classmethod
    def validate_contact_type(cls, v: str) -> str:
        allowed = {"lead", "customer", "partner", "prospect"}
        if v not in allowed:
            raise ValueError(f"contact_type must be one of {sorted(allowed)}")
        return v

    @model_validator(mode="after")
    def at_least_one_identifier(self) -> "ContactCreate":
        if not any([self.first_name, self.last_name, self.email]):
            raise ValueError(
                "At least one of first_name, last_name, or email must be provided."
            )
        return self
```

### PaginatedResponse

```python
from pydantic import BaseModel
from typing import Generic, TypeVar, Optional

T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    items:       list[T]
    next_cursor: Optional[str] = None
    has_more:    bool
    total:       int
```

### ErrorDetail and ErrorResponse

```python
from pydantic import BaseModel
from typing import Optional, Any

class ErrorDetail(BaseModel):
    code:    str
    message: str
    details: Optional[dict[str, Any]] = None

class ErrorResponse(BaseModel):
    error: ErrorDetail
```

### FastAPI JWT Dependency

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from uuid import UUID

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if await redis.get(f"blacklist:{payload['jti']}"):
        raise HTTPException(status_code=401, detail="Token has been revoked")
    return payload

async def get_current_org_id(
    current_user: dict = Depends(get_current_user),
) -> UUID:
    return UUID(current_user["org_id"])
```

### HTTP Status Code Reference

| Code | Meaning |
|------|---------|
| 200  | Success — response body included |
| 201  | Created — new resource returned |
| 202  | Accepted — async job started |
| 204  | No Content — success, no body |
| 400  | Bad Request — semantic error (e.g. deleting stage with deals and no reassign) |
| 401  | Unauthorized — missing, expired, or blacklisted JWT |
| 403  | Forbidden — insufficient role |
| 404  | Not Found — resource not found in this org |
| 409  | Conflict — unique constraint violation |
| 422  | Unprocessable Entity — Pydantic validation failure |
| 429  | Too Many Requests — rate limit exceeded |
| 500  | Internal Server Error |
