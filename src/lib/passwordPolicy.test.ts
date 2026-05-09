import { describe, expect, it } from "vitest";
import { validatePassword } from "@/lib/passwordPolicy";

describe("validatePassword", () => {
  it("rejects short passwords", () => {
    expect(validatePassword("Aa1!aaaa")).toBeNull(); // exactly 8
    expect(validatePassword("Aa1!aaa")).not.toBeNull();
  });

  it("requires complexity", () => {
    expect(validatePassword("Aa1!" + "a".repeat(10))).toBeNull();
    expect(validatePassword("Aa!" + "a".repeat(10))).not.toBeNull(); // missing digit
    expect(validatePassword("a1!" + "a".repeat(10))).not.toBeNull(); // missing upper
    expect(validatePassword("A1!" + "0".repeat(10))).not.toBeNull(); // missing lower
    expect(validatePassword("Aa1" + "a".repeat(10))).not.toBeNull(); // missing special
  });
});
