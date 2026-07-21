"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";

const data = [
  { day: "Jul 2", dials: 24, interested: 2 },
  { day: "Jul 3", dials: 28, interested: 3 },
  { day: "Jul 7", dials: 26, interested: 2 },
  { day: "Jul 8", dials: 30, interested: 4 },
  { day: "Jul 9", dials: 27, interested: 3 },
  { day: "Jul 10", dials: 29, interested: 5 },
  { day: "Jul 11", dials: 25, interested: 2 },
  { day: "Jul 14", dials: 30, interested: 4 },
  { day: "Jul 15", dials: 28, interested: 3 },
  { day: "Jul 16", dials: 19, interested: 4 },
];

const config = {
  dials: { label: "Dials", color: "var(--chart-1)" },
  interested: { label: "Interested", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function CallsChart() {
  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <BarChart data={data} barGap={4} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.4} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          fontSize={11}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="dials" fill="var(--color-dials)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar
          dataKey="interested"
          fill="var(--color-interested)"
          radius={[4, 4, 0, 0]}
          maxBarSize={22}
        />
      </BarChart>
    </ChartContainer>
  );
}
