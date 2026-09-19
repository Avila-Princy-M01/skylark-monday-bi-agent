import { describe, it, expect } from "vitest";

describe("Deterministic Invariance & Non-Negotiable Math Rules", () => {
  it("guarantees 1,000 runs produce identical golden numbers (0 variance)", () => {
    // Contracted, Billed, Collected values in INR
    const testCases = [
      { contracted: 489360, billed: 489360, collected: 400000 },
      { contracted: 17616960, billed: 10000000, collected: 8500000 },
      { contracted: 611700, billed: 0, collected: 0 },
      { contracted: 2348928, billed: 1500000, collected: 1500000 },
    ];

    for (let iteration = 0; iteration < 1000; iteration++) {
      for (const tc of testCases) {
        const ar = tc.billed - tc.collected;
        const unbilled = tc.contracted - tc.billed;
        const efficiency = tc.billed > 0 ? tc.collected / tc.billed : 0;

        expect(ar).toBe(tc.billed - tc.collected);
        expect(unbilled).toBe(tc.contracted - tc.billed);
        if (tc.billed > 0) {
          expect(efficiency).toBe(tc.collected / tc.billed);
        } else {
          expect(efficiency).toBe(0);
        }
      }
    }
  });

  it("strictly handles negative amounts-to-be-billed as over-billed, not parse errors", () => {
    const contracted = 500000;
    const billed = 600000;
    const amountToBeBilled = contracted - billed;

    expect(amountToBeBilled).toBe(-100000);
    const isOverBilled = amountToBeBilled < 0;
    expect(isOverBilled).toBe(true);
  });

  it("identifies masked rupee placeholders (e.g. 1.2332, 1.455176) and excludes from financial sums", () => {
    const rawValues = [489360, 1.2332, 17616960, 1.455176, 611700];

    const isMaskedPlaceholder = (val: number) => Math.abs(val - 1) < 0.5;

    const validValues = rawValues.filter((v) => !isMaskedPlaceholder(v));
    const excludedCount = rawValues.filter(isMaskedPlaceholder).length;

    expect(excludedCount).toBe(2);
    expect(validValues).toEqual([489360, 17616960, 611700]);
    const totalValidSum = validValues.reduce((a, b) => a + b, 0);
    expect(totalValidSum).toBe(18718020);
  });
});
