export interface SectorResolution {
  input: string;
  matchedSectors: string[];
  isSyntheticComposite: boolean;
  explanation?: string;
}

const SECTOR_SYNONYM_MAP: Record<string, string[]> = {
  energy: ["Renewables", "Powerline"],
  power: ["Powerline"],
  solar: ["Renewables"],
  wind: ["Renewables"],
  green: ["Renewables"],
  renewables: ["Renewables"],
  renewable: ["Renewables"],
  grid: ["Powerline"],
  transmission: ["Powerline"],
  powerline: ["Powerline"],
  "t&d": ["Powerline"],
  rail: ["Railways"],
  railways: ["Railways"],
  railway: ["Railways"],
  mine: ["Mining"],
  mines: ["Mining"],
  mining: ["Mining"],
  coal: ["Mining"],
  infrastructure: ["Infrastructure"],
  infra: ["Infrastructure"],
  survey: ["Survey", "GIS"],
  agriculture: ["Agriculture"],
  agri: ["Agriculture"],
};

export const KNOWN_CANONICAL_SECTORS = [
  "Mining",
  "Powerline",
  "Renewables",
  "Railways",
  "Infrastructure",
  "Survey",
  "GIS",
  "Agriculture",
  "Construction",
  "Security and Surveillance",
  "Aviation",
  "Manufacturing",
  "DSP",
  "Tender",
  "Others",
];

/**
 * Resolves a natural query sector or alias into known canonical sector names in the data.
 */
export function resolveSector(inputStr: string): SectorResolution {
  const clean = inputStr.trim().toLowerCase();
  if (!clean) {
    return { input: inputStr, matchedSectors: [], isSyntheticComposite: false };
  }

  // 1. Exact synonym map lookup
  if (SECTOR_SYNONYM_MAP[clean]) {
    const matched = SECTOR_SYNONYM_MAP[clean];
    const isSyntheticComposite = matched.length > 1;
    return {
      input: inputStr,
      matchedSectors: matched,
      isSyntheticComposite,
      explanation: isSyntheticComposite
        ? `"${inputStr}" mapped to combined sectors: ${matched.join(" + ")} (no single '${inputStr}' sector exists in Monday.com).`
        : undefined,
    };
  }

  // 2. Exact known canonical sector lookup
  const exactKnown = KNOWN_CANONICAL_SECTORS.find((s) => s.toLowerCase() === clean);
  if (exactKnown) {
    return {
      input: inputStr,
      matchedSectors: [exactKnown],
      isSyntheticComposite: false,
    };
  }

  // 3. Word-boundary search over synonym map
  for (const [key, mapped] of Object.entries(SECTOR_SYNONYM_MAP)) {
    const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(clean)) {
      const isSyntheticComposite = mapped.length > 1;
      return {
        input: inputStr,
        matchedSectors: mapped,
        isSyntheticComposite,
        explanation: isSyntheticComposite
          ? `Query keyword "${key}" resolved to combined sectors: ${mapped.join(" + ")}.`
          : undefined,
      };
    }
  }

  // 4. Word-boundary search over known sectors
  for (const known of KNOWN_CANONICAL_SECTORS) {
    const regex = new RegExp(
      `\\b${known.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    );
    if (regex.test(clean)) {
      return {
        input: inputStr,
        matchedSectors: [known],
        isSyntheticComposite: false,
      };
    }
  }

  // 5. If input is a short token (<= 2 words) and clearly NOT a natural language query sentence
  const hasSentenceWords =
    /\b(show|what|how|who|why|where|when|which|tell|give|list|revenue|deals|orders|contracted|billed|collected|pipeline|ar|status)\b/i.test(
      clean
    );
  const words = clean.split(/\s+/);
  if (!hasSentenceWords && words.length <= 2 && clean.length > 1) {
    const capitalized = inputStr
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");

    return {
      input: inputStr,
      matchedSectors: [capitalized],
      isSyntheticComposite: false,
    };
  }

  // Otherwise: no sector filter detected in query
  return {
    input: inputStr,
    matchedSectors: [],
    isSyntheticComposite: false,
  };
}

export const resolveSectorQuery = resolveSector;

/**
 * Standardize owner or personnel code lookup
 */
export function resolveOwnerCode(input: string): string {
  const clean = input.trim().toUpperCase();
  return clean;
}
