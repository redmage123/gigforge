import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  LabelList,
  Cell,
} from "recharts";
import { apiFetch } from "../api/client";
import Layout from "../components/Layout";
import type { KPIData } from "../types";

const CHART_COLORS = [
  "#14b8a6",
  "#58a6ff",
  "#3fb950",
  "#d29922",
  "#bc8cff",
  "#f78166",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: 12,
      }}
    >
      <div style={{ color: "#8b949e", marginBottom: 4 }}>{label}</div>
      {payload.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => (
          <div key={p.name} style={{ color: p.color }}>
            {p.name === "value"
              ? new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  notation: "compact",
                }).format(p.value)
              : p.value}
          </div>
        )
      )}
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function KPICard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: "#1c2128",
        border: "1px solid #30363d",
        borderRadius: 10,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: `${color}22`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
        }}
      >
        {icon}
      </div>
      <div style={{ color: "#8b949e", fontSize: 13 }}>{label}</div>
      <div style={{ color: "#e6edf3", fontSize: 26, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<KPIData>("/api/v1/dashboard/kpis")
      .then(setKpis)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout title="Dashboard">
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
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}
      {kpis && (
        <>
          {/* KPI Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 16,
              marginBottom: 32,
            }}
          >
            <KPICard
              icon="💼"
              label="Total Deals"
              value={String(kpis.total_deals)}
              color="#14b8a6"
            />
            <KPICard
              icon="💰"
              label="Pipeline Value"
              value={formatCurrency(kpis.pipeline_value)}
              color="#58a6ff"
            />
            <KPICard
              icon="🏆"
              label="Won Value"
              value={formatCurrency(kpis.won_value)}
              color="#3fb950"
            />
            <KPICard
              icon="📈"
              label="Conversion Rate"
              value={`${(kpis.conversion_rate * 100).toFixed(1)}%`}
              color="#d29922"
            />
            <KPICard
              icon="⚖️"
              label="Weighted Pipeline"
              value={formatCurrency(kpis.weighted_pipeline_value)}
              color="#bc8cff"
            />
            <KPICard
              icon="📊"
              label="Avg Deal Size"
              value={formatCurrency(kpis.avg_deal_size)}
              color="#f78166"
            />
            <KPICard
              icon="✅"
              label="Open Tasks"
              value={String(kpis.open_tasks_count)}
              color="#58a6ff"
            />
            <KPICard
              icon="👤"
              label="New Contacts This Week"
              value={String(kpis.contacts_added_this_week)}
              color="#3fb950"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
            }}
          >
            {/* Bar chart: Pipeline value by stage */}
            <div
              style={{
                background: "#1c2128",
                border: "1px solid #30363d",
                borderRadius: 10,
                padding: 20,
              }}
            >
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#e6edf3",
                  marginBottom: 16,
                }}
              >
                Pipeline Value by Stage
              </h2>
              {kpis.deals_by_stage.length === 0 ? (
                <p style={{ color: "#8b949e", fontSize: 13 }}>No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={kpis.deals_by_stage}
                    margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                  >
                    <XAxis
                      dataKey="stage_name"
                      tick={{ fill: "#8b949e", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#8b949e", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        new Intl.NumberFormat("en-US", {
                          notation: "compact",
                          style: "currency",
                          currency: "USD",
                        }).format(v)
                      }
                      width={56}
                    />
                    <Tooltip
                      content={<CustomTooltip />}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {kpis.deals_by_stage.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Funnel chart: Deal count by stage */}
            <div
              style={{
                background: "#1c2128",
                border: "1px solid #30363d",
                borderRadius: 10,
                padding: 20,
              }}
            >
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#e6edf3",
                  marginBottom: 16,
                }}
              >
                Pipeline Funnel
              </h2>
              {kpis.deals_by_stage.length === 0 ? (
                <p style={{ color: "#8b949e", fontSize: 13 }}>No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <FunnelChart>
                    <Tooltip content={<CustomTooltip />} />
                    <Funnel
                      dataKey="count"
                      data={kpis.deals_by_stage.map((s, i) => ({
                        ...s,
                        fill: CHART_COLORS[i % CHART_COLORS.length],
                      }))}
                      isAnimationActive
                    >
                      <LabelList
                        position="right"
                        fill="#8b949e"
                        stroke="none"
                        dataKey="stage_name"
                        style={{ fontSize: 11 }}
                      />
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Recent Activities */}
            <div
              style={{
                background: "#1c2128",
                border: "1px solid #30363d",
                borderRadius: 10,
                padding: 20,
              }}
            >
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#e6edf3",
                  marginBottom: 16,
                }}
              >
                Recent Activity
              </h2>
              {kpis.recent_activities.length === 0 ? (
                <p style={{ color: "#8b949e", fontSize: 13 }}>
                  No recent activity
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {kpis.recent_activities.slice(0, 10).map((a) => (
                    <div
                      key={a.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: "rgba(20,184,166,0.15)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {a.type === "call"
                          ? "📞"
                          : a.type === "email"
                          ? "✉️"
                          : a.type === "meeting"
                          ? "🤝"
                          : "📝"}
                      </div>
                      <div>
                        <div style={{ color: "#e6edf3", fontSize: 13 }}>
                          {a.subject}
                        </div>
                        <div style={{ color: "#8b949e", fontSize: 11 }}>
                          {new Date(a.created_at).toLocaleDateString()} ·{" "}
                          {a.type}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
