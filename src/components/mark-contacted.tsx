"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function MarkContactedButton({ name }: { name: string }) {
  const [done, setDone] = useState(false);

  return (
    <Button
      variant={done ? "secondary" : "default"}
      size="sm"
      disabled={done}
      onClick={() => {
        setDone(true);
        toast.success(`Marked ${name} as contacted`, {
          description: "Moved out of the interested queue.",
        });
      }}
    >
      <Check className="size-4" />
      {done ? "Contacted" : "Mark contacted"}
    </Button>
  );
}
