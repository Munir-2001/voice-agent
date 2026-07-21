"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";

export function AnimatedNumber({
  value,
  duration = 1,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const controls = animate(0, value, {
            duration,
            ease: [0.22, 1, 0.36, 1],
            onUpdate: (v) => setDisplay(v),
          });
          return () => controls.stop();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);

  const rounded = Math.round(display);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {rounded.toLocaleString()}
      {suffix}
    </span>
  );
}
