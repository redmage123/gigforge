import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import { apiFetch } from "../api/client";
import Layout from "../components/Layout";

const CONTACT_FIELDS = [
  { key: "first_name", label: "First Name", required: true },
  { key: "last_name", label: "Last Name", required: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "source", label: "Source" },
  { key: "status", label: "Status" },
  { key: "skip", label: "— Skip —" },
] as const;

type FieldKey = (typeof CONTACT_FIELDS)[number]["key"];

interface ParsedRow {
  [key: string]: string;
}

type ImportStatus = "idle" | "parsing" | "ready" | "importing" | "done";

export default function CsvImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [results, setResults] = useState<{
    success: number;
    failed: number;
    errors: string[];
  }>({ success: 0, failed: 0, errors: [] });
  const [dragOver, setDragOver] = useState(false);

  function autoMap(cols: string[]): Record<string, FieldKey> {
    const m: Record<string, FieldKey> = {};
    const patterns: Record<string, FieldKey> = {
      first: "first_name",
      "first name": "first_name",
      firstname: "first_name",
      fname: "first_name",
      last: "last_name",
      "last name": "last_name",
      lastname: "last_name",
      lname: "last_name",
      email: "email",
      "e-mail": "email",
      phone: "phone",
      mobile: "phone",
      tel: "phone",
      source: "source",
      status: "status",
    };
    cols.forEach((col) => {
      const key = patterns[col.toLowerCase().trim()] ?? "skip";
      m[col] = key;
    });
    return m;
  }

  function parseFile(file: File) {
    setStatus("parsing");
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const cols = result.meta.fields ?? [];
        setHeaders(cols);
        setRows(result.data.slice(0, 500)); // cap preview at 500
        setMapping(autoMap(cols));
        setStatus("ready");
      },
      error: () => {
        setStatus("idle");
      },
    });
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.endsWith(".csv")) return;
    parseFile(file);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, []); // eslint-disable-line

  async function runImport() {
    setStatus("importing");
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const body: Record<string, string> = {};
      for (const [col, field] of Object.entries(mapping)) {
        if (field !== "skip" && row[col]) {
          body[field] = row[col];
        }
      }
      if (!body.first_name && !body.last_name) {
        failed++;
        errors.push(`Row skipped: missing first/last name`);
        continue;
      }
      try {
        await apiFetch("/contacts", {
          method: "POST",
          body: JSON.stringify({ status: "lead", ...body }),
        });
        success++;
      } catch (e: unknown) {
        failed++;
        if (errors.length < 10) {
          errors.push(
            `${body.email ?? "?"}: ${e instanceof Error ? e.message : "failed"}`
          );
        }
      }
    }

    setResults({ success, failed, errors });
    setStatus("done");
  }

  function reset() {
    setStatus("idle");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResults({ success: 0, failed: 0, errors: [] });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Layout title="CSV Import">
      {/* step indicator */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 28,
          alignItems: "center",
        }}
      >
        {[
          { n: 1, label: "Upload", active: status === "idle" || status === "parsing" },
          { n: 2, label: "Map Columns", active: status === "ready" },
          { n: 3, label: "Import", active: status === "importing" || status === "done" },
        ].map(({ n, label, active }, i) => (
          <div key={n} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: active
                    ? "#14b8a6"
                    : status === "done" || (status === "ready" && n < 2) || (status === "importing" && n < 3)
                    ? "rgba(20,184,166,0.3)"
                    : "#21262d",
                  color: active ? "#0d1117" : "#8b949e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {n}
              </div>
              <span
                style={{
                  color: active ? "#e6edf3" : "#8b949e",
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {label}
              </span>
            </div>
            {i < 2 && (
              <div
                style={{
                  width: 40,
                  height: 1,
                  background: "#30363d",
                  margin: "0 12px",
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {(status === "idle" || status === "parsing") && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            background: dragOver ? "rgba(20,184,166,0.05)" : "#1c2128",
            border: `2px dashed ${dragOver ? "#14b8a6" : "#30363d"}`,
            borderRadius: 12,
            padding: "60px 40px",
            textAlign: "center",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>📄</div>
          <div
            style={{ color: "#e6edf3", fontSize: 16, fontWeight: 600, marginBottom: 8 }}
          >
            {status === "parsing" ? "Parsing…" : "Drop your CSV file here"}
          </div>
          <div style={{ color: "#8b949e", fontSize: 13, marginBottom: 20 }}>
            or click to browse · CSV files only · up to 500 rows previewed
          </div>
          <button
            style={{
              background: "#14b8a6",
              color: "#0d1117",
              border: "none",
              borderRadius: 6,
              padding: "10px 24px",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Choose File
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      )}

      {/* Step 2: Map columns */}
      {status === "ready" && (
        <>
          <div
            style={{
              background: "#1c2128",
              border: "1px solid #30363d",
              borderRadius: 10,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <h2
              style={{
                color: "#e6edf3",
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              Map CSV Columns → Contact Fields
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                gap: "10px 16px",
                alignItems: "center",
              }}
            >
              <div style={{ color: "#8b949e", fontSize: 11, fontWeight: 600 }}>
                CSV COLUMN
              </div>
              <div />
              <div style={{ color: "#8b949e", fontSize: 11, fontWeight: 600 }}>
                CONTACT FIELD
              </div>
              {headers.map((col) => (
                <>
                  <div
                    key={`col-${col}`}
                    style={{
                      background: "#0d1117",
                      border: "1px solid #30363d",
                      borderRadius: 6,
                      padding: "7px 12px",
                      color: "#e6edf3",
                      fontSize: 13,
                    }}
                  >
                    {col}
                  </div>
                  <div
                    key={`arrow-${col}`}
                    style={{ color: "#14b8a6", textAlign: "center" }}
                  >
                    →
                  </div>
                  <select
                    key={`sel-${col}`}
                    value={mapping[col] ?? "skip"}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        [col]: e.target.value as FieldKey,
                      }))
                    }
                    style={{
                      background: "#0d1117",
                      border: "1px solid #30363d",
                      borderRadius: 6,
                      padding: "7px 10px",
                      color:
                        mapping[col] === "skip" ? "#484f58" : "#e6edf3",
                      fontSize: 13,
                    }}
                  >
                    {CONTACT_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </>
              ))}
            </div>
          </div>

          {/* preview */}
          <div
            style={{
              background: "#1c2128",
              border: "1px solid #30363d",
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #21262d",
                color: "#8b949e",
                fontSize: 12,
              }}
            >
              Preview (first 5 rows of {rows.length} total)
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#161b22" }}>
                    {headers.map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 12px",
                          textAlign: "left",
                          color: "#8b949e",
                          fontSize: 11,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                        {mapping[h] !== "skip" && (
                          <span
                            style={{
                              marginLeft: 4,
                              color: "#14b8a6",
                              fontSize: 10,
                            }}
                          >
                            → {mapping[h]}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #21262d" }}>
                      {headers.map((h) => (
                        <td
                          key={h}
                          style={{
                            padding: "8px 12px",
                            color: "#e6edf3",
                            fontSize: 12,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row[h] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={reset}
              style={{
                background: "transparent",
                border: "1px solid #30363d",
                borderRadius: 6,
                padding: "10px 20px",
                color: "#8b949e",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              ← Back
            </button>
            <button
              onClick={runImport}
              style={{
                background: "#14b8a6",
                color: "#0d1117",
                border: "none",
                borderRadius: 6,
                padding: "10px 24px",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Import {rows.length} Contacts
            </button>
          </div>
        </>
      )}

      {/* Step 3: Importing */}
      {status === "importing" && (
        <div
          style={{
            background: "#1c2128",
            border: "1px solid #30363d",
            borderRadius: 10,
            padding: 60,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
          <div style={{ color: "#e6edf3", fontSize: 16, fontWeight: 600 }}>
            Importing contacts…
          </div>
          <div style={{ color: "#8b949e", fontSize: 13, marginTop: 8 }}>
            Please wait, do not close this page
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {status === "done" && (
        <div
          style={{
            background: "#1c2128",
            border: "1px solid #30363d",
            borderRadius: 10,
            padding: 32,
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>
              {results.failed === 0 ? "✅" : "⚠️"}
            </div>
            <div
              style={{ color: "#e6edf3", fontSize: 18, fontWeight: 700, marginBottom: 8 }}
            >
              Import Complete
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 24,
              maxWidth: 400,
              margin: "0 auto 24px",
            }}
          >
            <div
              style={{
                background: "rgba(63,185,80,0.1)",
                border: "1px solid rgba(63,185,80,0.3)",
                borderRadius: 8,
                padding: 20,
                textAlign: "center",
              }}
            >
              <div
                style={{ color: "#3fb950", fontSize: 32, fontWeight: 700 }}
              >
                {results.success}
              </div>
              <div style={{ color: "#8b949e", fontSize: 12, marginTop: 4 }}>
                Imported
              </div>
            </div>
            <div
              style={{
                background: results.failed > 0 ? "rgba(248,81,73,0.1)" : "#161b22",
                border: `1px solid ${results.failed > 0 ? "rgba(248,81,73,0.3)" : "#30363d"}`,
                borderRadius: 8,
                padding: 20,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  color: results.failed > 0 ? "#f85149" : "#8b949e",
                  fontSize: 32,
                  fontWeight: 700,
                }}
              >
                {results.failed}
              </div>
              <div style={{ color: "#8b949e", fontSize: 12, marginTop: 4 }}>
                Failed
              </div>
            </div>
          </div>
          {results.errors.length > 0 && (
            <div
              style={{
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: 8,
                padding: 14,
                marginBottom: 20,
                maxHeight: 160,
                overflowY: "auto",
              }}
            >
              {results.errors.map((e, i) => (
                <div
                  key={i}
                  style={{ color: "#f85149", fontSize: 12, marginBottom: 4 }}
                >
                  {e}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                background: "#14b8a6",
                color: "#0d1117",
                border: "none",
                borderRadius: 6,
                padding: "10px 24px",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Import Another File
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
