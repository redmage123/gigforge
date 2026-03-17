import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import Layout from "../components/Layout";
import ActivityTimeline from "../components/ActivityTimeline";
import Notes from "../components/Notes";
import type { Company, Contact, Deal, PaginatedResponse } from "../types";

const TABS = ["Overview", "Contacts", "Deals", "Activity", "Notes"] as const;
type Tab = (typeof TABS)[number];

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tab, setTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Company>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiFetch<Company>(`/companies/${id}`),
      apiFetch<PaginatedResponse<Contact>>(`/companies/${id}/contacts?per_page=100`),
      apiFetch<Deal[]>(`/api/v1/deals?company_id=${id}`).catch(() => [] as Deal[]),
    ])
      .then(([c, cx, dx]) => {
        setCompany(c);
        setForm(c);
        setContacts(cx.items ?? []);
        setDeals(Array.isArray(dx) ? dx : []);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await apiFetch<Company>(`/companies/${id}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setCompany(updated);
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <Layout title="Company">
        <div style={{ color: "#8b949e", padding: 40, textAlign: "center" }}>
          Loading…
        </div>
      </Layout>
    );

  if (!company)
    return (
      <Layout title="Company">
        <div style={{ color: "#f85149", padding: 40 }}>
          {error || "Company not found"}
        </div>
      </Layout>
    );

  return (
    <Layout title={company.name}>
      {/* breadcrumb */}
      <div style={{ marginBottom: 16, fontSize: 13, color: "#8b949e" }}>
        <span
          onClick={() => navigate("/companies")}
          style={{ cursor: "pointer", color: "#14b8a6" }}
        >
          Companies
        </span>{" "}
        / {company.name}
      </div>

      {error && (
        <div
          style={{
            background: "rgba(248,81,73,0.1)",
            border: "1px solid rgba(248,81,73,0.3)",
            borderRadius: 6,
            padding: 10,
            color: "#f85149",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* header card */}
      <div
        style={{
          background: "#1c2128",
          border: "1px solid #30363d",
          borderRadius: 10,
          padding: 24,
          marginBottom: 20,
          display: "flex",
          gap: 20,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            background: "rgba(20,184,166,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 700,
            color: "#14b8a6",
            flexShrink: 0,
          }}
        >
          {company.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <h1 style={{ color: "#e6edf3", fontSize: 20, fontWeight: 700, margin: 0 }}>
              {company.name}
            </h1>
            {company.industry && (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 10,
                  fontSize: 11,
                  background: "rgba(20,184,166,0.1)",
                  color: "#14b8a6",
                  border: "1px solid rgba(20,184,166,0.3)",
                }}
              >
                {company.industry}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {company.domain && (
              <span style={{ color: "#8b949e", fontSize: 13 }}>🌐 {company.domain}</span>
            )}
            {company.size && (
              <span style={{ color: "#8b949e", fontSize: 13 }}>👥 {company.size}</span>
            )}
            {company.address && (
              <span style={{ color: "#8b949e", fontSize: 13 }}>📍 {company.address}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => (editing ? save() : setEditing(true))}
          disabled={saving}
          style={{
            background: editing ? "#14b8a6" : "transparent",
            color: editing ? "#0d1117" : "#8b949e",
            border: "1px solid " + (editing ? "#14b8a6" : "#30363d"),
            borderRadius: 6,
            padding: "7px 14px",
            fontSize: 13,
            cursor: saving ? "not-allowed" : "pointer",
            fontWeight: editing ? 600 : 400,
          }}
        >
          {saving ? "Saving…" : editing ? "Save" : "Edit"}
        </button>
        {editing && (
          <button
            onClick={() => { setEditing(false); setForm(company); }}
            style={{
              background: "transparent",
              color: "#8b949e",
              border: "1px solid #30363d",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {/* edit form */}
      {editing && (
        <div
          style={{
            background: "#1c2128",
            border: "1px solid #30363d",
            borderRadius: 10,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            {[
              { label: "Name", key: "name" },
              { label: "Domain", key: "domain" },
              { label: "Industry", key: "industry" },
              { label: "Size", key: "size" },
              { label: "Address", key: "address" },
            ].map(({ label, key }) => (
              <div key={key}>
                <label
                  style={{ display: "block", color: "#8b949e", fontSize: 11, marginBottom: 4 }}
                >
                  {label}
                </label>
                <input
                  value={(form[key as keyof Company] as string) ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "7px 10px",
                    color: "#e6edf3",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ))}
            <div style={{ gridColumn: "1 / -1" }}>
              <label
                style={{ display: "block", color: "#8b949e", fontSize: 11, marginBottom: 4 }}
              >
                Notes
              </label>
              <textarea
                rows={3}
                value={(form.notes as string) ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                style={{
                  width: "100%",
                  background: "#0d1117",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  padding: "7px 10px",
                  color: "#e6edf3",
                  fontSize: 13,
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid #21262d",
          marginBottom: 20,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: tab === t ? "2px solid #14b8a6" : "2px solid transparent",
              color: tab === t ? "#14b8a6" : "#8b949e",
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: tab === t ? 600 : 400,
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {t}
            {t === "Contacts" && contacts.length > 0 && (
              <span
                style={{
                  marginLeft: 6,
                  background: "rgba(20,184,166,0.15)",
                  color: "#14b8a6",
                  borderRadius: 10,
                  padding: "0 6px",
                  fontSize: 11,
                }}
              >
                {contacts.length}
              </span>
            )}
            {t === "Deals" && deals.length > 0 && (
              <span
                style={{
                  marginLeft: 6,
                  background: "rgba(20,184,166,0.15)",
                  color: "#14b8a6",
                  borderRadius: 10,
                  padding: "0 6px",
                  fontSize: 11,
                }}
              >
                {deals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* tab content */}
      {tab === "Overview" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}
        >
          {[
            { label: "Name", value: company.name },
            { label: "Domain", value: company.domain },
            { label: "Industry", value: company.industry },
            { label: "Size", value: company.size },
            { label: "Address", value: company.address },
            {
              label: "Created",
              value: new Date(company.created_at).toLocaleString(),
            },
            {
              label: "Updated",
              value: new Date(company.updated_at).toLocaleString(),
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: "#1c2128",
                border: "1px solid #30363d",
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div style={{ color: "#8b949e", fontSize: 11, marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ color: "#e6edf3", fontSize: 14 }}>{value ?? "—"}</div>
            </div>
          ))}
          {company.notes && (
            <div
              style={{
                gridColumn: "1 / -1",
                background: "#1c2128",
                border: "1px solid #30363d",
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div style={{ color: "#8b949e", fontSize: 11, marginBottom: 6 }}>Notes</div>
              <div style={{ color: "#e6edf3", fontSize: 13, whiteSpace: "pre-wrap" }}>
                {company.notes}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "Contacts" && (
        <div
          style={{
            background: "#1c2128",
            border: "1px solid #30363d",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {contacts.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#8b949e" }}>
              No contacts linked to this company
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#161b22" }}>
                  {["Name", "Email", "Phone", "Status"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        color: "#8b949e",
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: "uppercase",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/contacts/${c.id}`)}
                    style={{
                      cursor: "pointer",
                      borderBottom: "1px solid #21262d",
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "#161b22")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "")
                    }
                  >
                    <td style={{ padding: "10px 16px", color: "#e6edf3", fontSize: 13 }}>
                      {c.first_name} {c.last_name}
                    </td>
                    <td style={{ padding: "10px 16px", color: "#8b949e", fontSize: 13 }}>
                      {c.email ?? "—"}
                    </td>
                    <td style={{ padding: "10px 16px", color: "#8b949e", fontSize: 13 }}>
                      {c.phone ?? "—"}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 10,
                          fontSize: 11,
                          background: "rgba(20,184,166,0.1)",
                          color: "#14b8a6",
                        }}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "Deals" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {deals.length === 0 ? (
            <div
              style={{
                background: "#1c2128",
                border: "1px solid #30363d",
                borderRadius: 10,
                padding: 40,
                textAlign: "center",
                color: "#8b949e",
              }}
            >
              No deals linked to this company
            </div>
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
                  <div style={{ color: "#e6edf3", fontWeight: 500, fontSize: 14 }}>
                    {d.title}
                  </div>
                  <div style={{ color: "#8b949e", fontSize: 12, marginTop: 4 }}>
                    {d.status} · {d.probability}% probability
                  </div>
                </div>
                {d.value != null && (
                  <span style={{ color: "#14b8a6", fontWeight: 700, fontSize: 16 }}>
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: d.currency || "USD",
                    }).format(d.value)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "Activity" && (
        <ActivityTimeline companyId={id} />
      )}

      {tab === "Notes" && (
        <Notes companyId={id} />
      )}
    </Layout>
  );
}
