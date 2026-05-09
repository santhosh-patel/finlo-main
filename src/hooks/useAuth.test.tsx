import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useAuth } from "@/hooks/useAuth";

function BadConsumer() {
  useAuth();
  return null;
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when used outside AuthProvider", () => {
    expect(() => render(<BadConsumer />)).toThrow(/AuthProvider/i);
  });
});
