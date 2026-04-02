# Software Specification
## Project: Contact Management App for Recruitment Agency
## Customer: sarah.chen.test@gmail.com
## Date: 2026-03-21

---

## 1. Executive Summary

**Product:** A full-stack contact management web application built specifically for a small recruitment agency.

**Who it's for:** A 5-person internal recruitment team who manage a database of candidates, clients, and leads. No public access — all users are pre-provisioned employees of the agency.

**Problem it solves:** Recruitment agencies depend on a fast, well-organised contact database. Spreadsheets become unmanageable beyond a few hundred rows. Generic CRMs are over-engineered, expensive, and slow to onboard. This application gives the team a purpose-built tool: a searchable, taggable contact database they can run themselves, migrate data into via CSV, and access from any device — without vendor lock-in or a SaaS subscription.

**What it delivers:**
- A secure, JWT-authenticated web app accessible only to agency staff
- A contact database built for ~3,000 contacts now, scaling to ~10,000 within a year
- Real-time full-text search and tag-based filtering so recruiters can find anyone instantly
- Bulk CSV import to migrate existing spreadsheet data, and CSV export for backups
- A light/dark mode responsive UI that works on desktop and mobile
- A single `docker compose up` deployment — no infrastructure expertise required

**Delivery:** Two-week build, demo-ready 2026-04-04. Hosted locally via Docker Compose. Budget: 2,000 EUR.

---

## 2. User Personas

### Persona A — The Recruiter (Primary User)

**Name:** Alex / Sarah (representative team member)
**Role:** Recruitment consultant at the agency
**Technical level:** Non-technical. Comfortable with web apps, spreadsheets, email.

**Goals:**
- Quickly find a candidate or client by name, company, or email
- See at a glance whether a contact is a candidate, client, placed, or warm lead
- Add notes and tags to contacts after calls or meetings
- Not lose data — wants exports they can keep

**Pain points:**
- Scrolling through spreadsheets to find someone
- No way to filter "all placed candidates from TechRecruit"
- Having to email a colleague just to update a contact record

**Typical actions:** Search contacts → open a contact → update tags/notes → close

---

### Persona B — The Agency Manager (Power User)

**Name:** Sarah Chen (client)
**Role:** Manages the agency, owns the data
**Technical level:** Low-to-medium. Can follow a README to run Docker.

**Goals:**
- Import the existing spreadsheet of 3,000 contacts on day one
- Know the whole team is using the same system
- Export a full contact list backup whenever needed
- Control who has access (pre-provisioned users only)

**Pain points:**
- Risk of data being held in one person's laptop
- No audit trail or consistent record format

**Typical actions:** CSV import → review import summary → export backup → manage tags

---

### Persona C — The New Recruit (Occasional User)

**Name:** Jordan (new team member)
**Role:** Junior recruiter, recently joined
**Technical level:** Non-technical.

**Goals:**
- Log in and start using the app with no training
- Add contacts from a call without asking anyone

**Pain points:**
- Complex UIs that require onboarding
- Getting locked out or confused by permissions

**Typical actions:** Login → add contact → assign tags → search database

---

## 3. Functional Requirements

---

### FR-001: User Authentication — Login

**Description:** A registered agency staff member can log in with their email and password to access the application. There is no public registration. All user accounts are pre-provisioned by the agency manager.

**User story:** As a recruiter, I want to log in with my email and password, so that only our team can access contact data.

**Acceptance criteria:**
- AC-001-1: A login form is presented at `/login` with email and password fields and a submit button
- AC-001-2: Submitting valid credentials returns a JWT token and redirects the user to the contacts list at `/`
- AC-001-3: Submitting invalid credentials displays a generic error message ("Invalid email or password") — no user enumeration
- AC-001-4: An empty email or password field prevents form submission with a client-side validation message
- AC-001-5: An incorrectly formatted email address (e.g. missing `@`) is rejected client-side before submission
- AC-001-6: A loading spinner is shown while the login request is in flight
- AC-001-7: Any page that requires authentication redirects to `/login` if no valid JWT is present
- AC-001-8: The app does not expose whether an email address exists in the system

**Priority:** Must-have

---

### FR-002: User Authentication — Logout

**Description:** A logged-in user can log out, immediately invalidating their session token so it cannot be reused.

