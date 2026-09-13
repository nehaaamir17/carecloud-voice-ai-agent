"use client";
import { useState, useEffect } from "react";
import {
  AudioLines,
  ArrowUpRight,
  LockKeyhole,
  RefreshCw,
  Users,
  Activity,
  BadgeCheck,
  Database,
  MessageCircleMore,
  ShieldCheck,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { CallHistory } from "@/components/call-history";
import { AgentCard } from "@/components/agent-card";
import { RegistryTools } from "@/components/webmcp";
import { ThemePicker } from "@/components/theme-picker";
import { OperationsInsights } from "@/components/operations-insights";
type Patient = Record<string, string | null>;
export default function Home() {
  const [revision, setRevision] = useState(0);
  const [patients, setPatients] = useState<Patient[]>([]),
    [locked, setLocked] = useState(true),
    [key, setKey] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Patient | null>(null),
    [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  async function refresh({ silent = false }: { silent?: boolean } = {}) {
    if (!silent) setBusy(true);
    setError("");
    try {
      const r = await fetch(
        "/patients" +
          (search ? "?last_name=" + encodeURIComponent(search) : ""),
      );
      const j = (await r.json()) as {
        data: Patient[];
        error?: { message: string };
      };
      if (!r.ok) {
        if (r.status === 401) {
          setLocked(true);
          setPatients([]);
          setError("");
          return;
        }
        throw Error(j.error?.message || "Unable to load records");
      }
      setPatients(j.data);
      setLocked(false);
      setLastUpdated(new Date());
      setRevision((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (!silent) setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (locked) return;
    const timer = window.setInterval(() => {
      void refresh({ silent: true });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [locked, search]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!r.ok) throw Error("The access key was not accepted.");
      setKey("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <img src="/carecloud-logo.png" alt="" width="40" height="40" />
          </span>
          CareCloud <span>Intake</span>
        </a>
        <span className="demo-label">
          ASSESSMENT DEMO · SYNTHETIC DATA ONLY
        </span>
        <div className="topbar-actions">
          <ThemePicker />
          <a className="text-link" href="/docs">
            API reference <ArrowUpRight size={16} />
          </a>
        </div>
      </header>
      <main className="content">
        <div className="page-heading">
          <div>
            <div className="eyebrow">VOICE OPERATIONS</div>
            <h1>Patient registration</h1>
            <p>
              Patient registration, from the first hello to a confirmed record.
            </p>
          </div>
          <AgentCard />
        </div>
        <div className="metrics">
          <div>
            <span>
              <Users size={18} />
              Patient records
            </span>
            <strong>{locked ? "—" : patients.length}</strong>
            <small>Persisted in the patient registry</small>
          </div>
          <div>
            <span>
              <AudioLines size={18} />
              Intake workflow
            </span>
            <strong>Confirm → save</strong>
            <small>Caller approval before every voice write</small>
          </div>
          <div>
            <span>
              <Activity size={18} />
              Record lifecycle
            </span>
            <strong>Always retained</strong>
            <small>Soft deletion preserves the original record</small>
          </div>
        </div>
        <section className="workflow" aria-labelledby="workflow-title">
          <div className="workflow-copy">
            <div className="eyebrow">CONFIRMATION-FIRST DESIGN</div>
            <h2 id="workflow-title">One safe path from call to record</h2>
            <p>Every registration moves through the same auditable sequence.</p>
          </div>
          <ol className="workflow-steps">
            {[
              {
                icon: MessageCircleMore,
                label: "Talk",
                detail: "Natural intake",
              },
              {
                icon: ShieldCheck,
                label: "Validate",
                detail: "Field checks",
              },
              {
                icon: BadgeCheck,
                label: "Confirm",
                detail: "Full read-back",
              },
              {
                icon: Database,
                label: "Persist",
                detail: "Atomic save",
              },
            ].map(({ icon: Icon, label, detail }, index) => (
              <li key={label}>
                <span className="step-number">0{index + 1}</span>
                <span className="step-icon">
                  <Icon size={19} />
                </span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </li>
            ))}
          </ol>
        </section>
        <section className="registry">
          <div className="section-heading">
            <div>
              <h2>Patient registry</h2>
              <p>Confirmed demographic records in one place.</p>
            </div>
            {!locked && (
              <>
                <span className="refresh-status" aria-live="polite">
                  Live · updates every 15s
                  {lastUpdated
                    ? ` · ${lastUpdated.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : ""}
                </span>
                <button
                  className="logout"
                  onClick={async () => {
                    await fetch("/api/session", { method: "DELETE" });
                    setLocked(true);
                    setPatients([]);
                    setSelected(null);
                  }}
                >
                  Lock workspace
                </button>
              </>
            )}
            <button
              className="secondary"
              onClick={() => void refresh()}
              disabled={busy}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
          {locked ? (
            <form className="access-panel" onSubmit={login}>
              <LockKeyhole />
              <div>
                <h3>Open your workspace</h3>
                <p>Enter the reviewer access key to view patient records.</p>
              </div>
              <input
                aria-label="Reviewer access key"
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Reviewer access key"
                required
                autoComplete="current-password"
              />
              <button className="primary" disabled={busy}>
                Unlock registry
              </button>
            </form>
          ) : (
            <form
              className="search-bar"
              onSubmit={(e) => {
                e.preventDefault();
                void refresh();
              }}
            >
              <input
                aria-label="Search by last name"
                placeholder="Search by last name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="secondary" disabled={busy}>
                Search
              </button>
            </form>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "Patient",
                  "Date of birth",
                  "Phone number",
                  "Location",
                  "Registered",
                  "",
                ].map((t, i) => (
                  <TableHead key={i}>{t}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow key={p.patient_id}>
                  <TableCell>
                    <button
                      className="patient-link"
                      onClick={() => setSelected(p)}
                    >
                      <span className="avatar">
                        {p.first_name?.[0]}
                        {p.last_name?.[0]}
                      </span>
                      <span>
                        {p.first_name} {p.last_name}
                        <small>{p.preferred_language}</small>
                      </span>
                    </button>
                  </TableCell>
                  <TableCell>{p.date_of_birth}</TableCell>
                  <TableCell>{p.phone_number}</TableCell>
                  <TableCell>
                    {p.city}, {p.state}
                  </TableCell>
                  <TableCell>
                    {p.created_at
                      ? new Date(p.created_at).toLocaleDateString("en-US")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <button
                      className="icon-button"
                      aria-label={`View ${p.first_name} ${p.last_name}`}
                      onClick={() => setSelected(p)}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!patients.length && (
            <div className="empty-state">
              <span className="empty-icon">
                <Users size={28} />
              </span>
              <h3>
                {locked
                  ? "Your patient registry is protected"
                  : "Ready for the first conversation"}
              </h3>
              <p>
                {locked
                  ? "Unlock the workspace to see registrations and their details."
                  : "Completed registrations appear here after the caller confirms their information."}
              </p>
            </div>
          )}
          <footer className="registry-footer">
            <span>
              {locked ? "Access required" : `${patients.length} records shown`}
            </span>
            <span>All timestamps stored in UTC</span>
          </footer>
        </section>
        {!locked && (
          <>
            <OperationsInsights patients={patients} />
            <CallHistory revision={revision} />
            <RegistryTools onResults={setPatients} />
          </>
        )}
        <footer className="page-footer">
          <span>CareCloud Intake · AI Engineer assessment</span>
          <span>Voice → validation → confirmation → persistence</span>
        </footer>
      </main>
      <Sheet
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <SheetContent className="detail-sheet">
          <SheetHeader>
            <SheetTitle>
              {selected?.first_name} {selected?.last_name}
            </SheetTitle>
            <SheetDescription>Patient demographic record</SheetDescription>
          </SheetHeader>
          <dl className="detail-list">
            {selected &&
              Object.entries(selected).map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replaceAll("_", " ")}</dt>
                  <dd>{v || "Not provided"}</dd>
                </div>
              ))}
          </dl>
        </SheetContent>
      </Sheet>
    </>
  );
}
