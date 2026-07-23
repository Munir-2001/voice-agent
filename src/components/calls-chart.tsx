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

const config = {
  dials: { label: "Dials", color: "var(--chart-1)" },
  interested: { label: "Interested", color: "var(--chart-3)" },
} satisfies ChartConfig;

export interface DayPoint {
  day: string;
  dials: number;
  interested: number;
}

export function CallsChart({ data }: { data: DayPoint[] }) {
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
