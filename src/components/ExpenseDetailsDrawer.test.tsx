import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpenseDetailsDrawer } from "@/components/ExpenseDetailsDrawer";
import type { Expense } from "@/lib/expenses";

const expense: Expense = {
  id: "exp-1",
  amount: 250,
  category: "Food",
  date: "2026-05-11",
  payment_method: "upi",
  created_at: "2026-05-11T09:00:00.000Z",
  note: "Lunch",
  type: "expense",
};

describe("ExpenseDetailsDrawer", () => {
  it("saves edited transaction dates as date-only values", () => {
    const onUpdate = vi.fn();

    render(
      <ExpenseDetailsDrawer
        expense={expense}
        categories={[{ name: "Food", subcategories: [], type: "expense" }]}
        onOpenChange={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        userId={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /may 11, 2026/i }));

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement | null;
    expect(dateInput).not.toBeNull();

    fireEvent.change(dateInput!, { target: { value: "2026-05-10" } });
    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(onUpdate).toHaveBeenCalledWith(
      "exp-1",
      expect.objectContaining({ date: "2026-05-10" }),
    );
  });
});
