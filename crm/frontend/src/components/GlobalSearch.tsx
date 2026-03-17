import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import type { Contact, Company, Deal, PaginatedResponse } from "../types";

interface SearchResult {
  type: "contact" | "company" | "deal";
  id: string;
  label: string;
  sub: string;
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const [contacts, companies, deals] = await Promise.all([
        apiFetch<PaginatedResponse<Contact>>(
          `/api/v1/contacts?search=${encodeURIComponent(q)}&per_page=5`
        ).catch(() => ({ items: [] as Contact[] })),
        apiFetch<PaginatedResponse<Company>>(
          `/api/v1/companies?search=${encodeURIComponent(q)}&per_page=5`
        ).catch(() => ({ items: [] as Company[] })),
        apiFetch<Deal[]>(`/api/v1/deals?search=${encodeURIComponent(q)}`).catch(
          () => [] as Deal[]
        ),
      ]);

      const res: SearchResult[] = [
        ...contacts.items.slice(0, 4).map((c) => ({
          type: "contact" as const,
          id: c.id,
          label: `${c.first_name} ${c.last_name}`,
          sub: c.email ?? c.phone ?? c.status,
        })),
        ...companies.items.slice(0, 4).map((c) => ({
          type: "company" as const,
          id: c.id,
          label: c.name,
          sub: c.domain ?? c.industry ?? "Company",
        })),
        ...(Array.isArray(deals) ? deals.slice(0, 3) : []).map((d) => ({
          type: "deal" as const,
          id: d.id,
          label: d.title,
          sub: `${d.status} · ${d.value ? `$${d.value.toLocaleString()}` : "No value"}`,
        })),
      ];
      setResults(res);
      setSelected(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => search(query), 250);
  }, [query, search]);

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && results[selected]) {
      navigate(resultPath(results[selected]));
      setOpen(false);
      setQuery("");
    }
  }

  function resultPath(r: SearchResult): string {
    if (r.type === "contact") return `/contacts/${r.id}`;
    if (r.type === "company") return `/companies/${r.id}`;
    return `/deals`;
  }

  const TYPE_ICONS = { contact: "👤", company: "🏢", deal: "💼" };
  const TYPE_LABELS = { contact: "Contact", company: "Company", deal: "Deal" };

  return (
    <div ref={containerRef} style={{ position: "relative", flex: 1, maxWidth: 400 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "#161b22",
          border: `1px solid ${open ? "#14b8a6" : "#30363d"}`,
          borderRadius: 8,
          padding: "0 12px",
          gap: 8,
          transition: "border-color 0.15s",
        }}
      >
        <span style={{ color: "#484f58", fontSize: 14 }}>🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search contacts, companies, deals… (⌘K)"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#e6edf3",
            fontSize: 13,
            padding: "8px 0",
          }}
        />
        {loading && (
          <span style={{ color: "#484f58", fontSize: 11 }}>…</span>
        )}
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); }}
            style={{
              background: "transparent",
              border: "none",
              color: "#484f58",
              cursor: "pointer",
              fontSize: 14,
              padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* dropdown */}
      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "#1c2128",
            border: "1px solid #30363d",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            zIndex: 9999,
            overflow: "hidden",
          }}
        >
          {results.map((r, i) => (
            <div
              key={`${r.type}-${r.id}`}
              onClick={() => {
                navigate(resultPath(r));
                setOpen(false);
                setQuery("");
              }}
              onMouseEnter={() => setSelected(i)}
              style={{
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                background: i === selected ? "rgba(20,184,166,0.08)" : "transparent",
                borderBottom:
                  i < results.length - 1 ? "1px solid #21262d" : "none",
              }}
            >
              <span style={{ fontSize: 16 }}>{TYPE_ICONS[r.type]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: "#e6edf3",
                    fontSize: 13,
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.label}
                </div>
                <div
                  style={{
                    color: "#8b949e",
                    fontSize: 11,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.sub}
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: "#484f58",
                  background: "#21262d",
                  padding: "2px 6px",
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              >
                {TYPE_LABELS[r.type]}
              </span>
            </div>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "#1c2128",
            border: "1px solid #30363d",
            borderRadius: 8,
            padding: "16px",
            textAlign: "center",
            color: "#8b949e",
            fontSize: 13,
            zIndex: 9999,
          }}
        >
          No results for "{query}"
        </div>
      )}
    </div>
  );
}
