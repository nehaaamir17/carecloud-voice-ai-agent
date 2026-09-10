"use client";
import { useEffect } from "react";
type Context = {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => Promise<unknown>;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function RegistryTools({
  onResults,
}: {
  onResults: (data: Record<string, string | null>[]) => void;
}) {
  useEffect(() => {
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "find_patient_records",
          description:
            "Find patient records by exact last name and display them in the registry. Requires the existing reviewer session.",
          inputSchema: {
            type: "object",
            properties: {
              last_name: { type: "string", minLength: 1, maxLength: 50 },
            },
            required: ["last_name"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          async execute(input) {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).some((k) => k !== "last_name") ||
              !("last_name" in input) ||
              typeof input.last_name !== "string" ||
              !input.last_name.trim() ||
              input.last_name.length > 50
            )
              throw Error("Provide last_name with 1–50 characters.");
            const r = await fetch(
              "/patients?last_name=" + encodeURIComponent(input.last_name),
            );
            if (!r.ok)
              throw Error("Registry unavailable or reviewer session expired.");
            const result = (await r.json()) as {
              data: Record<string, string | null>[];
            };
            onResults(result.data);
            return {
              count: result.data.length,
              patients: result.data.map((p) => ({
                patient_id: p.patient_id,
                first_name: p.first_name,
                last_name: p.last_name,
              })),
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, [onResults]);
  return null;
}
