// Ported from lovable-design/src/lib/utils.ts (TypeScript -> plain JS; same
// two-package implementation, same export name/signature).
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
