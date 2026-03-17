import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import Layout from "../components/Layout";
import type { Contact, Tag, PaginatedResponse } from "../types";

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  lead: { bg: "rgba(88,166,255,0.15)", color: "#58a6ff" },
  prospect: { bg: "rgba(210,153,34,0.15)", color: "#d29922" },
  customer: { bg: "rgba(63,185,80,0.15)", color: "#3fb950" },
  churned: { bg: "rgba(248,81,73,0.15)", color: "#f85149" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_COLORS[status] || { bg: "#21262d", color: "#8b949e" };
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        background: style.bg,
        color: style.color,
      }}
    >
      {status}
    </span>
  );
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const [addError, setAddError] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const navigate = useNavigate();
  const perPage = 20;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch tags once
  useEffect(() => {
    apiFetch<Tag[]>("/tags").then(setTags).catch(() => {});
  }, []);

  const fetchContacts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (selectedTag) params.set("tag_id", selectedTag);

    apiFetch<PaginatedResponse<Contact>>(`/contacts?${params}`)
      .then((data) => {
        setContacts(data.items);
        setTotal(data.total);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, selectedTag]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Reset page on search/filter change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedTag]);

  const totalPages = Math.ceil(total / perPage);

  const handleAddContact = async () => {
    if (!addForm.first_name.trim() || !addForm.last_name.trim()) {
      setAddError("First name and last name are required.");
      return;
    }
    setAddSubmitting(true);
    setAddError("");
    try {
      await apiFetch("/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: addForm.first_name.trim(),
          last_name: addForm.last_name.trim(),
          ...(addForm.email.trim() && { email: addForm.email.trim() }),
          ...(addForm.phone.trim() && { phone: addForm.phone.trim() }),
        }),
      });
      setShowAddModal(false);
      setAddForm({ first_name: "", last_name: "", email: "", phone: "" });
      fetchContacts();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Failed to create contact");
    } finally {
      setAddSubmitting(false);
    }
  };

  return (
    <Layout title="Contacts">
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder="Search contacts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: "#161b22",
            border: "1px solid #30363d",
            color: "#e6edf3",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 14,
            width: 280,
            outline: "none",
          }}
        />
        <select
          value={selectedTag}
          onChange={(e) => setSelectedTag(e.target.value)}
          style={{
            background: "#161b22",
            border: "1px solid #30363d",
            color: selectedTag ? "#e6edf3" : "#8b949e",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 14,
            outline: "none",
          }}
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <span style={{ marginLeft: "auto", color: "#8b949e", fontSize: 13 }}>
          {total} contact{total !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => { setShowAddModal(true); setAddError(""); }}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: "#00bcd4",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Add Contact
        </button>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(248,81,73,0.1)",
            border: "1px solid rgba(248,81,73,0.3)",
            borderRadius: 6,
            padding: 12,
            color: "#f85149",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: "#1c2128",
          border: "1px solid #30363d",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div
            style={{ padding: 40, textAlign: "center", color: "#8b949e" }}
          >
            Loading…
          </div>
        ) : contacts.length === 0 ? (
          <div
            style={{ padding: 40, textAlign: "center", color: "#8b949e" }}
          >
            No contacts found
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#161b22" }}>
                {["Name", "Email", "Phone", "Status", "Tags", "Created"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        color: "#8b949e",
                        fontSize: 12,
                        fontWeight: 500,
                        borderBottom: "1px solid #30363d",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/contacts/${c.id}`)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      "#21262d";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      "transparent";
                  }}
                >
                  <td
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #21262d",
                      color: "#e6edf3",
                      fontWeight: 500,
                    }}
                  >
                    {c.first_name} {c.last_name}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #21262d",
                      color: "#8b949e",
                      fontSize: 13,
                    }}
                  >
                    {c.email || "—"}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #21262d",
                      color: "#8b949e",
                      fontSize: 13,
                    }}
                  >
                    {c.phone || "—"}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #21262d",
                    }}
                  >
                    <StatusBadge status={c.status} />
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #21262d",
                    }}
                  >
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {c.tags.map((t) => (
                        <span
                          key={t.id}
                          style={{
                            padding: "2px 8px",
                            borderRadius: 12,
                            fontSize: 11,
                            background: t.color
                              ? `${t.color}22`
                              : "#21262d",
                            color: t.color || "#8b949e",
                            border: `1px solid ${t.color || "#30363d"}`,
                          }}
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #21262d",
                      color: "#8b949e",
                      fontSize: 12,
                    }}
                  >
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            marginTop: 20,
          }}
        >
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #30363d",
              background: "#1c2128",
              color: page === 1 ? "#484f58" : "#e6edf3",
              cursor: page === 1 ? "not-allowed" : "pointer",
              fontSize: 13,
            }}
          >
            ← Prev
          </button>
          <span
            style={{
              padding: "6px 14px",
              color: "#8b949e",
              fontSize: 13,
            }}
          >
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #30363d",
              background: "#1c2128",
              color: page === totalPages ? "#484f58" : "#e6edf3",
              cursor: page === totalPages ? "not-allowed" : "pointer",
              fontSize: 13,
            }}
          >
            Next →
          </button>
        </div>
      )}
      {/* Add Contact Modal */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{
              background: "#1c2128",
              border: "1px solid #30363d",
              borderRadius: 10,
              padding: 24,
              width: 400,
              maxWidth: "90vw",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: "#e6edf3", fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
              Add Contact
            </h2>
            {addError && (
              <div
                style={{
                  background: "rgba(248,81,73,0.1)",
                  border: "1px solid rgba(248,81,73,0.3)",
                  borderRadius: 6,
                  padding: 10,
                  color: "#f85149",
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                {addError}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                type="text"
                placeholder="First name *"
                value={addForm.first_name}
                onChange={(e) => setAddForm({ ...addForm, first_name: e.target.value })}
                style={{
                  background: "#161b22",
                  border: "1px solid #30363d",
                  color: "#e6edf3",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <input
                type="text"
                placeholder="Last name *"
                value={addForm.last_name}
                onChange={(e) => setAddForm({ ...addForm, last_name: e.target.value })}
                style={{
                  background: "#161b22",
                  border: "1px solid #30363d",
                  color: "#e6edf3",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <input
                type="email"
                placeholder="Email"
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                style={{
                  background: "#161b22",
                  border: "1px solid #30363d",
                  color: "#e6edf3",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <input
                type="tel"
                placeholder="Phone"
                value={addForm.phone}
                onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                style={{
                  background: "#161b22",
                  border: "1px solid #30363d",
                  color: "#e6edf3",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "1px solid #30363d",
                    background: "transparent",
                    color: "#8b949e",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddContact}
                  disabled={addSubmitting}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "none",
                    background: addSubmitting ? "#1a7a83" : "#00bcd4",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: addSubmitting ? "not-allowed" : "pointer",
                  }}
                >
                  {addSubmitting ? "Creating…" : "Create Contact"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