**User story:** As a recruiter, I want to log out of the app, so that my session is closed and my account is not accessible if I step away from my desk.

**Acceptance criteria:**
- AC-002-1: A logout button is visible in the navigation on every authenticated page
- AC-002-2: Clicking logout calls `POST /api/v1/auth/logout` to blacklist the current JWT
- AC-002-3: After logout, the user is redirected to `/login`
- AC-002-4: After logout, navigating back to a protected route redirects to `/login` (token is no longer accepted)
- AC-002-5: The JWT is removed from localStorage on logout

**Priority:** Must-have

---

### FR-003: View Contact List

**Description:** A logged-in user can view a paginated list of all contacts, showing name, email, company, and assigned tags for each contact.

**User story:** As a recruiter, I want to see all contacts in a list, so that I can browse the database and get an overview of who we know.

**Acceptance criteria:**
- AC-003-1: The contacts list is accessible at `/` (root) after login
- AC-003-2: Each row/card in the list shows: name, email, company, and tag badges
- AC-003-3: The list is paginated at 25 contacts per page by default
- AC-003-4: Pagination controls (previous, next, current page indicator, total count) are visible and functional
- AC-003-5: On desktop (viewport ≥768px), contacts are displayed in a table layout with column headers
- AC-003-6: On mobile (viewport <768px), contacts are displayed as individual cards (one per contact)
- AC-003-7: A loading skeleton is shown while the API request is in flight
- AC-003-8: An empty state (illustration + message) is shown when the database has no contacts
- AC-003-9: The list defaults to sorting by most recently created, descending

**Priority:** Must-have

---

### FR-004: Search Contacts

**Description:** A logged-in user can search contacts by name, email, or company using a text search bar. Results update in real time without a full page reload.

**User story:** As a recruiter, I want to type a name or company into a search box and see matching contacts instantly, so that I can find anyone in the database in seconds.

**Acceptance criteria:**
- AC-004-1: A search input is visible at the top of the contacts list
- AC-004-2: Typing in the search bar triggers an API call to `GET /contacts?q=<term>` after a 300ms debounce (no request fires for every keystroke)
- AC-004-3: Search matches across name, email, and company fields simultaneously
- AC-004-4: Results update in the same list without a page reload
- AC-004-5: Clearing the search bar restores the full paginated contact list
- AC-004-6: Pagination still works correctly when a search is active
- AC-004-7: An empty state is shown if the search returns no results ("No contacts match your search")
- AC-004-8: Search response time is under 200ms for a database of 10,000 contacts (GIN full-text index)

**Priority:** Must-have

---

### FR-005: Filter Contacts by Tag

**Description:** A logged-in user can filter the contact list to show only contacts with a specific tag. The filter can be used alone or combined with a search query.

**User story:** As a recruiter, I want to filter contacts by tag (e.g. show all "candidates" or all "warm leads"), so that I can work a specific segment of the database at once.

**Acceptance criteria:**
- AC-005-1: A tag filter dropdown/multi-select is visible near the search bar on the contacts list
- AC-005-2: Selecting a tag filters the list to contacts that have that tag assigned
- AC-005-3: The tag filter and search bar work together: selecting a tag while a search is active applies both filters simultaneously
- AC-005-4: Clearing the tag filter restores the unfiltered (or search-only) list
- AC-005-5: All available tags (system + custom) appear in the filter dropdown
- AC-005-6: Pagination works correctly when a tag filter is active

**Priority:** Must-have

---

### FR-006: Sort Contacts

**Description:** A logged-in user can change the sort order of the contact list.

**User story:** As a recruiter, I want to sort the contact list by name or company, so that I can browse the database alphabetically when needed.

**Acceptance criteria:**
- AC-006-1: The contact list can be sorted by: name (A–Z / Z–A), company (A–Z / Z–A), date created (newest / oldest)
- AC-006-2: The default sort is date created, descending (newest first)
- AC-006-3: Sort order is preserved when filtering or searching

**Priority:** Must-have

---

### FR-007: Add Contact

**Description:** A logged-in user can create a new contact by filling in a form with the contact's details and optionally assigning tags.

**User story:** As a recruiter, I want to add a new contact to the database after a call or meeting, so that their details are captured immediately and searchable by the whole team.

