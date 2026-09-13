"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, PhoneOff } from "lucide-react";
import type Vapi from "@vapi-ai/web";

type VoiceConfig = {
  enabled: boolean;
  assistant_id: string | null;
  public_key: string | null;
};

type CallState = "idle" | "connecting" | "live" | "ending" | "error";

export function BrowserCall() {
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [state, setState] = useState<CallState>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const client = useRef<Vapi | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/voice-config")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = (await response.json()) as { data: VoiceConfig };
        if (active) setConfig(payload.data);
      })
      .catch(() => {
        if (active)
          setConfig({ enabled: false, assistant_id: null, public_key: null });
      });
    return () => {
      active = false;
      const current = client.current;
      client.current = null;
      if (current) void current.stop();
    };
  }, []);

  async function start() {
    if (!config?.enabled || !config.assistant_id || !config.public_key) return;
    setError("");
    setState("connecting");
    try {
      const { default: VapiClient } = await import("@vapi-ai/web");
      const current = new VapiClient(config.public_key);
      client.current = current;
      current.on("call-start", () => setState("live"));
      current.on("call-end", () => {
        setSpeaking(false);
        setState("idle");
        client.current = null;
      });
      current.on("speech-start", () => setSpeaking(true));
      current.on("speech-end", () => setSpeaking(false));
      current.on("error", () => {
        setSpeaking(false);
        setError(
          "The voice connection could not start. Check microphone access and try again.",
        );
        setState("error");
      });
      await current.start(config.assistant_id);
    } catch {
      client.current = null;
      setError(
        "The voice connection could not start. Check microphone access and try again.",
      );
      setState("error");
    }
  }

  async function stop() {
    if (!client.current) return;
    setState("ending");
    try {
      await client.current.stop();
    } finally {
      client.current = null;
      setSpeaking(false);
      setState("idle");
    }
  }

  const inCall = state === "live" || state === "ending";
  if (config && !config.enabled) return null;

  return (
    <div className="browser-call">
      <button
        type="button"
        className={inCall ? "browser-call-button live" : "browser-call-button"}
        onClick={() => void (inCall ? stop() : start())}
        disabled={!config || state === "connecting" || state === "ending"}
        aria-label={
          inCall ? "End browser voice call" : "Start browser voice call"
        }
      >
        {state === "connecting" || state === "ending" ? (
          <LoaderCircle className="spin" size={17} />
        ) : inCall ? (
          <PhoneOff size={17} />
        ) : (
          <Mic size={17} />
        )}
        {state === "connecting"
          ? "Connecting…"
          : state === "ending"
            ? "Ending…"
            : inCall
              ? "End browser call"
              : "Call free in browser"}
      </button>
      <span className="browser-call-status" aria-live="polite">
        {inCall
          ? speaking
            ? "Agent speaking"
            : "Listening"
          : error || "Internet + microphone · no phone balance needed"}
      </span>
    </div>
  );
}
