export interface DateWindow {
  startDate: string; // ISO YYYY-MM-DD
  endDate: string; // ISO YYYY-MM-DD
  label: string;
  fiscalYear: string;
}

/**
 * Returns the Indian Fiscal Year string for a given date (e.g. "FY25-26" for 2025-04-01 to 2026-03-31)
 */
export function getIndianFiscalYear(date: Date): string {
  const month = date.getMonth(); // 0 = Jan, 3 = Apr
  const year = date.getFullYear();
  if (month >= 3) {
    const nextYear = (year + 1) % 100;
    return `FY${year % 100}-${String(nextYear).padStart(2, "0")}`;
  } else {
    const prevYear = (year - 1) % 100;
    return `FY${prevYear}-${String(year % 100).padStart(2, "0")}`;
  }
}

/**
 * Returns Indian fiscal quarter (Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar)
 */
export function getFiscalQuarter(date: Date): { quarter: number; label: string; fy: string } {
  const month = date.getMonth();
  const fy = getIndianFiscalYear(date);
  if (month >= 3 && month <= 5) return { quarter: 1, label: `Q1 (${fy})`, fy };
  if (month >= 6 && month <= 8) return { quarter: 2, label: `Q2 (${fy})`, fy };
  if (month >= 9 && month <= 11) return { quarter: 3, label: `Q3 (${fy})`, fy };
  return { quarter: 4, label: `Q4 (${fy})`, fy };
}

/**
 * Resolves natural language date queries into strict ISO date windows
 */
export function resolveDateWindow(query: string, asOfDateStr?: string): DateWindow {
  const now = asOfDateStr ? new Date(asOfDateStr) : new Date("2026-03-31");
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const fy = getIndianFiscalYear(now);
  const qInfo = getFiscalQuarter(now);

  const q = query.toLowerCase().trim();

  // "this quarter"
  if (q.includes("this quarter") || q.includes("current quarter")) {
    const startY = currentYear;
    const endY = currentYear;
    let startM = 3;
    let endM = 5;
    if (qInfo.quarter === 1) {
      startM = 3;
      endM = 5;
    } else if (qInfo.quarter === 2) {
      startM = 6;
      endM = 8;
    } else if (qInfo.quarter === 3) {
      startM = 9;
      endM = 11;
    } else {
      startM = 0;
      endM = 2;
    }

    const start = new Date(Date.UTC(startY, startM, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(endY, endM + 1, 0)).toISOString().slice(0, 10);
    return { startDate: start, endDate: end, label: qInfo.label, fiscalYear: fy };
  }

  // "last quarter"
  if (q.includes("last quarter") || q.includes("previous quarter")) {
    const prevQDate = new Date(now.getTime() - 90 * 86400000);
    const prevQ = getFiscalQuarter(prevQDate);
    const startY = prevQDate.getFullYear();
    let startM = 0;
    let endM = 2;
    if (prevQ.quarter === 1) {
      startM = 3;
      endM = 5;
    } else if (prevQ.quarter === 2) {
      startM = 6;
      endM = 8;
    } else if (prevQ.quarter === 3) {
      startM = 9;
      endM = 11;
    } else {
      startM = 0;
      endM = 2;
    }

    const start = new Date(Date.UTC(startY, startM, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(startY, endM + 1, 0)).toISOString().slice(0, 10);
    return { startDate: start, endDate: end, label: prevQ.label, fiscalYear: prevQ.fy };
  }

  // "FY25-26" or "fy 25-26" or "fy25"
  const fyMatch = q.match(/fy\s*(\d{2})[-–]?(\d{2})?/);
  if (fyMatch) {
    const startYr = 2000 + parseInt(fyMatch[1], 10);
    const endYr = fyMatch[2] ? 2000 + parseInt(fyMatch[2], 10) : startYr + 1;
    return {
      startDate: `${startYr}-04-01`,
      endDate: `${endYr}-03-31`,
      label: `FY${fyMatch[1]}-${String(endYr % 100).padStart(2, "0")}`,
      fiscalYear: `FY${fyMatch[1]}-${String(endYr % 100).padStart(2, "0")}`,
    };
  }

  // "last 6 months"
  if (q.includes("6 months") || q.includes("six months")) {
    const past = new Date(now.getTime() - 180 * 86400000);
    return {
      startDate: past.toISOString().slice(0, 10),
      endDate: now.toISOString().slice(0, 10),
      label: "Last 6 Months",
      fiscalYear: fy,
    };
  }

  const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const fyEndYear = fyStartYear + 1;

  return {
    startDate: `${fyStartYear}-04-01`,
    endDate: `${fyEndYear}-03-31`,
    label: `Full Fiscal Year (${fy})`,
    fiscalYear: fy,
  };
}

export const resolveIndianFiscalWindow = resolveDateWindow;
