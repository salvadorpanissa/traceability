import { describe, expect, it } from "vitest";
import { toSentenceCase } from "@/lib/utils";

describe("toSentenceCase", () => {
  it("capitalizes only the first letter of an all-caps single word", () => {
    expect(toSentenceCase("ASPERSIN")).toBe("Aspersin");
  });

  it("capitalizes only the first letter of a multi-word all-caps value, lowercasing the rest", () => {
    expect(toSentenceCase("IVERMECTINA PLUS")).toBe("Ivermectina plus");
  });

  it("leaves already-correct sentence case unchanged", () => {
    expect(toSentenceCase("Vaca de cría")).toBe("Vaca de cría");
  });

  it("normalizes mixed-case input the same way", () => {
    expect(toSentenceCase("juan PEREZ")).toBe("Juan perez");
  });

  it("leaves an empty string unchanged", () => {
    expect(toSentenceCase("")).toBe("");
  });

  it("keeps digits and symbols untouched", () => {
    expect(toSentenceCase("IVERMECTINA 1%")).toBe("Ivermectina 1%");
  });
});
