"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

export function FadeIn({
  children,
  delay = 0,
  y = 10,
  className,
  ...props
}: { children: ReactNode; delay?: number; y?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease, delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: { staggerChildren: 0.06, delayChildren: delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
      }}
    >
      {children}
    </motion.div>
  );
}
