import { MetricFactSheet } from "../data/types";
import { formatInr } from "../data/normalize";

export interface GroundingValidationResult {
  isGrounded: boolean;
  unverifiedNumbers: string[];
  verifiedNumbers: string[];
  extractedTokens: string[];
  fallbackTemplateProse?: string;
}

/**
 * Extracts candidate numeric tokens from text, e.g. "₹1.50 Cr", "73.1%", "12,000", "489360", "₹444000"
 */
export function extractNumbersFromProse(text: string): string[] {
  // Strip out date fragments, calendar months, fiscal year markers, quarters, ordinals, and list bullets
  // to avoid false hallucination flags on calendar metadata.
  const sanitized = text
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ")
    .replace(
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/gi,
      " "
    )
    .replace(
      /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:,?\s+\d{4})?\b/gi,
      " "
    )
    .replace(/\bFY\s*['’]?\d{2,4}(?:[-/]\d{2,4})?\b/gi, " ")
    .replace(/\bQ[1-4](?:\s*['’]?\d{2,4})?\b/gi, " ")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\b/gi, " ")
    .replace(/\b18\s*%\s*(?:GST)?\b/gi, " ")
    .replace(/\bGST\s*(?:of|@)?\s*18\s*%\b/gi, " ")
    .replace(/\b18\s*percent\b/gi, " ")
    .replace(/(?:^|\n|\.\s+)\d+\.\s+/g, " ")
    .replace(/#\s*\d+\b/g, " ")
    .replace(/\bNo\.\s*\d+\b/gi, " ")
    .replace(/\b\d+\s*:\s*\d+\b/g, " ");

  const matches = sanitized.match(
    /(?:₹\s*|[-−]\s*)?[\d,]+(?:\.\d+)?(?:\s*(?:Cr|L|lakh|crore|%|k|M))?/gi
  );
  if (!matches) return [];
  return matches
    .map((m) => m.trim())
    .filter((m) => m.length > 0 && !/^0+$/.test(m.replace(/\D/g, "")));
}

/**
 * Normalizes an extracted token to standard numeric value
 */
export function parseTokenToNumber(token: string): number | null {
  const isNegative = token.includes("-") || token.includes("−");
  const clean = token.replace(/[-−₹,\s]/g, "").toLowerCase();
  let v: number;

  if (clean.endsWith("%")) {
    v = parseFloat(clean.slice(0, -1));
    return isNaN(v) ? null : isNegative ? -v : v;
  }
  if (clean.endsWith("cr") || clean.endsWith("crore")) {
    v = parseFloat(clean.replace(/cr|crore/g, ""));
    return isNaN(v) ? null : (isNegative ? -v : v) * 10000000;
  }
  if (clean.endsWith("l") || clean.endsWith("lakh")) {
    v = parseFloat(clean.replace(/l|lakh/g, ""));
    return isNaN(v) ? null : (isNegative ? -v : v) * 100000;
  }
  if (clean.endsWith("k")) {
    v = parseFloat(clean.replace(/k/g, ""));
    return isNaN(v) ? null : (isNegative ? -v : v) * 1000;
  }

  v = parseFloat(clean);
  return isNaN(v) ? null : isNegative ? -v : v;
}

/**
 * Validates that all numbers in the prose exist within the combined fact sheets
 */
export function validateNumericGrounding(
  prose: string,
  factSheets: MetricFactSheet[]
): GroundingValidationResult {
  const tokens = extractNumbersFromProse(prose);
  const factSheetNumbers: number[] = [];

  // Allow standard statutory Indian GST rates present across all work orders
  factSheetNumbers.push(18, 1.18);

  for (const fs of factSheets) {
    if (typeof fs.rowsScanned === "number") {
      factSheetNumbers.push(fs.rowsScanned);
    }
    if (Array.isArray(fs.sourceRowIds)) {
      factSheetNumbers.push(fs.sourceRowIds.length);
    }
    if (fs.numbers) {
      for (const [k, val] of Object.entries(fs.numbers)) {
        if (typeof val === "number") {
          factSheetNumbers.push(val);
          factSheetNumbers.push(Math.abs(val));
          factSheetNumbers.push(-Math.abs(val));

          // Complementary percentages (only for percentage metrics between 5% and 95%)
          const isPctMetric =
            k.toLowerCase().includes("pct") || k.toLowerCase().includes("efficiency");

          if (isPctMetric && val >= 5 && val <= 95) {
            const complement = 100 - val;
            factSheetNumbers.push(complement);
            factSheetNumbers.push(Math.round(complement * 10) / 10);
            factSheetNumbers.push(Math.round(complement));
          }
        }
      }

      // Standard revenue conversion ratios when both components exist
      const n = fs.numbers;
      if (
        typeof n.billedAmountExclGst === "number" &&
        typeof n.contractedOrderValueExclGst === "number" &&
        n.contractedOrderValueExclGst > 0
      ) {
        const billedPct = (n.billedAmountExclGst / n.contractedOrderValueExclGst) * 100;
        factSheetNumbers.push(billedPct, Math.round(billedPct * 10) / 10, Math.round(billedPct));
      }
      if (
        typeof n.collectedAmountInclGst === "number" &&
        typeof n.billedAmountInclGst === "number" &&
        n.billedAmountInclGst > 0
      ) {
        const collPct = (n.collectedAmountInclGst / n.billedAmountInclGst) * 100;
        factSheetNumbers.push(collPct, Math.round(collPct * 10) / 10, Math.round(collPct));
      }
      if (
        typeof n.collectedAmountInclGst === "number" &&
        typeof n.contractedOrderValueInclGst === "number" &&
        n.contractedOrderValueInclGst > 0
      ) {
        const collContPct = (n.collectedAmountInclGst / n.contractedOrderValueInclGst) * 100;
        factSheetNumbers.push(
          collContPct,
          Math.round(collContPct * 10) / 10,
          Math.round(collContPct)
        );
      }
    }
    // Also include any numbers from asOfDate (e.g., year, month, day) and fiscalYear
    if (fs.asOfDate) {
      const parts = fs.asOfDate
        .split(/\D+/)
        .map(Number)
        .filter((n) => !isNaN(n) && n > 0);
      factSheetNumbers.push(...parts);
    }
    if (fs.fiscalYear) {
      const parts = fs.fiscalYear
        .split(/\D+/)
        .map(Number)
        .filter((n) => !isNaN(n) && n > 0);
      factSheetNumbers.push(...parts);
    }

    // Disclosed constants count as grounded context. Assumption lines carry
    // configuration the pipeline itself writes (e.g. "High=0.7, Medium=0.4,
    // Low=0.15" probability weights), so prose repeating those figures must
    // not be rejected — they are disclosures, not computed claims.
    const disclosed = [...(fs.assumptions ?? []), ...(fs.caveats ?? [])].join(" ");
    for (const token of extractNumbersFromProse(disclosed)) {
      const parsed = parseTokenToNumber(token);
      if (parsed !== null) factSheetNumbers.push(parsed);
    }
  }

  // Allow grounded arithmetic derivations (pairwise sums, differences, component shares,
  // multi-stage totals, and tax conversions) across verified monetary figures from the fact sheets.
  const monetaryValues = Array.from(
    new Set(
      factSheets
        .flatMap((fs) => (fs.numbers ? Object.values(fs.numbers) : []))
        .filter((val): val is number => typeof val === "number" && Math.abs(val) >= 10000)
    )
  );

  for (let i = 0; i < monetaryValues.length; i++) {
    const a = Math.abs(monetaryValues[i]);
    // Pre-tax / post-tax conversions
    factSheetNumbers.push(Math.round(a / 1.18), Math.round(a * 1.18));

    for (let j = i + 1; j < monetaryValues.length; j++) {
      const b = Math.abs(monetaryValues[j]);
      const sum = a + b;
      const diff = Math.abs(a - b);
      factSheetNumbers.push(sum, diff);

      // Percentage share of total
      if (sum > 0) {
        const shareA = (a / sum) * 100;
        const shareB = (b / sum) * 100;
        factSheetNumbers.push(
          shareA,
          Math.round(shareA * 10) / 10,
          Math.round(shareA),
          shareB,
          Math.round(shareB * 10) / 10,
          Math.round(shareB)
        );
      }
      if (b > 0 && a <= b) {
        const ratio = (a / b) * 100;
        factSheetNumbers.push(ratio, Math.round(ratio * 10) / 10, Math.round(ratio));
      }

      // Triple sums for composite multi-stage metrics (e.g., won deals + backlog + AR)
      for (let k = j + 1; k < monetaryValues.length; k++) {
        const c = Math.abs(monetaryValues[k]);
        factSheetNumbers.push(a + b + c);
      }
    }
  }

  const unverified: string[] = [];
  const verified: string[] = [];

  for (const token of tokens) {
    const parsed = parseTokenToNumber(token);
    if (parsed === null) continue;

    // Filter out common structural counters (1 through 10, calendar years 2020-2035, 100% scale)
    if (
      (parsed >= 1 && parsed <= 10 && Number.isInteger(parsed)) ||
      (parsed >= 2020 && parsed <= 2035 && Number.isInteger(parsed)) ||
      parsed === 100
    ) {
      verified.push(token);
      continue;
    }

    // Check if within 3% margin of any factSheet number (accounting for rounding in prose and sign conventions)
    const matched = factSheetNumbers.some((num) => {
      if (num === 0 && parsed === 0) return true;
      if (num === 0) return false;
      const absNum = Math.abs(num);
      const absParsed = Math.abs(parsed);
      const relDiff = Math.abs(absNum - absParsed) / absNum;
      return relDiff <= 0.03 || Math.abs(absNum - absParsed) < 1.0;
    });

    if (matched) {
      verified.push(token);
    } else {
      unverified.push(token);
    }
  }

  const isGrounded = unverified.length === 0;

  return {
    isGrounded,
    unverifiedNumbers: unverified,
    verifiedNumbers: verified,
    extractedTokens: tokens,
    fallbackTemplateProse: isGrounded ? undefined : renderDeterministicFallback(factSheets),
  };
}

/**
 * Fallback deterministic template renderer when grounding fails
 */
export function renderDeterministicFallback(factSheets: MetricFactSheet[]): string {
  const lines: string[] = ["Executive Business Intelligence Summary (Deterministic Fallback)\n"];

  for (const fs of factSheets) {
    lines.push(
      `Scope: ${fs.fiscalYear} (As of ${fs.asOfDate}, ${fs.rowsScanned} records audited)\n`
    );
    for (const [k, v] of Object.entries(fs.numbers)) {
      let formatted: string;
      if (typeof v === "number" && Math.abs(v) >= 1000) {
        formatted = v < 0 ? `-${formatInr(Math.abs(v))}` : formatInr(v);
      } else {
        formatted = String(v);
      }
      lines.push(`• ${k}: ${formatted}`);
    }
    lines.push("");
    if (fs.assumptions && fs.assumptions.length > 0) {
      lines.push("Assumptions applied:");
      for (const a of fs.assumptions) lines.push(`• ${a}`);
      lines.push("");
    }
    if (fs.caveats && fs.caveats.length > 0) {
      lines.push("Data caveats:");
      for (const c of fs.caveats) lines.push(`• ${c}`);
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}