**Acceptance criteria:**
- AC-007-1: An "Add Contact" button is visible on the contacts list page
- AC-007-2: Clicking the button opens a drawer or modal form with fields: Name (required), Email, Phone, Company, Notes, Tags (multi-select)
- AC-007-3: The form cannot be submitted without a value in the Name field; a validation message is shown
- AC-007-4: The Email field validates format (must contain `@` and a domain) if a value is provided
- AC-007-5: On successful submission, the form closes, a success toast notification appears, and the new contact appears in the list
- AC-007-6: If the server returns a 422 validation error, field-level error messages are shown inline next to the relevant fields
- AC-007-7: The form works correctly on mobile (375px viewport)
- AC-007-8: The Tags field allows the user to select any number of existing tags

**Priority:** Must-have

---

### FR-008: Edit Contact

**Description:** A logged-in user can open an existing contact and edit any of their details, including updating or changing tags.

**User story:** As a recruiter, I want to update a contact's details after a placement or status change, so that the database reflects the current situation.

**Acceptance criteria:**
- AC-008-1: Clicking a contact row/card opens an edit drawer or modal pre-populated with the contact's current data
- AC-008-2: All fields can be edited: Name, Email, Phone, Company, Notes, Tags
- AC-008-3: The Name field remains required; the form cannot be submitted without it
- AC-008-4: On successful submission, a success toast appears and the contact list updates to show the new values
- AC-008-5: If the server returns an error, an appropriate error message is displayed without closing the form
- AC-008-6: The user can dismiss/cancel the form without saving changes

**Priority:** Must-have

---

### FR-009: Delete Contact

**Description:** A logged-in user can permanently delete a contact from the database after confirming their intent.

**User story:** As a recruiter, I want to delete a contact that is no longer relevant, so that the database stays clean and accurate.

**Acceptance criteria:**
- AC-009-1: A delete option is available when viewing a contact (e.g. button inside the edit drawer)
- AC-009-2: Clicking delete opens a confirmation dialog: "Are you sure you want to delete [Name]? This cannot be undone."
- AC-009-3: Confirming deletion removes the contact from the database (hard delete) and from the visible list
- AC-009-4: A success toast appears after deletion
- AC-009-5: Cancelling the confirmation dialog leaves the contact unchanged

**Priority:** Must-have

---

### FR-010: View Contact Detail

**Description:** A logged-in user can view all details for a single contact including notes and the full list of tags assigned.

**User story:** As a recruiter, I want to see all information about a contact in one place, so that I have full context before making a call or sending an email.

**Acceptance criteria:**
- AC-010-1: Clicking a contact opens a detail view showing: Name, Email, Phone, Company, Notes, Tags, Date created, Date last updated
- AC-010-2: All tag badges are visible with their assigned colours
- AC-010-3: The detail view provides access to Edit and Delete actions
- AC-010-4: The detail view is accessible via a URL (`/contacts/:id`) so it can be linked directly

**Priority:** Must-have

---

### FR-011: Tag Management — System Tags

**Description:** The application ships with five pre-defined system tags that are always available and cannot be deleted. These cover the core recruitment workflow states.

**User story:** As a recruiter, I want standard tags like "candidate" and "placed" to always be available, so that the whole team uses consistent terminology without any setup.

