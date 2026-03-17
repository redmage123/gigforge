import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import Layout from "../components/Layout";
import type { Task } from "../types";

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: "rgba(248,81,73,0.12)", text: "#f85149" },
  medium: { bg: "rgba(210,153,34,0.12)", text: "#d29922" },
  low: { bg: "rgba(63,185,80,0.12)", text: "#3fb950" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: "rgba(88,166,255,0.12)", text: "#58a6ff" },
  in_progress: { bg: "rgba(188,140,255,0.12)", text: "#bc8cff" },
  done: { bg: "rgba(63,185,80,0.12)", text: "#3fb950" },
};

function PriorityBadge({ priority }: { priority: string }) {
  const c = PRIORITY_COLORS[priority] ?? { bg: "#21262d", text: "#8b949e" };
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.text,
        textTransform: "capitalize",
      }}
    >
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: "#21262d", text: "#8b949e" };
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.text,
        textTransform: "capitalize",
      }}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === "done") return false;
  return new Date(task.due_date) < new Date();
}

type FilterMode = "all" | "open" | "overdue" | "high" | "done";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterMode>("open");
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    due_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<Task[]>("/api/v1/tasks")
      .then(setTasks)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = tasks.filter((t) => {
    if (filter === "all") return true;
    if (filter === "open") return t.status !== "done";
    if (filter === "overdue") return isOverdue(t);
    if (filter === "high") return t.priority === "high";
    if (filter === "done") return t.status === "done";
    return true;
  });

  const counts = {
    all: tasks.length,
    open: tasks.filter((t) => t.status !== "done").length,
    overdue: tasks.filter(isOverdue).length,
    high: tasks.filter((t) => t.priority === "high").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await apiFetch<Task>("/api/v1/tasks", {
        method: "POST",
        body: JSON.stringify(newForm),
      });
      setTasks((prev) => [created, ...prev]);
      setShowNew(false);
      setNewForm({ title: "", description: "", priority: "medium", due_date: "" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(task: Task) {
    setUpdatingId(task.id);
    const newStatus = task.status === "done" ? "open" : "done";
    try {
      const updated = await apiFetch<Task>(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  async function updatePriority(task: Task, priority: string) {
    try {
      const updated = await apiFetch<Task>(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ priority }),
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch {
      // silent
    }
  }

  return (
    <Layout title="Tasks">
      {/* filter bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        {(
          [
            { key: "open", label: "Open" },
            { key: "overdue", label: "Overdue" },
            { key: "high", label: "High Priority" },
            { key: "all", label: "All" },
            { key: "done", label: "Done" },
          ] as { key: FilterMode; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              background: filter === key ? "rgba(20,184,166,0.15)" : "#1c2128",
              border: `1px solid ${filter === key ? "#14b8a6" : "#30363d"}`,
              borderRadius: 20,
              padding: "6px 14px",
              color: filter === key ? "#14b8a6" : "#8b949e",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: filter === key ? 600 : 400,
            }}
          >
            {label}
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                opacity: 0.8,
              }}
            >
              {counts[key]}
            </span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
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
          + New Task
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

      {/* task list */}
      <div
        style={{
          background: "#1c2128",
          border: "1px solid #30363d",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#8b949e" }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#8b949e" }}>
            No tasks in this filter
          </div>
        ) : (
          filtered.map((task, idx) => {
            const overdue = isOverdue(task);
            return (
              <div
                key={task.id}
                style={{
                  padding: "14px 18px",
                  borderBottom:
                    idx < filtered.length - 1 ? "1px solid #21262d" : "none",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  opacity: task.status === "done" ? 0.6 : 1,
                }}
              >
                {/* checkbox */}
                <button
                  onClick={() => toggleDone(task)}
                  disabled={updatingId === task.id}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    border: `2px solid ${task.status === "done" ? "#3fb950" : "#30363d"}`,
                    background:
                      task.status === "done" ? "rgba(63,185,80,0.2)" : "transparent",
                    cursor: "pointer",
                    flexShrink: 0,
                    marginTop: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    color: "#3fb950",
                  }}
                >
                  {task.status === "done" ? "✓" : ""}
                </button>

                {/* content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: task.status === "done" ? "#8b949e" : "#e6edf3",
                      fontWeight: 500,
                      fontSize: 14,
                      textDecoration:
                        task.status === "done" ? "line-through" : "none",
                      marginBottom: 4,
                    }}
                  >
                    {task.title}
                  </div>
                  {task.description && (
                    <div
                      style={{
                        color: "#8b949e",
                        fontSize: 12,
                        marginBottom: 6,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {task.description}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                    {task.due_date && (
                      <span
                        style={{
                          fontSize: 11,
                          color: overdue ? "#f85149" : "#8b949e",
                          fontWeight: overdue ? 600 : 400,
                        }}
                      >
                        {overdue ? "⚠ " : ""}Due{" "}
                        {new Date(task.due_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* priority picker */}
                <select
                  value={task.priority}
                  onChange={(e) => updatePriority(task, e.target.value)}
                  style={{
                    background: "#161b22",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "4px 8px",
                    color: "#8b949e",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            );
          })
        )}
      </div>

      {/* New Task Modal */}
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
              width: 460,
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
              New Task
            </h2>
            <form onSubmit={createTask}>
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{ display: "block", color: "#8b949e", fontSize: 12, marginBottom: 4 }}
                >
                  Title *
                </label>
                <input
                  required
                  value={newForm.title}
                  onChange={(e) =>
                    setNewForm((f) => ({ ...f, title: e.target.value }))
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
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{ display: "block", color: "#8b949e", fontSize: 12, marginBottom: 4 }}
                >
                  Description
                </label>
                <textarea
                  rows={3}
                  value={newForm.description}
                  onChange={(e) =>
                    setNewForm((f) => ({ ...f, description: e.target.value }))
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 20,
                }}
              >
                <div>
                  <label
                    style={{ display: "block", color: "#8b949e", fontSize: 12, marginBottom: 4 }}
                  >
                    Priority
                  </label>
                  <select
                    value={newForm.priority}
                    onChange={(e) =>
                      setNewForm((f) => ({ ...f, priority: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      background: "#0d1117",
                      border: "1px solid #30363d",
                      borderRadius: 6,
                      padding: "8px 10px",
                      color: "#e6edf3",
                      fontSize: 13,
                    }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label
                    style={{ display: "block", color: "#8b949e", fontSize: 12, marginBottom: 4 }}
                  >
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newForm.due_date}
                    onChange={(e) =>
                      setNewForm((f) => ({ ...f, due_date: e.target.value }))
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
                      colorScheme: "dark",
                    }}
                  />
                </div>
              </div>
              <div
                style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
              >
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
                  {saving ? "Saving…" : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
