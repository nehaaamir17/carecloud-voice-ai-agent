"use client";
import { useEffect, useState } from "react";
import { BrowserCall } from "@/components/browser-call";
export function AgentCard() {
  const [state, setState] = useState<{
      voice_configured: boolean;
      phone_number: string | null;
    } | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    fetch("/health")
      .then(async (r) => {
        if (!r.ok) throw Error();
        setState(
          (
            (await r.json()) as {
              data: { voice_configured: boolean; phone_number: string | null };
            }
          ).data,
        );
      })
      .catch(() => setError(true));
  }, []);
  return (
    <div className="voice-card">
      <span className="voice-card-logo">
        <img src="/carecloud-logo.png" alt="CareCloud" width="34" height="34" />
      </span>
      <div>
        <strong>Patient registration agent</strong>
        {state?.voice_configured ? (
          <>
            <a className="call-number" href={`tel:${state.phone_number}`}>
              {state.phone_number}
            </a>
            <p>English & Spanish · Fictional details only</p>
            <BrowserCall />
          </>
        ) : (
          <p>
            {error
              ? "Connection status unavailable"
              : state
                ? "Phone connection awaiting configuration"
                : "Checking connection…"}
          </p>
        )}
      </div>
      <div className="wave" aria-hidden="true">
        {[14, 24, 38, 20, 44, 28, 16, 34].map((h, i) => (
          <i key={i} style={{ height: h }} />
        ))}
      </div>
    </div>
  );
}
