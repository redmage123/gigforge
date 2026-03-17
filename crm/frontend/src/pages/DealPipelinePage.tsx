import React, { useEffect, useState, useCallback, type FormEvent } from "react";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { apiFetch } from "../api/client";
import Layout from "../components/Layout";
import ActivityTimeline from "../components/ActivityTimeline";
import type { Pipeline, Stage, Deal, Contact, Task, PaginatedResponse } from "../types";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function closeDateColor(iso?: string): string {
  if (!iso) return "#484f58";
  const days = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (days < 0) return "#f85149";   // past due
  if (days <= 7) return "#f85149";  // red — urgent
  if (days <= 30) return "#d29922"; // amber — approaching
  return "#3fb950";                 // green — comfortable
}

function ownerInitials(userId?: string): string {
  if (!userId) return "?";
  return userId.slice(0, 2).toUpperCase();
}

// ─── components ───────────────────────────────────────────────────────────────

function DealCard({
  deal,
  contactName,
  isDragging = false,
  onClick,
}: {
  deal: Deal;
  contactName?: string;
  isDragging?: boolean;
  onClick?: () => void;
}) {
  const closeColor = closeDateColor(deal.expected_close);

  return (
    <div
      onClick={onClick}
      style={{
        background: isDragging ? "#21262d" : "#1c2128",
        border: `1px solid ${isDragging ? "#14b8a6" : "#30363d"}`,
        borderRadius: 8,
        padding: 14,
        cursor: "pointer",
        opacity: isDragging ? 0.9 : 1,
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.4)" : "none",
        userSelect: "none",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!isDragging)
          (e.currentTarget as HTMLDivElement).style.borderColor = "#484f58";
      }}
      onMouseLeave={(e) => {
        if (!isDragging)
          (e.currentTarget as HTMLDivElement).style.borderColor = "#30363d";
      }}
    >
      {/* title */}
      <div
        style={{
          color: "#e6edf3",
          fontWeight: 500,
          fontSize: 13,
          marginBottom: 6,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {deal.title}
      </div>

      {/* contact name */}
      {contactName && (
        <div
          style={{
            color: "#8b949e",
            fontSize: 11,
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span>👤</span>
          <span>{contactName}</span>
        </div>
      )}

      {/* value row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: deal.expected_close || deal.assigned_to ? 8 : 0,
        }}
      >
        {deal.value != null ? (
          <span style={{ color: "#14b8a6", fontWeight: 700, fontSize: 14 }}>
            {formatCurrency(deal.value, deal.currency)}
          </span>
        ) : (
          <span style={{ color: "#484f58", fontSize: 12 }}>No value</span>
        )}
        <span
          style={{
            padding: "2px 6px",
            borderRadius: 8,
            fontSize: 11,
            background: "rgba(20,184,166,0.1)",
            color: "#14b8a6",
          }}
        >
          {deal.probability}%
        </span>
      </div>

      {/* close date + owner */}
      {(deal.expected_close || deal.assigned_to) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {deal.expected_close ? (
            <span style={{ fontSize: 11, color: closeColor }}>
              {closeColor === "#f85149" && new Date(deal.expected_close) < new Date()
                ? "⚠ Overdue"
                : `Due ${new Date(deal.expected_close).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}`}
            </span>
          ) : (
            <span />
          )}
          {deal.assigned_to && (
            <div
              title={deal.assigned_to}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "rgba(88,166,255,0.2)",
                border: "1px solid rgba(88,166,255,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 700,
                color: "#58a6ff",
                flexShrink: 0,
              }}
            >
              {ownerInitials(deal.assigned_to)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SortableDealCard({
  deal,
  contactName,
  onOpen,
}: {
  deal: Deal;
  contactName?: string;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <DealCard deal={deal} contactName={contactName} onClick={onOpen} />
    </div>
  );
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 200,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        borderRadius: 6,
        transition: "background 0.15s",
        background: isOver ? "rgba(20,184,166,0.04)" : "transparent",
        padding: 2,
      }}
    >
      {children}
    </div>
  );
}

// ─── Add Deal Modal ────────────────────────────────────────────────────────────

function AddDealModal({
  pipeline,
  initialStageId,
  contacts,
  onClose,
  onCreated,
}: {
  pipeline: Pipeline;
  initialStageId?: string;
  contacts: Contact[];
  onClose: () => void;
  onCreated: (deal: Deal) => void;
}) {
  const [title, setTitle] = useState("");
  const [stageId, setStageId] = useState(
    initialStageId || pipeline.stages[0]?.id || ""
  );
  const [contactId, setContactId] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [probability, setProbability] = useState(50);
  const [closeDate, setCloseDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const deal = await apiFetch<Deal>("/api/v1/deals", {
        method: "POST",
        body: JSON.stringify({
          title,
          pipeline_id: pipeline.id,
          stage_id: stageId,
          contact_id: contactId || undefined,
          value: value ? parseFloat(value) : undefined,
          currency,
          probability,
          expected_close: closeDate || undefined,
        }),
      });
      onCreated(deal);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "#0d1117",
    border: "1px solid #30363d",
    color: "#e6edf3",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 13,
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    color: "#8b949e",
    fontSize: 12,
    marginBottom: 4,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 12,
          padding: 28,
          width: 440,
          maxWidth: "90vw",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: "#e6edf3", fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
          New Deal
        </h3>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Deal title"
              style={inputStyle}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Stage</label>
            <select value={stageId} onChange={(e) => setStageId(e.target.value)} style={inputStyle}>
              {pipeline.stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {contacts.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Contact</label>
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={inputStyle}>
                <option value="">— None —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                    {c.email ? ` (${c.email})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Value</label>
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
                {["USD", "EUR", "GBP", "CAD", "AUD"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Expected Close Date</label>
            <input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              style={{ ...inputStyle, colorScheme: "dark" }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Probability: {probability}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={probability}
              onChange={(e) => setProbability(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#14b8a6" }}
            />
          </div>
          {error && (
            <div
              style={{
                background: "rgba(248,81,73,0.1)",
                border: "1px solid rgba(248,81,73,0.3)",
                borderRadius: 6,
                padding: 10,
                color: "#f85149",
                fontSize: 12,
                marginBottom: 14,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 6,
                border: "none",
                background: "#14b8a6",
                color: "#000",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              {loading ? "Creating…" : "Create Deal"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 16px",
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
      </div>
    </div>
  );
}

// ─── Deal Detail Side Panel ────────────────────────────────────────────────────

type PanelTab = "overview" | "activities" | "tasks" | "notes";

function DealDetailPanel({
  deal,
  pipeline,
  contactName,
  onClose,
  onUpdate,
}: {
  deal: Deal;
  pipeline: Pipeline;
  contactName?: string;
  onClose: () => void;
  onUpdate: (updated: Deal) => void;
}) {
  const [tab, setTab] = useState<PanelTab>("overview");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [noteText, setNoteText] = useState(deal.notes || "");
  const [savingNote, setSavingNote] = useState(false);

  // Load tasks when tasks tab opens
  useEffect(() => {
    if (tab !== "tasks") return;
    setTasksLoading(true);
    apiFetch<Task[]>(`/api/v1/tasks?deal_id=${deal.id}`)
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setTasksLoading(false));
  }, [tab, deal.id]);

  async function patchDeal(patch: Partial<Deal>) {
    setSaving(true);
    setError("");
    try {
      const updated = await apiFetch<Deal>(`/api/v1/deals/${deal.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function markWon() {
    await patchDeal({ status: "won" });
    onClose();
  }

  async function markLost() {
    await patchDeal({ status: "lost" });
    onClose();
  }

  async function saveNote() {
    setSavingNote(true);
    try {
      const updated = await apiFetch<Deal>(`/api/v1/deals/${deal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: noteText }),
      });
      onUpdate(updated);
    } catch {
      // silent — note still saved locally
    } finally {
      setSavingNote(false);
    }
  }

  const stage = pipeline.stages.find((s) => s.id === deal.stage_id);
  const closeColor = closeDateColor(deal.expected_close);

  const tabs: { key: PanelTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "activities", label: "Activities" },
    { key: "tasks", label: "Tasks" },
    { key: "notes", label: "Notes" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.3)",
          zIndex: 300,
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          maxWidth: "90vw",
          background: "#0d1117",
          borderLeft: "1px solid #30363d",
          zIndex: 400,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
          animation: "slideInRight 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid #21262d",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <h2
                style={{
                  color: "#e6edf3",
                  fontSize: 17,
                  fontWeight: 600,
                  marginBottom: 6,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {deal.title}
              </h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {stage && (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 8,
                      fontSize: 11,
                      background: `${stage.color || "#30363d"}22`,
                      color: stage.color || "#8b949e",
                      border: `1px solid ${stage.color || "#30363d"}44`,
                    }}
                  >
                    {stage.name}
                  </span>
                )}
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 8,
                    fontSize: 11,
                    background: deal.status === "won"
                      ? "rgba(63,185,80,0.12)"
                      : deal.status === "lost"
                      ? "rgba(248,81,73,0.12)"
                      : "rgba(88,166,255,0.12)",
                    color: deal.status === "won"
                      ? "#3fb950"
                      : deal.status === "lost"
                      ? "#f85149"
                      : "#58a6ff",
                  }}
                >
                  {deal.status}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#484f58",
                cursor: "pointer",
                fontSize: 20,
                lineHeight: 1,
                padding: 4,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>

          {/* Won / Lost actions */}
          {deal.status === "open" && (
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                onClick={markWon}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: 6,
                  border: "1px solid rgba(63,185,80,0.3)",
                  background: "rgba(63,185,80,0.1)",
                  color: "#3fb950",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                ✓ Mark Won
              </button>
              <button
                onClick={markLost}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: 6,
                  border: "1px solid rgba(248,81,73,0.3)",
                  background: "rgba(248,81,73,0.1)",
                  color: "#f85149",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                ✗ Mark Lost
              </button>
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 10px",
                background: "rgba(248,81,73,0.1)",
                border: "1px solid rgba(248,81,73,0.3)",
                borderRadius: 6,
                color: "#f85149",
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #21262d",
            flexShrink: 0,
            padding: "0 24px",
          }}
        >
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${tab === key ? "#14b8a6" : "transparent"}`,
                color: tab === key ? "#14b8a6" : "#8b949e",
                fontSize: 13,
                fontWeight: tab === key ? 600 : 400,
                padding: "10px 14px",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* OVERVIEW */}
          {tab === "overview" && (
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                {[
                  {
                    label: "Value",
                    value: deal.value != null
                      ? formatCurrency(deal.value, deal.currency)
                      : "—",
                    color: "#14b8a6",
                  },
                  {
                    label: "Probability",
                    value: `${deal.probability}%`,
                    color: "#58a6ff",
                  },
                  {
                    label: "Close Date",
                    value: deal.expected_close
                      ? new Date(deal.expected_close).toLocaleDateString()
                      : "—",
                    color: closeColor,
                  },
                  {
                    label: "Contact",
                    value: contactName || "—",
                    color: "#e6edf3",
                  },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    style={{
                      background: "#1c2128",
                      border: "1px solid #30363d",
                      borderRadius: 8,
                      padding: "12px 14px",
                    }}
                  >
                    <div style={{ color: "#8b949e", fontSize: 11, marginBottom: 4 }}>{label}</div>
                    <div style={{ color, fontWeight: 600, fontSize: 15 }}>{value}</div>
                  </div>
                ))}
              </div>

              {deal.assigned_to && (
                <div
                  style={{
                    background: "#1c2128",
                    border: "1px solid #30363d",
                    borderRadius: 8,
                    padding: "12px 14px",
                    marginBottom: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "rgba(88,166,255,0.15)",
                      border: "1px solid rgba(88,166,255,0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 12,
                      color: "#58a6ff",
                    }}
                  >
                    {ownerInitials(deal.assigned_to)}
                  </div>
                  <div>
                    <div style={{ color: "#8b949e", fontSize: 11 }}>Owner</div>
                    <div style={{ color: "#e6edf3", fontSize: 13 }}>{deal.assigned_to}</div>
                  </div>
                </div>
              )}

              <div
                style={{
                  background: "#1c2128",
                  border: "1px solid #30363d",
                  borderRadius: 8,
                  padding: "10px 14px",
                  display: "flex",
                  gap: 20,
                }}
              >
                <div>
                  <div style={{ color: "#8b949e", fontSize: 11 }}>Created</div>
                  <div style={{ color: "#e6edf3", fontSize: 12 }}>
                    {new Date(deal.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#8b949e", fontSize: 11 }}>Updated</div>
                  <div style={{ color: "#e6edf3", fontSize: 12 }}>
                    {new Date(deal.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ACTIVITIES */}
          {tab === "activities" && (
            <ActivityTimeline dealId={deal.id} />
          )}

          {/* TASKS */}
          {tab === "tasks" && (
            <div>
              {tasksLoading ? (
                <div style={{ color: "#8b949e", textAlign: "center", padding: 20 }}>
                  Loading…
                </div>
              ) : tasks.length === 0 ? (
                <div
                  style={{
                    background: "#1c2128",
                    border: "1px solid #30363d",
                    borderRadius: 8,
                    padding: 32,
                    textAlign: "center",
                    color: "#8b949e",
                    fontSize: 13,
                  }}
                >
                  No tasks linked to this deal
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        background: "#1c2128",
                        border: "1px solid #30363d",
                        borderRadius: 8,
                        padding: "12px 14px",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        opacity: t.status === "done" ? 0.6 : 1,
                      }}
                    >
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 3,
                          border: `2px solid ${t.status === "done" ? "#3fb950" : "#30363d"}`,
                          background: t.status === "done" ? "rgba(63,185,80,0.2)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          color: "#3fb950",
                          flexShrink: 0,
                        }}
                      >
                        {t.status === "done" ? "✓" : ""}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            color: "#e6edf3",
                            fontSize: 13,
                            textDecoration: t.status === "done" ? "line-through" : "none",
                          }}
                        >
                          {t.title}
                        </div>
                        {t.due_date && (
                          <div style={{ color: "#8b949e", fontSize: 11 }}>
                            Due {new Date(t.due_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: 8,
                          fontSize: 10,
                          background:
                            t.priority === "high"
                              ? "rgba(248,81,73,0.12)"
                              : t.priority === "medium"
                              ? "rgba(210,153,34,0.12)"
                              : "rgba(63,185,80,0.12)",
                          color:
                            t.priority === "high"
                              ? "#f85149"
                              : t.priority === "medium"
                              ? "#d29922"
                              : "#3fb950",
                        }}
                      >
                        {t.priority}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* NOTES */}
          {tab === "notes" && (
            <div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add notes about this deal…"
                rows={12}
                style={{
                  width: "100%",
                  background: "#1c2128",
                  border: "1px solid #30363d",
                  borderRadius: 8,
                  padding: "12px 14px",
                  color: "#e6edf3",
                  fontSize: 13,
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                  lineHeight: 1.6,
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={saveNote}
                disabled={savingNote}
                style={{
                  marginTop: 10,
                  padding: "8px 18px",
                  background: "#14b8a6",
                  color: "#000",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: savingNote ? "not-allowed" : "pointer",
                  opacity: savingNote ? 0.7 : 1,
                }}
              >
                {savingNote ? "Saving…" : "Save Notes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DealPipelinePage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [dealsByStage, setDealsByStage] = useState<Record<string, Deal[]>>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addForStage, setAddForStage] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadData = useCallback(() => {
    Promise.all([
      apiFetch<Pipeline[]>("/api/v1/pipelines"),
      apiFetch<{ items: Deal[] }>("/api/v1/deals"),
      apiFetch<PaginatedResponse<Contact>>("/api/v1/contacts?per_page=200").catch(() => ({
        items: [] as Contact[],
        total: 0,
        page: 1,
        per_page: 200,
      })),
    ])
      .then(([pipelinesData, dealsData, contactsData]) => {
        setPipelines(pipelinesData);
        const p = pipelinesData.find((pl) => pl.is_default) || pipelinesData[0];
        if (!p) return;
        setPipeline(p);

        const grouped: Record<string, Deal[]> = {};
        p.stages.forEach((s) => (grouped[s.id] = []));
        (dealsData.items || []).forEach((d) => {
          if (d.status !== "open") return; // won/lost deals off board
          if (grouped[d.stage_id]) grouped[d.stage_id].push(d);
          else grouped[d.stage_id] = [d];
        });
        setDealsByStage(grouped);
        setContacts(contactsData.items || []);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function switchPipeline(id: string) {
    const p = pipelines.find((pl) => pl.id === id);
    if (!p) return;
    setPipeline(p);
    apiFetch<{ items: Deal[] }>(`/api/v1/deals?pipeline_id=${id}`)
      .then((dealsData) => {
        const grouped: Record<string, Deal[]> = {};
        p.stages.forEach((s) => (grouped[s.id] = []));
        (dealsData.items || []).forEach((d) => {
          if (d.status !== "open") return;
          if (grouped[d.stage_id]) grouped[d.stage_id].push(d);
          else grouped[d.stage_id] = [d];
        });
        setDealsByStage(grouped);
      })
      .catch(() => {});
  }

  function contactName(contactId?: string): string | undefined {
    if (!contactId) return undefined;
    const c = contacts.find((x) => x.id === contactId);
    if (!c) return undefined;
    return `${c.first_name} ${c.last_name}`.trim();
  }

  function findStageForDeal(dealId: string): string | null {
    for (const [stageId, deals] of Object.entries(dealsByStage)) {
      if (deals.find((d) => d.id === dealId)) return stageId;
    }
    return null;
  }

  function findDeal(dealId: string): Deal | null {
    for (const deals of Object.values(dealsByStage)) {
      const d = deals.find((x) => x.id === dealId);
      if (d) return d;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const dealId = String(active.id);
    const overId = String(over.id);

    const fromStage = findStageForDeal(dealId);
    let toStage = pipeline?.stages.find((s) => s.id === overId)?.id;
    if (!toStage) toStage = findStageForDeal(overId) || undefined;
    if (!toStage || fromStage === toStage) return;

    // Snapshot for rollback
    const snapshot = JSON.parse(JSON.stringify(dealsByStage)) as Record<string, Deal[]>;

    // Optimistic update
    setDealsByStage((prev) => {
      const next = { ...prev };
      const deal = findDeal(dealId);
      if (!deal) return prev;
      next[fromStage!] = (next[fromStage!] || []).filter((d) => d.id !== dealId);
      next[toStage!] = [...(next[toStage!] || []), { ...deal, stage_id: toStage! }];
      return next;
    });

    // Also update selectedDeal if it's the one being moved
    setSelectedDeal((prev) =>
      prev?.id === dealId ? { ...prev, stage_id: toStage! } : prev
    );

    try {
      await apiFetch(`/api/v1/deals/${dealId}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage_id: toStage }),
      });
    } catch {
      setDealsByStage(snapshot); // revert
    }
  }

  function handleDealCreated(deal: Deal) {
    setDealsByStage((prev) => ({
      ...prev,
      [deal.stage_id]: [...(prev[deal.stage_id] || []), deal],
    }));
  }

  function handleDealUpdated(updated: Deal) {
    setDealsByStage((prev) => {
      const next: Record<string, Deal[]> = {};
      for (const [sid, deals] of Object.entries(prev)) {
        next[sid] = deals
          .filter((d) => !(d.id === updated.id && updated.status !== "open"))
          .map((d) => (d.id === updated.id ? updated : d));
      }
      return next;
    });
    setSelectedDeal(updated.status === "open" ? updated : null);
  }

  const activeDeal = activeId ? findDeal(activeId) : null;

  const totalPipelineValue = Object.values(dealsByStage)
    .flat()
    .reduce((sum, d) => sum + (d.value || 0), 0);

  return (
    <Layout title="Deal Pipeline">
      {loading && (
        <div style={{ color: "#8b949e", padding: 40, textAlign: "center" }}>
          Loading…
        </div>
      )}
      {error && (
        <div
          style={{
            background: "rgba(248,81,73,0.1)",
            border: "1px solid rgba(248,81,73,0.3)",
            borderRadius: 6,
            padding: 12,
            color: "#f85149",
            marginBottom: 20,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {pipeline && (
        <>
          {/* Toolbar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {pipelines.length > 1 ? (
                <select
                  value={pipeline.id}
                  onChange={(e) => switchPipeline(e.target.value)}
                  style={{
                    background: "#161b22",
                    border: "1px solid #30363d",
                    color: "#e6edf3",
                    borderRadius: 6,
                    padding: "7px 10px",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              ) : (
                <span style={{ color: "#e6edf3", fontWeight: 600, fontSize: 15 }}>
                  {pipeline.name}
                </span>
              )}
              {totalPipelineValue > 0 && (
                <span
                  style={{
                    color: "#8b949e",
                    fontSize: 13,
                    background: "#21262d",
                    padding: "4px 10px",
                    borderRadius: 8,
                  }}
                >
                  {formatCurrency(totalPipelineValue)} pipeline
                </span>
              )}
            </div>
          </div>

          {/* Board */}
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div
              style={{
                display: "flex",
                gap: 14,
                overflowX: "auto",
                paddingBottom: 16,
                alignItems: "flex-start",
              }}
            >
              {pipeline.stages
                .sort((a, b) => a.order - b.order)
                .map((stage: Stage) => {
                  const stageDeals = dealsByStage[stage.id] || [];
                  const totalValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);

                  return (
                    <div
                      key={stage.id}
                      style={{
                        minWidth: 268,
                        width: 268,
                        background: "#161b22",
                        border: "1px solid #30363d",
                        borderRadius: 10,
                        flexShrink: 0,
                      }}
                    >
                      {/* Column header */}
                      <div
                        style={{
                          padding: "12px 14px 10px",
                          borderBottom: "1px solid #30363d",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: totalValue > 0 ? 4 : 0,
                          }}
                        >
                          <div
                            style={{ display: "flex", alignItems: "center", gap: 8 }}
                          >
                            {stage.color && (
                              <div
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: stage.color,
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            <span
                              style={{
                                color: "#e6edf3",
                                fontWeight: 600,
                                fontSize: 13,
                              }}
                            >
                              {stage.name}
                            </span>
                            <span
                              style={{
                                background: "#21262d",
                                color: "#8b949e",
                                borderRadius: 10,
                                padding: "1px 7px",
                                fontSize: 11,
                              }}
                            >
                              {stageDeals.length}
                            </span>
                          </div>
                          <button
                            onClick={() => setAddForStage(stage.id)}
                            title="Add deal to this stage"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#484f58",
                              cursor: "pointer",
                              fontSize: 18,
                              lineHeight: 1,
                              padding: "0 2px",
                              borderRadius: 4,
                              transition: "color 0.1s",
                            }}
                            onMouseEnter={(e) =>
                              ((e.currentTarget as HTMLButtonElement).style.color = "#14b8a6")
                            }
                            onMouseLeave={(e) =>
                              ((e.currentTarget as HTMLButtonElement).style.color = "#484f58")
                            }
                          >
                            +
                          </button>
                        </div>
                        {totalValue > 0 && (
                          <div style={{ color: "#8b949e", fontSize: 11 }}>
                            {formatCurrency(totalValue)}
                          </div>
                        )}
                      </div>

                      {/* Droppable area */}
                      <div style={{ padding: 10 }}>
                        <SortableContext
                          id={stage.id}
                          items={stageDeals.map((d) => d.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <DroppableColumn id={stage.id}>
                            {stageDeals.map((deal) => (
                              <SortableDealCard
                                key={deal.id}
                                deal={deal}
                                contactName={contactName(deal.contact_id)}
                                onOpen={() => setSelectedDeal(deal)}
                              />
                            ))}
                            {stageDeals.length === 0 && (
                              <div
                                style={{
                                  border: "2px dashed #21262d",
                                  borderRadius: 8,
                                  padding: 20,
                                  textAlign: "center",
                                  color: "#484f58",
                                  fontSize: 12,
                                }}
                              >
                                Drop here
                              </div>
                            )}
                          </DroppableColumn>
                        </SortableContext>
                      </div>
                    </div>
                  );
                })}
            </div>

            <DragOverlay>
              {activeDeal && (
                <DealCard
                  deal={activeDeal}
                  contactName={contactName(activeDeal.contact_id)}
                  isDragging
                />
              )}
            </DragOverlay>
          </DndContext>
        </>
      )}

      {/* Add Deal Modal (per-column) */}
      {addForStage && pipeline && (
        <AddDealModal
          pipeline={pipeline}
          initialStageId={addForStage}
          contacts={contacts}
          onClose={() => setAddForStage(null)}
          onCreated={(deal) => {
            handleDealCreated(deal);
            setAddForStage(null);
          }}
        />
      )}

      {/* Deal Detail Side Panel */}
      {selectedDeal && pipeline && (
        <DealDetailPanel
          deal={selectedDeal}
          pipeline={pipeline}
          contactName={contactName(selectedDeal.contact_id)}
          onClose={() => setSelectedDeal(null)}
          onUpdate={handleDealUpdated}
        />
      )}
    </Layout>
  );
}
