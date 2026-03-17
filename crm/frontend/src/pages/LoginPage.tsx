import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState("gigforge");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password, tenantSlug);
      navigate("/contacts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d1117",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 12,
          padding: 40,
          boxShadow: "0 0 40px rgba(20,184,166,0.1)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "linear-gradient(135deg, #14b8a6, #0d9488)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              margin: "0 auto 16px",
            }}
          >
            ⚡
          </div>
          <h1
            style={{
              color: "#e6edf3",
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            CRM Platform
          </h1>
          <p style={{ color: "#8b949e", fontSize: 14 }}>
            Sign in to your workspace
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                color: "#8b949e",
                fontSize: 12,
                marginBottom: 6,
                fontWeight: 500,
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                background: "#0d1117",
                border: "1px solid #30363d",
                color: "#e6edf3",
                borderRadius: 6,
                padding: "10px 12px",
                fontSize: 14,
                width: "100%",
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                color: "#8b949e",
                fontSize: 12,
                marginBottom: 6,
                fontWeight: 500,
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                background: "#0d1117",
                border: "1px solid #30363d",
                color: "#e6edf3",
                borderRadius: 6,
                padding: "10px 12px",
                fontSize: 14,
                width: "100%",
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: "block",
                color: "#8b949e",
                fontSize: 12,
                marginBottom: 6,
                fontWeight: 500,
              }}
            >
              Workspace (tenant slug)
            </label>
            <input
              type="text"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="gigforge"
              required
              style={{
                background: "#0d1117",
                border: "1px solid #30363d",
                color: "#e6edf3",
                borderRadius: 6,
                padding: "10px 12px",
                fontSize: 14,
                width: "100%",
                outline: "none",
              }}
            />
          </div>

          {error && (
            <div
              style={{
                background: "rgba(248,81,73,0.1)",
                border: "1px solid rgba(248,81,73,0.3)",
                borderRadius: 6,
                padding: "10px 12px",
                color: "#f85149",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              background: loading ? "#0d9488" : "#14b8a6",
              color: "#000",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
