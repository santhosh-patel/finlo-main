import { describe, expect, it } from "vitest";
import { expenseDateToDbIso, normalizeExpenseDate } from "@/lib/expenses";

describe("normalizeExpenseDate", () => {
  it("keeps plain yyyy-mm-dd unchanged (no UTC midnight reinterpretation)", () => {
    expect(normalizeExpenseDate("2026-05-11")).toBe("2026-05-11");
    expect(normalizeExpenseDate(" 2026-12-01 ")).toBe("2026-12-01");
  });

  it("maps full ISO timestamps to the local calendar day", () => {
    const d = new Date("2026-05-10T18:30:00.000Z");
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    expect(normalizeExpenseDate("2026-05-10T18:30:00.000Z")).toBe(`${y}-${m}-${day}`);
  });
});

describe("expenseDateToDbIso", () => {
  it("stores calendar day as noon UTC for timestamptz columns", () => {
    expect(expenseDateToDbIso("2026-05-11")).toBe("2026-05-11T12:00:00.000Z");
  });
});
