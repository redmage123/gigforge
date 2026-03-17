import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import type { Activity } from "../types";

// Notes are stored as activities with type="note"
interface Props {
  contactId?: string;
  dealId?: string;
  companyId?: string;
}

export default function Notes({ contactId, dealId, companyId }: Props) {
  const [notes, setNotes] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (contactId) params.set("contact_id", contactId);
    if (dealId) params.set("deal_id", dealId);
    if (companyId) params.set("company_id", companyId);
    apiFetch<Activity[]>(`/api/v1/activities?${params}`)
      .then((data) => {
        const noteItems = data
          .filter((a) => a.type === "note")
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        setNotes(noteItems);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [contactId, dealId, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, string | undefined> = {
        type: "note",
        subject: text.slice(0, 80),
        description: text.length > 80 ? text : undefined,
        contact_id: contactId,
        deal_id: dealId,
        company_id: companyId,
      };
      Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);
      await apiFetch("/api/v1/activities", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setText("");
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
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

      {/* Add note */}
      <form
        onSubmit={addNote}
        style={{
          background: "#1c2128",
          border: "1px solid #30363d",
          borderRadius: 10,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <textarea
          rows={3}
          placeholder="Write a note…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{
            width: "100%",
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 6,
            padding: "10px 12px",
            color: "#e6edf3",
            fontSize: 13,
            resize: "vertical",
            boxSizing: "border-box",
            marginBottom: 10,
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={saving || !text.trim()}
            style={{
              background: text.trim() ? "#14b8a6" : "#21262d",
              color: text.trim() ? "#0d1117" : "#484f58",
              border: "none",
              borderRadius: 6,
              padding: "8px 18px",
              fontWeight: 600,
              fontSize: 13,
              cursor: saving || !text.trim() ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Add Note"}
          </button>
        </div>
      </form>

      {/* notes list */}
      {loading ? (
        <div style={{ color: "#8b949e", padding: 20, textAlign: "center" }}>
          Loading…
        </div>
      ) : notes.length === 0 ? (
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
          No notes yet
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {notes.map((note) => (
            <div
              key={note.id}
              style={{
                background: "#1c2128",
                border: "1px solid #30363d",
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div style={{ color: "#e6edf3", fontSize: 14, marginBottom: 6 }}>
                {note.subject}
              </div>
              {note.description && note.description !== note.subject && (
                <div
                  style={{
                    color: "#8b949e",
                    fontSize: 13,
                    whiteSpace: "pre-wrap",
                    marginBottom: 8,
                  }}
                >
                  {note.description}
                </div>
              )}
              <div style={{ color: "#484f58", fontSize: 11 }}>
                📝 {new Date(note.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
