"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "hide-numbers";

// Applies/removes the global data attribute that CSS keys off of to blur
// phone numbers (elements tagged `.num-mask`). Kept in one place so both the
// initial read and the toggle stay in sync.
function apply(hidden: boolean) {
  document.documentElement.dataset.hideNumbers = hidden ? "true" : "false";
}

// A simple button that blurs every phone number across lead lists. Names,
// businesses, and industries stay visible — only the numbers are masked.
// Preference is remembered per-browser via localStorage.
export function NumberBlurToggle() {
  const [hidden, setHidden] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) === "true";
    setHidden(saved);
    apply(saved);
    setMounted(true);
  }, []);

  function toggle() {
    const next = !hidden;
    setHidden(next);
    apply(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={hidden ? "Show phone numbers" : "Hide phone numbers"}
      aria-pressed={hidden}
      title={hidden ? "Show phone numbers" : "Hide phone numbers"}
      onClick={toggle}
      className="text-muted-foreground hover:text-foreground"
    >
      {mounted && hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </Button>
  );
}
