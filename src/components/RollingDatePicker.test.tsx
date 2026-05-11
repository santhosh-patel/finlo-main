import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RollingDatePicker } from "@/components/RollingDatePicker";

describe("RollingDatePicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T15:30:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets the user edit the date with a native date input", () => {
    const onChange = vi.fn();

    const { container } = render(
      <RollingDatePicker value="2026-05-10" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /may 10, 2026/i }));

    const dateInput = container.ownerDocument.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement | null;

    expect(dateInput).not.toBeNull();

    fireEvent.change(dateInput!, { target: { value: "2026-05-12" } });
    fireEvent.click(screen.getByRole("button", { name: /done/i }));

    expect(onChange).toHaveBeenCalledWith("2026-05-12");
  });

  it("opens on the provided date-only value instead of resetting to today", () => {
    const onChange = vi.fn();

    const { container } = render(
      <RollingDatePicker value="2026-05-10" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /may 10, 2026/i }));

    const dateInput = container.ownerDocument.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement | null;

    expect(dateInput).not.toBeNull();
    expect(dateInput?.value).toBe("2026-05-10");
  });

  it("supports a quick yesterday action for date-only picking", () => {
    const onChange = vi.fn();

    render(<RollingDatePicker value="2026-05-01" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /may 1, 2026/i }));
    fireEvent.click(screen.getByRole("button", { name: /yesterday/i }));
    fireEvent.click(screen.getByRole("button", { name: /done/i }));

    expect(onChange).toHaveBeenCalledWith("2026-05-10");
  });

  it("saves time together with the selected date", () => {
    const onChange = vi.fn();

    const { container } = render(
      <RollingDatePicker
        value="2026-05-10T09:15"
        onChange={onChange}
        showTime
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /may 10, 2026.*9:15 am/i }));

    const dateInput = container.ownerDocument.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement | null;
    const timeInput = container.ownerDocument.querySelector(
      'input[type="time"]',
    ) as HTMLInputElement | null;

    expect(dateInput).not.toBeNull();
    expect(timeInput).not.toBeNull();

    fireEvent.change(dateInput!, { target: { value: "2026-05-12" } });
    fireEvent.change(timeInput!, { target: { value: "18:45" } });
    fireEvent.click(screen.getByRole("button", { name: /done/i }));

    expect(onChange).toHaveBeenCalledWith("2026-05-12T18:45");
  });
});
