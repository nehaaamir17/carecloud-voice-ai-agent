"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
} from "recharts";
import { Languages, TrendingUp } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type Patient = Record<string, string | null>;

const activityConfig = {
  registrations: { label: "Registrations", color: "var(--primary)" },
} satisfies ChartConfig;

const languageConfig = {
  value: { label: "Patients", color: "var(--primary)" },
} satisfies ChartConfig;

export function OperationsInsights({ patients }: { patients: Patient[] }) {
  const activity = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return {
        key: date.toISOString().slice(0, 10),
        day: date.toLocaleDateString("en-US", { weekday: "short" }),
        registrations: 0,
      };
    });
    const byDate = new Map(days.map((day) => [day.key, day]));
    for (const patient of patients) {
      if (!patient.created_at) continue;
      const key = new Date(patient.created_at).toISOString().slice(0, 10);
      const day = byDate.get(key);
      if (day) day.registrations += 1;
    }
    return days;
  }, [patients]);

  const languages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const patient of patients) {
      const language = patient.preferred_language || "English";
      counts.set(language, (counts.get(language) ?? 0) + 1);
    }
    return Array.from(counts, ([name, value], index) => ({
      name,
      value,
      fill: index === 0 ? "var(--primary)" : "var(--visual-secondary)",
    }));
  }, [patients]);

  return (
    <section className="insights" aria-labelledby="insights-title">
      <div className="section-heading insights-heading">
        <div>
          <div className="eyebrow">ACTIVITY SNAPSHOT</div>
          <h2 id="insights-title">Registry insights</h2>
          <p>Aggregate activity from confirmed patient records.</p>
        </div>
        <span className="privacy-note">No patient details displayed</span>
      </div>
      <div className="insight-grid">
        <article className="chart-card">
          <div className="chart-title">
            <span className="chart-icon">
              <TrendingUp size={18} />
            </span>
            <div>
              <h3>Seven-day registrations</h3>
              <p>Confirmed records by day</p>
            </div>
          </div>
          <ChartContainer
            config={activityConfig}
            className="activity-chart"
            initialDimension={{ width: 520, height: 210 }}
          >
            <BarChart data={activity} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Bar
                dataKey="registrations"
                fill="var(--color-registrations)"
                radius={[6, 6, 2, 2]}
                maxBarSize={34}
              />
            </BarChart>
          </ChartContainer>
        </article>
        <article className="chart-card language-card">
          <div className="chart-title">
            <span className="chart-icon secondary-icon">
              <Languages size={18} />
            </span>
            <div>
              <h3>Preferred language</h3>
              <p>Registration language mix</p>
            </div>
          </div>
          {languages.length ? (
            <div className="language-visual">
              <ChartContainer
                config={languageConfig}
                className="language-chart"
                initialDimension={{ width: 180, height: 180 }}
              >
                <PieChart accessibilityLayer>
                  <ChartTooltip
                    content={<ChartTooltipContent nameKey="name" hideLabel />}
                  />
                  <Pie
                    data={languages}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={75}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {languages.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="language-legend">
                {languages.map((entry) => (
                  <div key={entry.name}>
                    <i style={{ background: entry.fill }} />
                    <span>{entry.name}</span>
                    <strong>{entry.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="chart-empty">
              <span>0</span>
              <p>Language distribution appears after registration.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
