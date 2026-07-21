import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/animated-number";
import { cn } from "@/lib/utils";

type Accent = "blue" | "green" | "yellow" | "neutral";

const ACCENT_TILE: Record<Accent, string> = {
  blue: "bg-brand-blue-muted text-brand-blue-ink",
  green: "bg-success-muted text-success-ink",
  yellow: "bg-warning-muted text-warning-ink",
  neutral: "bg-muted text-muted-foreground",
};

export function StatCard({
  label,
  value,
  prefix,
  suffix,
  delta,
  hint,
  icon,
  accent = "blue",
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  delta?: { value: string; positive: boolean };
  hint?: string;
  icon?: ReactNode;
  accent?: Accent;
}) {
  return (
    <Card className="hover-lift gap-0 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon && (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              ACCENT_TILE[accent],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tnum">
          <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
        </span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
              delta.positive
                ? "bg-success-muted text-success-ink"
                : "bg-muted text-muted-foreground",
            )}
          >
            {delta.positive ? (
              <ArrowUpRight className="size-3" />
            ) : (
              <ArrowDownRight className="size-3" />
            )}
            {delta.value}
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
