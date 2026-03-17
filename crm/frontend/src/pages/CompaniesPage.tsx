import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import Layout from "../components/Layout";
import type { Company, PaginatedResponse } from "../types";

const INDUSTRY_COLORS: Record<string, string> = {
  technology: "#58a6ff",
  finance: "#3fb950",
  healthcare: "#d29922",
  retail: "#bc8cff",
  manufacturing: "#14b8a6",
  education: "#f78166",
};

function industryColor(ind?: string) {
  return ind ? (INDUSTRY_COLORS[ind.toLowerCase()] ?? "#8b949e") : "#8b949e";
}

function CompanyRow({
  company,
  onClick,
}: {
  company: Company;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      style={{
        cursor: "pointer",
        borderBottom: "1px solid #21262d",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLTableRowElement).style.background = "#161b22")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLTableRowElement).style.background = "")
      }
    >
      <td style={{ padding: "12px 16px", color: "#e6edf3", fontWeight: 500 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "rgba(20,184,166,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 13,
              color: "#14b8a6",
              flexShrink: 0,
            }}
          >
            {company.name.charAt(0).toUpperCase()}
          </div>
          {company.name}
        </div>
      </td>
      <td style={{ padding: "12px 16px", color: "#8b949e", fontSize: 13 }}>
        {company.domain ?? "—"}
      </td>
      <td style={{ padding: "12px 16px" }}>
        {company.industry ? (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 500,
              background: `${industryColor(company.industry)}22`,
              color: industryColor(company.industry),
              border: `1px solid ${industryColor(company.industry)}44`,
            }}
          >
            {company.industry}
          </span>
        ) : (
          <span style={{ color: "#484f58", fontSize: 12 }}>—</span>
        )}
      </td>
      <td style={{ padding: "12px 16px", color: "#8b949e", fontSize: 13 }}>
        {company.size ?? "—"}
      </td>
      <td style={{ padding: "12px 16px", color: "#8b949e", fontSize: 12 }}>
        {new Date(company.created_at).toLocaleDateString()}
      </td>
    </tr>
  );
}

export default function CompaniesPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({
    name: "",
    domain: "",
    industry: "",
    size: "",
    address: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const PER_PAGE = 20;

  const load = useCallback(
    (q: string, pg: number) => {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(pg),
        per_page: String(PER_PAGE),
      });
      if (q) params.set("search", q);
      apiFetch<PaginatedResponse<Company>>(`/api/v1/companies?${params}`)
        .then((r) => {
          setCompanies(r.items);
          setTotal(r.total);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    load(search, page);
  }, [load, search, page]);

  function handleSearch(val: string) {
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 300);
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await apiFetch<Company>("/api/v1/companies", {
        method: "POST",
        body: JSON.stringify(newForm),
      });
      setShowNew(false);
      setNewForm({ name: "", domain: "", industry: "", size: "", address: "", notes: "" });
      navigate(`/companies/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <Layout title="Companies">
      {/* toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <input
          type="text"
          placeholder="Search companies…"
          onChange={(e) => handleSearch(e.target.value)}
          style={{
            flex: 1,
            maxWidth: 340,
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 6,
            padding: "8px 12px",
            color: "#e6edf3",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          onClick={() => setShowNew(true)}
          style={{
            background: "#14b8a6",
            color: "#0d1117",
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          + New Company
        </button>
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

      {/* table */}
      <div
        style={{
          background: "#1c2128",
          border: "1px solid #30363d",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#161b22" }}>
              {["Company", "Domain", "Industry", "Size", "Created"].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      color: "#8b949e",
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: "#8b949e",
                  }}
                >
                  Loading…
                </td>
              </tr>
            ) : companies.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: "#8b949e",
                  }}
                >
                  No companies found
                </td>
              </tr>
            ) : (
              companies.map((c) => (
                <CompanyRow
                  key={c.id}
                  company={c}
                  onClick={() => navigate(`/companies/${c.id}`)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            marginTop: 20,
          }}
        >
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            style={{
              background: "#21262d",
              border: "1px solid #30363d",
              borderRadius: 6,
              padding: "6px 14px",
              color: page === 1 ? "#484f58" : "#e6edf3",
              cursor: page === 1 ? "not-allowed" : "pointer",
              fontSize: 13,
            }}
          >
            ← Prev
          </button>
          <span style={{ color: "#8b949e", fontSize: 13 }}>
            {page} / {totalPages} · {total} total
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={{
              background: "#21262d",
              border: "1px solid #30363d",
              borderRadius: 6,
              padding: "6px 14px",
              color: page === totalPages ? "#484f58" : "#e6edf3",
              cursor: page === totalPages ? "not-allowed" : "pointer",
              fontSize: 13,
            }}
          >
            Next →
          </button>
        </div>
      )}

      {/* New Company Modal */}
      {showNew && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => e.target === e.currentTarget && setShowNew(false)}
        >
          <div
            style={{
              background: "#1c2128",
              border: "1px solid #30363d",
              borderRadius: 12,
              padding: 28,
              width: 480,
              maxWidth: "90vw",
            }}
          >
            <h2
              style={{
                color: "#e6edf3",
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              New Company
            </h2>
            <form onSubmit={createCompany}>
              {[
                { label: "Name *", key: "name", required: true },
                { label: "Domain", key: "domain" },
                { label: "Industry", key: "industry" },
                { label: "Size", key: "size" },
                { label: "Address", key: "address" },
              ].map(({ label, key, required }) => (
                <div key={key} style={{ marginBottom: 14 }}>
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
                    required={required}
                    value={newForm[key as keyof typeof newForm]}
                    onChange={(e) =>
                      setNewForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      background: "#0d1117",
                      border: "1px solid #30363d",
                      borderRadius: 6,
                      padding: "8px 10px",
                      color: "#e6edf3",
                      fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    color: "#8b949e",
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  Notes
                </label>
                <textarea
                  rows={3}
                  value={newForm.notes}
                  onChange={(e) =>
                    setNewForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "8px 10px",
                    color: "#e6edf3",
                    fontSize: 13,
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  style={{
                    background: "transparent",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "8px 16px",
                    color: "#8b949e",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: "#14b8a6",
                    color: "#0d1117",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 16px",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Saving…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
