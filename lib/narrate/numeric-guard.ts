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
    .replace(/(?:^|\n|\.\s+)\d+\.\s+/g, " ")
    .replace(/#\s*\d+\b/g, " ")
    .replace(/\bNo\.\s*\d+\b/gi, " ")
    .replace(/\b\d+\s*:\s*\d+\b/g, " ");

  const matches = sanitized.match(/(?:₹\s*)?[\d,]+(?:\.\d+)?(?:\s*(?:Cr|L|lakh|crore|%|k|M))?/gi);
  if (!matches) return [];
  return matches
    .map((m) => m.trim())
    .filter((m) => m.length > 0 && !/^0+$/.test(m.replace(/\D/g, "")));
}

/**
 * Normalizes an extracted token to standard numeric value
 */
export function parseTokenToNumber(token: string): number | null {
  const clean = token.replace(/₹|,|\s/g, "").toLowerCase();

  if (clean.endsWith("%")) {
    const v = parseFloat(clean.slice(0, -1));
    return isNaN(v) ? null : v;
  }
  if (clean.endsWith("cr") || clean.endsWith("crore")) {
    const v = parseFloat(clean.replace(/cr|crore/g, ""));
    return isNaN(v) ? null : v * 10000000;
  }
  if (clean.endsWith("l") || clean.endsWith("lakh")) {
    const v = parseFloat(clean.replace(/l|lakh/g, ""));
    return isNaN(v) ? null : v * 100000;
  }
  if (clean.endsWith("k")) {
    const v = parseFloat(clean.replace(/k/g, ""));
    return isNaN(v) ? null : v * 1000;
  }

  const v = parseFloat(clean);
  return isNaN(v) ? null : v;
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

  for (const fs of factSheets) {
    if (typeof fs.rowsScanned === "number") {
      factSheetNumbers.push(fs.rowsScanned);
    }
    if (Array.isArray(fs.sourceRowIds)) {
      factSheetNumbers.push(fs.sourceRowIds.length);
    }
    if (fs.numbers) {
      for (const val of Object.values(fs.numbers)) {
        if (typeof val === "number") {
          factSheetNumbers.push(val);
        }
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

    // Check if within 3% margin of any factSheet number (accounting for rounding in prose)
    const matched = factSheetNumbers.some((num) => {
      if (num === 0 && parsed === 0) return true;
      if (num === 0) return false;
      const relDiff = Math.abs(num - parsed) / Math.abs(num);
      return relDiff <= 0.03 || Math.abs(num - parsed) < 1.0;
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
      const formatted = typeof v === "number" && v > 1000 ? formatInr(v) : String(v);
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
