export type DurationResult = {
  status: "not-checked";
  basis: "declared-world-rule";
  reason: string;
} | {
  status: "consistent" | "conflict";
  basis: "declared-world-rule";
  expectedMinutes: number;
  observedMinutes: number;
  equation: string;
  evidence: { rule: string; scene: string };
  caveat: string;
};
export function checkDeclaredDuration(input?: { rule?: unknown; scene?: unknown }): DurationResult;
