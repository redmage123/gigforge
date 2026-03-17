import { useEffect, useState, type FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import Layout from "../components/Layout";
import type { Contact, Activity, Deal, Tag } from "../types";

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  lead: { bg: "rgba(88,166,255,0.15)", color: "#58a6ff" },
  prospect: { bg: "rgba(210,153,34,0.15)", color: "#d29922" },
  customer: { bg: "rgba(63,185,80,0.15)", color: "#3fb950" },
  churned: { bg: "rgba(248,81,73,0.15)", color: "#f85149" },
};

type Tab = "activities" | "deals" | "notes";

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("activities");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Contact>>({});

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiFetch<Contact>(`/contacts/${id}`),
      apiFetch<Tag[]>("/tags"),
    ])
      .then(([c, tags]) => {
        setContact(c);
        setEditForm({
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email,
          phone: c.phone,
          status: c.status,
        });
        setAllTags(tags);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (activeTab === "activities") {
      apiFetch<{ items: Activity[] }>(`/api/v1/activities?contact_id=${id}`)
        .then((d) => setActivities(d.items || []))
        .catch(() => {});
    } else if (activeTab === "deals") {
      apiFetch<{ items: Deal[] }>(`/api/v1/deals?contact_id=${id}`)
        .then((d) => setDeals(d.items || []))
        .catch(() => {});
    }
  }, [id, activeTab]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    try {
      const updated = await apiFetch<Contact>(`/contacts/${id}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      });
      setContact(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function removeTag(tagId: string) {
    if (!id) return;
    await apiFetch(`/contacts/${id}/tags/${tagId}`, { method: "DELETE" });
    setContact((c) =>
      c ? { ...c, tags: c.tags.filter((t) => t.id !== tagId) } : c
    );
  }

  async function addTag(tagId: string) {
    if (!id) return;
    await apiFetch(`/contacts/${id}/tags`, {
      method: "POST",
      body: JSON.stringify({ tag_ids: [tagId] }),
    });
    const tag = allTags.find((t) => t.id === tagId);
    if (tag) {
      setContact((c) => (c ? { ...c, tags: [...c.tags, tag] } : c));
    }
  }

  if (loading)
    return (
      <Layout title="Contact">
        <div style={{ color: "#8b949e", padding: 40, textAlign: "center" }}>
          Loading…
        </div>
      </Layout>
    );

  if (error || !contact)
    return (
      <Layout title="Contact">
        <div style={{ color: "#f85149", padding: 20 }}>
          {error || "Contact not found"}
        </div>
      </Layout>
    );

  const statusStyle =
    STATUS_COLORS[contact.status] || { bg: "#21262d", color: "#8b949e" };
  const assignedTagIds = new Set(contact.tags.map((t) => t.id));

  return (
    <Layout title="Contact Detail">
      {/* Back */}
      <button
        onClick={() => navigate("/contacts")}
        style={{
          background: "none",
          border: "none",
          color: "#8b949e",
          cursor: "pointer",
          fontSize: 13,
          padding: 0,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        ← Back to Contacts
      </button>

      {/* Header Card */}
      <div
        style={{
          background: "#1c2128",
          border: "1px solid #30363d",
          borderRadius: 10,
          padding: 24,
          marginBottom: 20,
        }}
      >
        {editing ? (
          <form onSubmit={handleSave}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 16,
              }}
            >
              {(
                [
                  ["first_name", "First Name", "text"],
                  ["last_name", "Last Name", "text"],
                  ["email", "Email", "email"],
                  ["phone", "Phone", "text"],
                ] as const
              ).map(([field, label, type]) => (
                <div key={field}>
                  <label
                    style={{
                      display: "block",
                      color: "#8b949e",
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    {label}
                  </label>
                  <input
                    type={type}
                    value={(editForm[field] as string) || ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, [field]: e.target.value }))
                    }
                    style={{
                      background: "#0d1117",
                      border: "1px solid #30363d",
                      color: "#e6edf3",
                      borderRadius: 6,
                      padding: "8px 10px",
                      fontSize: 13,
                      width: "100%",
                      outline: "none",
                    }}
                  />
                </div>
              ))}
              <div>
                <label
                  style={{
                    display: "block",
                    color: "#8b949e",
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  Status
                </label>
                <select
                  value={editForm.status || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, status: e.target.value }))
                  }
                  style={{
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    color: "#e6edf3",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 13,
                    width: "100%",
                    outline: "none",
                  }}
                >
                  {["lead", "prospect", "customer", "churned"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="submit"
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "#14b8a6",
                  color: "#000",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "1px solid #30363d",
                  background: "#1c2128",
                  color: "#e6edf3",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #14b8a6, #0d9488)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#000",
                  }}
                >
                  {contact.first_name[0]}
                </div>
                <div>
                  <h2
                    style={{
                      color: "#e6edf3",
                      fontSize: 20,
                      fontWeight: 700,
                      margin: 0,
                    }}
                  >
                    {contact.first_name} {contact.last_name}
                  </h2>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      marginTop: 4,
                      fontSize: 13,
                      color: "#8b949e",
                    }}
                  >
                    {contact.email && <span>✉️ {contact.email}</span>}
                    {contact.phone && <span>📞 {contact.phone}</span>}
                    <span
                      style={{
                        padding: "1px 8px",
                        borderRadius: 12,
                        fontSize: 12,
                        background: statusStyle.bg,
                        color: statusStyle.color,
                        fontWeight: 500,
                      }}
                    >
                      {contact.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginTop: 14,
                  alignItems: "center",
                }}
              >
                {contact.tags.map((t) => (
                  <span
                    key={t.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 8px",
                      borderRadius: 12,
                      fontSize: 12,
                      background: t.color ? `${t.color}22` : "#21262d",
                      color: t.color || "#8b949e",
                      border: `1px solid ${t.color || "#30363d"}`,
                    }}
                  >
                    {t.name}
                    <button
                      onClick={() => removeTag(t.id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "inherit",
                        padding: 0,
                        lineHeight: 1,
                        fontSize: 11,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {/* Add tag dropdown */}
                {allTags.filter((t) => !assignedTagIds.has(t.id)).length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) addTag(e.target.value);
                    }}
                    style={{
                      background: "#161b22",
                      border: "1px dashed #30363d",
                      color: "#8b949e",
                      borderRadius: 12,
                      padding: "2px 8px",
                      fontSize: 12,
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    <option value="">+ Add tag</option>
                    {allTags
                      .filter((t) => !assignedTagIds.has(t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            </div>

            <button
              onClick={() => setEditing(true)}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #30363d",
                background: "#1c2128",
                color: "#e6edf3",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              ✏️ Edit
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid #30363d",
          marginBottom: 20,
        }}
      >
        {(["activities", "deals", "notes"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 20px",
              border: "none",
              borderBottom: `2px solid ${activeTab === tab ? "#14b8a6" : "transparent"}`,
              background: "transparent",
              color: activeTab === tab ? "#14b8a6" : "#8b949e",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: activeTab === tab ? 500 : 400,
              textTransform: "capitalize",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "activities" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activities.length === 0 ? (
            <div style={{ color: "#8b949e", fontSize: 13 }}>
              No activities yet
            </div>
          ) : (
            activities.map((a) => (
              <div
                key={a.id}
                style={{
                  background: "#1c2128",
                  border: "1px solid #30363d",
                  borderRadius: 8,
                  padding: 16,
                  display: "flex",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "rgba(20,184,166,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {a.type === "call"
                    ? "📞"
                    : a.type === "email"
                    ? "✉️"
                    : a.type === "meeting"
                    ? "🤝"
                    : "📝"}
                </div>
                <div>
                  <div
                    style={{
                      color: "#e6edf3",
                      fontWeight: 500,
                      fontSize: 14,
                    }}
                  >
                    {a.subject}
                  </div>
                  {a.description && (
                    <div
                      style={{
                        color: "#8b949e",
                        fontSize: 13,
                        marginTop: 4,
                      }}
                    >
                      {a.description}
                    </div>
                  )}
                  <div
                    style={{
                      color: "#484f58",
                      fontSize: 11,
                      marginTop: 6,
                    }}
                  >
                    {a.type} ·{" "}
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "deals" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {deals.length === 0 ? (
            <div style={{ color: "#8b949e", fontSize: 13 }}>No deals yet</div>
          ) : (
            deals.map((d) => (
              <div
                key={d.id}
                style={{
                  background: "#1c2128",
                  border: "1px solid #30363d",
                  borderRadius: 8,
                  padding: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "#e6edf3",
                      fontWeight: 500,
                      fontSize: 14,
                    }}
                  >
                    {d.title}
                  </div>
                  <div
                    style={{ color: "#8b949e", fontSize: 12, marginTop: 4 }}
                  >
                    {d.status} · {d.probability}% probability
                  </div>
                </div>
                {d.value != null && (
                  <div
                    style={{
                      color: "#14b8a6",
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: d.currency || "USD",
                    }).format(d.value)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "notes" && (
        <div
          style={{
            background: "#1c2128",
            border: "1px solid #30363d",
            borderRadius: 8,
            padding: 20,
            color: "#8b949e",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          {contact.custom_fields && "notes" in contact.custom_fields
            ? String(contact.custom_fields.notes)
            : "No notes for this contact."}
        </div>
      )}
    </Layout>
  );
}
