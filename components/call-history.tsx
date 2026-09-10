"use client";
import { useEffect, useState } from "react";
import { Phone, ArrowUpRight, CalendarDays } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
type Call = {
  call_id: string;
  patient_id: string | null;
  status: string;
  summary: string | null;
  transcript: string | null;
  ended_reason: string | null;
  created_at: string;
};
type Appointment = {
  appointment_id: string;
  first_name: string;
  last_name: string;
  slot: string;
};
export function CallHistory({ revision }: { revision: number }) {
  const [calls, setCalls] = useState<Call[]>([]),
    [appointments, setAppointments] = useState<Appointment[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Call | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [c, a] = await Promise.all([
          fetch("/api/calls"),
          fetch("/api/appointments"),
        ]);
        if (!c.ok || !a.ok)
          throw Error("Unable to load call history. Refresh to try again.");
        const cj = (await c.json()) as { data: Call[] },
          aj = (await a.json()) as { data: Appointment[] };
        if (active) {
          setCalls(cj.data);
          setAppointments(aj.data);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [revision]);
  return (
    <section className="registry history">
      <Tabs defaultValue="calls">
        <div className="section-heading">
          <div>
            <h2>Conversation history</h2>
            <p>Follow each intake through to its outcome.</p>
          </div>
          <TabsList>
            <TabsTrigger value="calls">
              <Phone size={15} />
              Calls
            </TabsTrigger>
            <TabsTrigger value="appointments">
              <CalendarDays size={15} />
              Demo bookings
            </TabsTrigger>
          </TabsList>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <TabsContent value="calls">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Call</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Transcript</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((c) => (
                <TableRow key={c.call_id}>
                  <TableCell>
                    <span className="mono">{c.call_id.slice(0, 12)}</span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`status-pill ${c.patient_id ? "success" : ""}`}
                    >
                      {c.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {new Date(c.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <button
                      className="text-link"
                      onClick={() => setSelected(c)}
                    >
                      View call <ArrowUpRight size={16} />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!calls.length && !error && (
            <div className="empty-state">
              <h3>No calls yet</h3>
              <p>
                Call activity and transcripts appear here as the voice agent
                handles registrations.
              </p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="appointments">
          <p className="demo-note">
            These bookings are for demonstration only. No real clinical
            appointments are scheduled.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Appointment (UTC)</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.map((a) => (
                <TableRow key={a.appointment_id}>
                  <TableCell>
                    {a.first_name} {a.last_name}
                  </TableCell>
                  <TableCell>
                    {new Date(a.slot).toLocaleString("en-US", {
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                  </TableCell>
                  <TableCell>
                    <span className="status-pill">Mock first visit</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!appointments.length && (
            <div className="empty-state">
              <h3>No demo appointments booked</h3>
              <p>
                Callers can optionally choose a demo appointment after
                completing registration.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
      <Sheet
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <SheetContent className="detail-sheet">
          <SheetHeader>
            <SheetTitle>Call transcript</SheetTitle>
            <SheetDescription>{selected?.call_id}</SheetDescription>
          </SheetHeader>
          <div className="transcript-content">
            <span className="status-pill">{selected?.status}</span>
            <h3>Summary</h3>
            <p>{selected?.summary || "No summary received yet."}</p>
            <h3>Conversation</h3>
            <pre>
              {selected?.transcript ||
                "The end-of-call transcript has not been received."}
            </pre>
            <small>Ended: {selected?.ended_reason || "Call in progress"}</small>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
