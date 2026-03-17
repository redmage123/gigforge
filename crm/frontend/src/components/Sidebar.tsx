import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: "📊" },
  { path: "/contacts", label: "Contacts", icon: "👥" },
  { path: "/companies", label: "Companies", icon: "🏢" },
  { path: "/deals", label: "Deal Pipeline", icon: "💼" },
  { path: "/tasks", label: "Tasks", icon: "✅" },
  { path: "/import", label: "CSV Import", icon: "📥" },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <aside
      style={{
        width: collapsed ? 64 : 240,
        minHeight: "100vh",
        background: "#0f1117",
        borderRight: "1px solid #21262d",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "16px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid #21262d",
          minHeight: 60,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg, #14b8a6, #0d9488)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          ⚡
        </div>
        {!collapsed && (
          <span
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: "#e6edf3",
              whiteSpace: "nowrap",
            }}
          >
            GigForge CRM
          </span>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 8px" }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 6,
              textDecoration: "none",
              marginBottom: 2,
              background: isActive ? "rgba(20,184,166,0.15)" : "transparent",
              color: isActive ? "#14b8a6" : "#8b949e",
              fontSize: 14,
              fontWeight: isActive ? 500 : 400,
              transition: "background 0.15s, color 0.15s",
            })}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
            {!collapsed && (
              <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: user + logout + collapse toggle */}
      <div
        style={{
          padding: "12px 8px",
          borderTop: "1px solid #21262d",
        }}
      >
        {!collapsed && user && (
          <div
            style={{
              padding: "8px 12px",
              marginBottom: 8,
              color: "#8b949e",
              fontSize: 12,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {user.email}
          </div>
        )}
        <button
          onClick={handleLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: "#8b949e",
            cursor: "pointer",
            width: "100%",
            fontSize: 14,
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 18, flexShrink: 0 }}>🚪</span>
          {!collapsed && <span>Logout</span>}
        </button>
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #21262d",
            background: "transparent",
            color: "#8b949e",
            cursor: "pointer",
            width: "100%",
            fontSize: 12,
          }}
        >
          {collapsed ? "→" : "← Collapse"}
        </button>
      </div>
    </aside>
  );
}
