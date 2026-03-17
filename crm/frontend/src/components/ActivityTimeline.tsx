import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import type { Activity } from "../types";

const TYPE_ICONS: Record<string, string> = {
  call: "📞",
  email: "✉️",
  meeting: "🤝",
  note: "📝",
  task: "✅",
};

const TYPE_COLORS: Record<string, string> = {
  call: "#58a6ff",
  email: "#14b8a6",
  meeting: "#bc8cff",
  note: "#d29922",
  task: "#3fb950",
};

interface Props {
  contactId?: string;
  dealId?: string;
  companyId?: string;
}

export default function ActivityTimeline({ contactId, dealId, companyId }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    type: "note",
    subject: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (contactId) params.set("contact_id", contactId);
    if (dealId) params.set("deal_id", dealId);
    if (companyId) params.set("company_id", companyId);
    apiFetch<Activity[]>(`/api/v1/activities?${params}`)
      .then((data) => {
        const sorted = [...data].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setActivities(sorted);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [contactId, dealId, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addActivity(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, string | undefined> = {
        ...form,
        contact_id: contactId,
        deal_id: dealId,
        company_id: companyId,
      };
      // remove undefined
      Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);
      await apiFetch("/api/v1/activities", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setForm({ type: "note", subject: "", description: "" });
      setShowAdd(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  function relativeTime(date: string): string {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  }

  return (
    <div>
      {/* add button */}
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => setShowAdd((v) => !v)}
          style={{
            background: showAdd ? "transparent" : "rgba(20,184,166,0.15)",
            color: "#14b8a6",
            border: "1px solid rgba(20,184,166,0.3)",
            borderRadius: 6,
            padding: "7px 14px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {showAdd ? "Cancel" : "+ Log Activity"}
        </button>
      </div>

      {/* add form */}
      {showAdd && (
        <div
          style={{
            background: "#1c2128",
            border: "1px solid #30363d",
            borderRadius: 10,
            padding: 18,
            marginBottom: 20,
          }}
        >
          <form onSubmit={addActivity}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <label
                  style={{ display: "block", color: "#8b949e", fontSize: 11, marginBottom: 4 }}
                >
                  Type
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  style={{
                    width: "100%",
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "7px 10px",
                    color: "#e6edf3",
                    fontSize: 13,
                  }}
                >
                  {["note", "call", "email", "meeting", "task"].map((t) => (
                    <option key={t} value={t}>
                      {TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  style={{ display: "block", color: "#8b949e", fontSize: 11, marginBottom: 4 }}
                >
                  Subject *
                </label>
                <input
                  required
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
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
            </div>
            <div style={{ marginBottom: 14 }}>
              <label
                style={{ display: "block", color: "#8b949e", fontSize: 11, marginBottom: 4 }}
              >
                Description
              </label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
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
            <button
              type="submit"
              disabled={saving}
              style={{
                background: "#14b8a6",
                color: "#0d1117",
                border: "none",
                borderRadius: 6,
                padding: "8px 18px",
                fontWeight: 600,
                fontSize: 13,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : "Log"}
            </button>
          </form>
        </div>
      )}

      {error && (
        <div
          style={{
            background: "rgba(248,81,73,0.1)",
            border: "1px solid rgba(248,81,73,0.3)",
            borderRadius: 6,
            padding: 10,
            color: "#f85149",
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* timeline */}
      {loading ? (
        <div style={{ color: "#8b949e", padding: 20, textAlign: "center" }}>
          Loading…
        </div>
      ) : activities.length === 0 ? (
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
          No activities yet
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          {/* vertical line */}
          <div
            style={{
              position: "absolute",
              left: 15,
              top: 0,
              bottom: 0,
              width: 2,
              background: "#21262d",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {activities.map((a, idx) => {
              const color = TYPE_COLORS[a.type] ?? "#8b949e";
              return (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    gap: 16,
                    paddingBottom: idx < activities.length - 1 ? 20 : 0,
                    position: "relative",
                  }}
                >
                  {/* dot */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: `${color}20`,
                      border: `2px solid ${color}50`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      flexShrink: 0,
                      zIndex: 1,
                      marginTop: 2,
                    }}
                  >
                    {TYPE_ICONS[a.type] ?? "•"}
                  </div>
                  {/* content */}
                  <div
                    style={{
                      flex: 1,
                      background: "#1c2128",
                      border: "1px solid #30363d",
                      borderRadius: 8,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{ color: "#e6edf3", fontWeight: 500, fontSize: 14 }}
                      >
                        {a.subject}
                      </span>
                      <span style={{ color: "#484f58", fontSize: 11 }}>
                        {relativeTime(a.created_at)}
                      </span>
                    </div>
                    {a.description && (
                      <div style={{ color: "#8b949e", fontSize: 12 }}>
                        {a.description}
                      </div>
                    )}
                    <div style={{ marginTop: 6 }}>
                      <span
                        style={{
                          fontSize: 11,
                          color,
                          background: `${color}15`,
                          padding: "1px 7px",
                          borderRadius: 8,
                        }}
                      >
                        {a.type}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
