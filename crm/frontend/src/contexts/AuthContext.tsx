import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, setTokens, clearTokens, getToken } from "../api/client";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, tenantSlug: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("crm_user");
    return stored ? (JSON.parse(stored) as User) : null;
  });

  useEffect(() => {
    if (user) localStorage.setItem("crm_user", JSON.stringify(user));
    else localStorage.removeItem("crm_user");
  }, [user]);

  async function login(
    email: string,
    password: string,
    tenantSlug: string
  ): Promise<void> {
    const data = await apiFetch<{
      access_token: string;
      refresh_token: string;
      user: User;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, tenant_slug: tenantSlug }),
    });
    setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
  }

  function logout() {
    apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    clearTokens();
    setUser(null);
    localStorage.removeItem("crm_user");
  }

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user && !!getToken(), login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) navigate("/login", { replace: true });
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) return null;
  return <>{children}</>;
}