**Acceptance criteria:**
- AC-011-1: On first application start, five system tags are present: `candidate` (blue #3B82F6), `client` (green #10B981), `warm lead` (amber #F59E0B), `placed` (purple #8B5CF6), `interviewed` (grey #6B7280)
- AC-011-2: System tags appear in the tag filter dropdown and contact form tag selector
- AC-011-3: System tags cannot be deleted via the API (returns 403 Forbidden)
- AC-011-4: System tags are visually distinguished in the UI (e.g. a lock icon or label)

**Priority:** Must-have

---

### FR-012: Tag Management — Custom Tags

**Description:** A logged-in user can create custom tags to supplement the system tags with their own agency-specific categories.

**User story:** As an agency manager, I want to create custom tags like "priority client" or "senior dev", so that we can categorise contacts beyond the standard recruitment states.

**Acceptance criteria:**
- AC-012-1: A user can create a new custom tag from within the contact form tag selector ("Create new tag" inline option)
- AC-012-2: A new tag requires a unique name; submitting a duplicate name returns a 409 error displayed to the user
- AC-012-3: An optional colour (hex) can be specified for the tag; if omitted, a default colour is assigned
- AC-012-4: Newly created custom tags immediately appear in the tag list and can be assigned to contacts
- AC-012-5: Custom tags can be deleted via the API; system tags cannot

**Priority:** Must-have

---

### FR-013: Assign / Remove Tags on a Contact

**Description:** A logged-in user can assign or remove any number of tags on an individual contact.

**User story:** As a recruiter, I want to assign multiple tags to a contact and change them over time, so that I can accurately reflect each person's current status and attributes.

**Acceptance criteria:**
- AC-013-1: The contact form includes a multi-select field showing all available tags
- AC-013-2: Multiple tags can be selected simultaneously
- AC-013-3: The tag multi-select is searchable — typing narrows the list of shown tags
- AC-013-4: Assigning the same tag twice has no effect (idempotent — no duplicate)
- AC-013-5: Removing a tag from a contact does not delete the tag itself
- AC-013-6: Changes to tag assignments are reflected immediately in the contact list and detail view

**Priority:** Must-have

---

### FR-014: CSV Import

**Description:** A logged-in user can import contacts in bulk by uploading a CSV file. The application processes the file, creates the contacts, and returns a summary of what was imported, skipped, and any errors.

**User story:** As an agency manager, I want to upload our existing spreadsheet of 3,000 contacts as a CSV, so that we can migrate to the new system without manually re-entering data.

**Acceptance criteria:**
- AC-014-1: An "Import CSV" button or option is accessible from the contacts list page
- AC-014-2: Clicking the button opens a file picker that only accepts `.csv` files
- AC-014-3: After selecting a file, a progress indicator is shown while the file uploads and processes
- AC-014-4: On completion, a summary modal is shown with: number of contacts imported, number of rows skipped, list of error rows with row number and reason (e.g. "Row 45: Missing name")
- AC-014-5: A valid CSV with 3,000 rows imports without timeout
- AC-014-6: The expected CSV column format is: `name,email,phone,company,tags` (tags are quoted comma-separated values, e.g. `"candidate,warm lead"`)
- AC-014-7: Rows missing the required `name` column value are skipped and reported in the errors list; they do not block the rest of the import
- AC-014-8: After import, newly added contacts appear in the contact list
- AC-014-9: The import button works on mobile

**Priority:** Must-have

---

### FR-015: CSV Export

**Description:** A logged-in user can export all contacts from the database as a CSV file download.

**User story:** As an agency manager, I want to export a full CSV of all contacts, so that I have an offline backup and can share the data with colleagues.

**Acceptance criteria:**
- AC-015-1: An "Export CSV" button is visible on the contacts list page
- AC-015-2: Clicking the button triggers a file download (not a new page); the browser saves a file named `contacts.csv`
- AC-015-3: The exported CSV includes all contacts in the database with columns: `name,email,phone,company,tags`
- AC-015-4: Tags for each contact are exported as a quoted comma-separated value in the `tags` column
- AC-015-5: Exporting an empty database produces a valid CSV with only a header row
- AC-015-6: The export button works on mobile

**Priority:** Must-have

---

### FR-016: Dark Mode

**Description:** The application supports a dark colour scheme. The user can toggle between light and dark mode, and their preference is remembered across sessions.

**User story:** As a recruiter who works long hours in front of a screen, I want to switch to dark mode, so that the interface is easier on my eyes in low-light environments.

**Acceptance criteria:**
- AC-016-1: A dark mode toggle button is visible in the app navigation on all authenticated pages
- AC-016-2: Clicking the toggle switches the entire application between light and dark colour schemes
- AC-016-3: The user's preference is persisted to `localStorage`; the correct theme is applied on page load without a flash of the wrong theme (FOUC prevention: dark class applied on `<html>` before React hydrates)
- AC-016-4: All components — contacts table, forms, modals, drawers, tags, toasts — are styled correctly in both light and dark modes
- AC-016-5: Colour contrast ratios meet WCAG 2.1 AA in both modes (≥4.5:1 for normal text, ≥3:1 for large text)

**Priority:** Must-have

---

### FR-017: Responsive Design

**Description:** The application is fully functional on mobile devices (375px width) and desktop (1440px width).

**User story:** As a recruiter working away from the office, I want to use the app on my phone, so that I can look up or add a contact during a meeting.

**Acceptance criteria:**
- AC-017-1: At viewport ≥768px, the sidebar navigation is visible on the left; the contact list uses a table layout
- AC-017-2: At viewport <768px, the sidebar collapses; navigation moves to a bottom bar or hamburger menu; the contact list switches to a card layout (one card per contact)
- AC-017-3: All forms (create/edit contact, CSV import) are usable on a 375px mobile viewport with no horizontal overflow
- AC-017-4: Buttons and interactive elements are large enough to tap on mobile (minimum 44×44px touch target per WCAG)
- AC-017-5: No content is cut off or inaccessible at 375px or 1440px viewport widths

**Priority:** Must-have

---

### FR-018: Accessibility

**Description:** The application meets WCAG 2.1 Level AA accessibility standards to ensure it is usable by team members with disabilities and with keyboard-only navigation.

**User story:** As a recruiter who uses keyboard navigation, I want to use the full app without a mouse, so that I can work efficiently regardless of my input device.

**Acceptance criteria:**
- AC-018-1: All interactive elements (buttons, links, inputs, dropdowns) are reachable and operable via keyboard (Tab, Enter, Space, Escape, arrow keys where applicable)
- AC-018-2: Focus is visually indicated on all interactive elements (not hidden with `outline: none` without replacement)
- AC-018-3: All images have `alt` attributes; icons used as buttons have `aria-label` attributes
- AC-018-4: Modal and drawer dialogs trap focus while open and return focus to the triggering element when closed
- AC-018-5: axe-core automated scan produces zero critical violations on the login page and the contacts list page
- AC-018-6: Form fields have associated `<label>` elements

**Priority:** Must-have

---

## 4. User Flows

---

### Flow 1: First Login

```
1. User navigates to http://localhost:4098
2. App detects no valid JWT → redirects to /login
3. User enters email and password
4. User clicks "Sign In"
   → Loading spinner appears
5a. Valid credentials:
   → JWT stored in localStorage
   → Redirected to / (contacts list)
   → Contacts list loads with pagination
5b. Invalid credentials:
   → Error message: "Invalid email or password"
   → Form remains open; user can retry
```

---

### Flow 2: Search and Find a Contact

```
1. User is on the contacts list (/)
2. User types "jones" into the search bar
   → After 300ms debounce, API call: GET /contacts?q=jones
   → Loading skeleton appears briefly
   → Results update: contacts matching "jones" in name/email/company
3. User sees "Alex Jones — TechRecruit Ltd — candidate, interviewed"
4. User clicks the row
   → Contact detail drawer/view opens
   → Full details: name, email, phone, company, notes, tags, dates
```

---

### Flow 3: Add a New Contact

```
1. User is on the contacts list
2. User clicks "+ Add Contact"
   → Contact form opens as a drawer/modal
3. User fills in:
   - Name: "Jordan Baker" (required)
   - Email: "jordan@example.com"
   - Company: "StartupCo"
   - Tags: selects "warm lead" and "candidate"
4. User clicks "Save"
   → POST /contacts request sent
   → On success: form closes, success toast: "Contact added"
   → New contact appears in the list
5. If Name is blank:
   → Form shows: "Name is required"
   → Request not sent
6. If email format is invalid:
   → Form shows: "Please enter a valid email address"
   → Request not sent
```

---

### Flow 4: Edit an Existing Contact and Update Tags

```
1. User finds a contact in the list (via search or browse)
2. User clicks the contact row
   → Edit drawer opens, pre-filled with current data
3. User changes Company from "OldCo" to "NewCo"
4. User removes tag "warm lead" and adds tag "placed"
5. User clicks "Save"
   → PUT /contacts/:id request sent
   → On success: form closes, success toast: "Contact updated"
   → Contact row updates in the list immediately
```

---

### Flow 5: Delete a Contact

```
1. User opens the edit drawer for a contact
2. User clicks "Delete Contact"
   → Confirmation dialog: "Are you sure you want to delete Jordan Baker?
      This cannot be undone."
3a. User clicks "Delete"
   → DELETE /contacts/:id request sent
   → Dialog closes, success toast: "Contact deleted"
   → Contact is removed from the list
3b. User clicks "Cancel"
   → Dialog closes, no changes made
```

---

### Flow 6: Import Contacts from CSV

```
1. User clicks "Import CSV" on the contacts list page
   → File picker opens (filter: .csv only)
2. User selects their spreadsheet export ("agency_contacts.csv")
3. File is submitted
   → Progress bar/spinner shown: "Importing contacts..."
4. Import completes:
   → Summary modal appears:
      "Import complete
       ✓ 2,987 contacts imported
       ⚠ 13 rows skipped
       Errors:
         Row 45: Missing name
         Row 112: Missing name
         ..."
5. User clicks "Done"
   → Modal closes
   → Contact list refreshes, now shows the imported contacts
```

---

### Flow 7: Export Contacts as CSV

```
1. User clicks "Export CSV" on the contacts list page
   → API call: GET /contacts/export
   → Browser downloads file: contacts.csv
2. User opens the file in Excel/Google Sheets
   → Columns: name, email, phone, company, tags
   → Tags column: "candidate,warm lead" (quoted, comma-separated)
```

---

### Flow 8: Create a Custom Tag

```
1. User opens the Add/Edit Contact form
2. User clicks in the Tags multi-select field
   → Dropdown shows existing tags: candidate, client, warm lead, placed, interviewed, ...
3. User types "senior developer" — no match found
4. User clicks "Create 'senior developer'"
   → POST /tags: { name: "senior developer" }
   → New tag created and immediately selected on the contact
5. User saves the contact
   → Tag is saved; "senior developer" now appears in all tag dropdowns and filter lists
```

---

## 5. Scope & Constraints

### In Scope

- JWT authentication for up to 5 pre-provisioned internal users
- Full CRUD operations on contacts (create, read, update, delete)
- Full-text search across name, email, and company fields
- Tag-based filtering (system tags + custom tags)
- Sortable contact list (by name, company, date created)
- Paginated contact list (25 per page, configurable up to 100)
- Contact detail view with notes and tag history
- CSV import: bulk ingest from spreadsheet (3,000+ rows), import summary with errors
- CSV export: full database download as CSV
- Custom tag creation with optional colour assignment
- Light/dark mode toggle with localStorage persistence
- Responsive UI: desktop table layout + mobile card layout
- Accessible UI: WCAG 2.1 AA, keyboard navigable, axe-core clean
- Docker Compose deployment: single `docker compose up` starts all three services (db, api, web)
- Seeded system tags and demo admin credentials on first boot
- README with setup instructions

### Explicitly Out of Scope

- **User registration / self-signup**: No public registration flow. All user accounts are created directly in the database. The app is for internal use only.
- **User management UI**: No admin panel to add, edit, or deactivate users via the web interface. User provisioning is done at the database level.
- **Role-based access control (RBAC)**: All authenticated users have equal access to all contacts and all operations. No read-only or admin tiers.
- **Email / calendar integration**: No sending emails from the app, no syncing with Gmail, Outlook, or calendar tools.
- **Activity log / audit trail**: No history of who edited a contact or when. The `updated_at` timestamp records the most recent modification, but not by whom.
- **File attachments on contacts**: No document upload (CVs, contracts, etc.) against individual contact records.
- **Duplicate detection**: No automatic detection of duplicate contact entries on import or manual add.
- **Advanced reporting / dashboards**: No charts, KPI views, or analytics screens.
- **Public-facing pages or API**: The application is internal only; no public API or web presence.
- **Multi-tenancy**: Single organisation only.
- **TLS / HTTPS in this delivery**: TLS termination is the responsibility of the hosting provider / Cloudflare proxy in any production deployment. Not included in Docker Compose dev setup.
- **Persistent JWT blacklist**: The logout token blacklist is in-memory for this delivery (acceptable for dev/demo). For a production deployment requiring persistent logout, a database-backed blacklist would be needed.
- **Hosted / cloud deployment**: This delivery is a Docker Compose package for self-hosted operation. Cloud deployment (Railway, Fly.io, VPS) is not included but the README will note the path.

### Budget & Timeline Constraints

| Constraint | Value |
|------------|-------|
| Budget | 2,000 EUR (fixed) |
| Build start | 2026-03-21 |
| Demo delivery | 2026-04-04 (14 calendar days) |
| Sprint 1 (Design + Backend) | 2026-03-21 → 2026-03-28 |
| Sprint 2 (Frontend + Testing + Deploy) | 2026-03-28 → 2026-04-04 |
| Team size | 4 roles: PM, Backend Dev, Frontend Dev, UX Designer |
| Scope flexibility | None — all 18 functional requirements are must-have. Out-of-scope features cannot be added without a budget/timeline revision. |

---

## 6. Acceptance Criteria (Project Level)

The following conditions define "done" from Sarah's perspective. The delivery email will not be sent until all of these are met and signed off by both the QA Engineer and Client Advocate.

---

### AC-P-001: Application Launches with a Single Command

**Condition:** Running `docker compose up` from the project root (with Docker and Docker Compose v2 installed) starts the full application stack — database, API, and web frontend — with no additional configuration steps.

**Test:** Clone/copy the delivery package to a clean machine, run `docker compose up`, navigate to `http://localhost:4098`. The application loads within 60 seconds of the command.

---

### AC-P-002: Pre-Seeded Login Works on First Boot

**Condition:** On a fresh `docker compose up` with no pre-existing data, the demo admin credentials documented in the README allow immediate login.

**Test:** Open `http://localhost:4098`, enter the demo credentials, click Sign In → lands on the contacts list.

---

### AC-P-003: Full Contact Lifecycle Works End-to-End

**Condition:** A user can create, view, edit, tag, and delete a contact entirely within the UI with no errors.

**Test:**
1. Log in → click "Add Contact"
2. Fill in all fields, assign two tags, save → contact appears in list
3. Click the contact → edit name and company, change one tag, save → changes are visible
4. Click the contact → click Delete → confirm → contact is gone from list

---

### AC-P-004: Search Returns Correct Results Under 200ms

**Condition:** Searching for a term that exists in the database returns matching contacts. Searching for a term that does not exist returns the empty state. Response time is under 200ms for a 10,000-contact database.

**Test:** (With seeded data) Type a known name → correct contact appears. Type a nonsense string → "No contacts found" empty state.

---

### AC-P-005: Tag Filter Works Correctly

**Condition:** Selecting a tag from the filter dropdown returns only contacts with that tag. Combining a tag filter with a search query narrows results correctly.

**Test:** Select "candidate" tag → only contacts tagged candidate are shown. Then type a name into search → only contacts matching both criteria are shown.

---

### AC-P-006: CSV Import Processes a 3,000-Row File Without Timeout

**Condition:** Uploading a valid 3,000-row CSV file imports all valid rows and returns a summary. The operation completes within 60 seconds.

**Test:** Upload the agency's existing spreadsheet (or a generated 3,000-row test file). Import summary shows imported count equal to total valid rows. No server error or timeout. Contacts appear in the list after import.

---

### AC-P-007: CSV Export Downloads a Valid File

**Condition:** Clicking "Export CSV" downloads a file containing all contacts with the correct columns and tag formatting.

**Test:** Click Export CSV → file `contacts.csv` downloads → open in a spreadsheet app → columns `name,email,phone,company,tags` are present → tags are correctly formatted as quoted comma-separated values.

---

### AC-P-008: Dark Mode Works and Persists

**Condition:** The dark mode toggle switches the UI theme. Refreshing the page retains the selected theme.

**Test:** Click dark mode toggle → UI goes dark (all backgrounds, text, forms). Refresh page → still dark. Click toggle again → light mode restored.

---

### AC-P-009: Application is Usable on Mobile (375px)

**Condition:** All core functions (login, browse contacts, add/edit contact, search, import/export) are fully usable on a 375px-wide viewport with no content cut off.

**Test:** Open Chrome DevTools, set device to 375px width. Navigate through login, contacts list, add contact form, CSV import — no horizontal scrollbar, no overlapping elements.

---

### AC-P-010: No Critical Accessibility Violations

**Condition:** axe-core finds zero critical violations on the login page and the contacts list page.

**Test:** Run axe-core on `/login` and `/` — zero critical violations in the report.

---

### AC-P-011: All Automated Tests Pass

**Condition:** The full test suite (backend + frontend) runs to completion with zero failures and ≥80% coverage on backend auth, contacts, tags, and CSV routes.

**Test:** `cd api && npm test` → all pass, coverage ≥80%. `cd web && npm test` → all pass.

---

### AC-P-012: README Enables Setup in Under 5 Minutes

**Condition:** A new team member who has never seen the project can follow the README and have the app running from scratch in under 5 minutes (excluding initial Docker image pull time).

**Test:** Follow only the README steps on a clean machine. App is accessible and logged-in within 5 minutes of starting.
