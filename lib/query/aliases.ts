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

/**
 * Resolves a natural query sector or alias into known canonical sector names in the data.
 */
export function resolveSector(inputStr: string): SectorResolution {
  const clean = inputStr.trim().toLowerCase();

  // Exact synonym map lookup
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

  // Substring search over synonym map
  for (const [key, mapped] of Object.entries(SECTOR_SYNONYM_MAP)) {
    if (clean.includes(key)) {
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

  // Fallback: title case normalized string
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

export const resolveSectorQuery = resolveSector;

/**
 * Standardize owner or personnel code lookup
 */
export function resolveOwnerCode(input: string): string {
  const clean = input.trim().toUpperCase();
  return clean;
}
