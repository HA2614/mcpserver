import React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground border-transparent",
      secondary: "bg-secondary text-secondary-foreground",
      outline: "text-foreground"
    }
  },
  defaultVariants: { variant: "default" }
});

export function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
