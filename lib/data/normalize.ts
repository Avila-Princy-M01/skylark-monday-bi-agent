import {
  Deal,
  WorkOrder,
  DataQualityReport,
  DataQualityIssue,
  DealStatus,
  ClosureProbability,
  WOExecutionStatus,
  WOBillingStatus,
  ParsedQuantity,
} from "./types";

/**
 * Parses free-text quantities with units such as "5360 HA", "3956HA", "2057 Acr", "98000 Acres",
 * "40MW", "24 Months", "7 mines", "2 location", "NA", "-"
 */
export function parseQuantity(raw: string | number | null | undefined): ParsedQuantity {
  if (raw === null || raw === undefined) {
    return { value: null, unit: null, raw: "" };
  }
  const str = String(raw).trim();
  if (!str || str.toLowerCase() === "na" || str === "-" || str.toLowerCase() === "null") {
    return { value: null, unit: null, raw: str };
  }

  const match = str.match(/^([\d,]+(?:\.\d+)?)\s*([a-zA-Z\s]+)?$/);
  if (match) {
    const numStr = match[1].replace(/,/g, "");
    const val = parseFloat(numStr);
    const unit = match[2] ? match[2].trim() : null;
    return {
      value: isNaN(val) ? null : val,
      unit: unit || null,
      raw: str,
    };
  }

  return { value: null, unit: null, raw: str };
}

/**
 * Parse various date formats: ISO (YYYY-MM-DD), DD/MM/YYYY, Excel serial numbers,
 * Month Year (e.g. "Dec 2025", "December 2025").
 */
export function parseDate(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str || str.toLowerCase() === "na" || str === "-") return null;

  // 1. ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return str.slice(0, 10);
  }

  // 2. DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddmmyyyyMatch) {
    const day = ddmmyyyyMatch[1].padStart(2, "0");
    const month = ddmmyyyyMatch[2].padStart(2, "0");
    const year = ddmmyyyyMatch[3];
    const iso = `${year}-${month}-${day}`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return iso;
  }

  // 3. Excel serial date (e.g. 45000)
  const num = Number(str);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + num * 86400000);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  // 4. Standard Date parsing fallback
  const d = new Date(str);
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100) {
    return d.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Checks if a value is a masked placeholder (e.g., ₹1.2332, ₹1.455176)
 * Real deals are in thousands, lakhs or crores; masked placeholders hover around ₹1.
 */
export function isMaskedPlaceholderValue(val: number | null | undefined): boolean {
  if (val === null || val === undefined) return false;
  return val > 0.9 && val < 2.0 && String(val).includes(".");
}

/**
 * Canonicalizes string values (trim, collapse whitespace, case standardization)
 */
export function canonicalizeString(str: string | null | undefined): string {
  if (!str) return "";
  return str.trim().replace(/\s+/g, " ");
}

/**
 * Reconciles Deal Status
 */
export function canonicalizeDealStatus(statusStr: string | null | undefined): DealStatus {
  const s = canonicalizeString(statusStr).toLowerCase();
  if (s.includes("open") || s.includes("pipeline") || s.includes("active")) return "Open";
  if (s.includes("won") || s.includes("closed won")) return "Won";
  if (s.includes("lost") || s.includes("closed lost")) return "Lost";
  if (s.includes("dead") || s.includes("dropped")) return "Dead";
  if (s.includes("hold") || s.includes("paused")) return "On Hold";
  return "Unknown";
}

/**
 * Categorize stage into funnel phase
 */
export function categorizeDealStage(stageStr: string | null | undefined): Deal["stageCategory"] {
  const s = canonicalizeString(stageStr).toLowerCase();
  if (s.startsWith("a.")) return "Lead";
  if (s.startsWith("b.") || s.includes("qualified")) return "Qualified";
  if (s.startsWith("c.") || s.startsWith("d.") || s.includes("proposal") || s.includes("quote"))
    return "Proposal";
  if (s.startsWith("e.") || s.startsWith("f.") || s.includes("negotiation") || s.includes("verbal"))
    return "Negotiation";
  if (s.startsWith("g.") || s.includes("won")) return "Won";
  if (
    s.startsWith("l.") ||
    s.startsWith("n.") ||
    s.startsWith("o.") ||
    s.includes("lost") ||
    s.includes("dead")
  )
    return "Lost";
  if (s.includes("lead")) return "Lead";
  return "Other";
}

/**
 * Canonicalize Probability
 */
export function canonicalizeProbability(probStr: string | null | undefined): ClosureProbability {
  const p = canonicalizeString(probStr).toLowerCase();
  if (p.includes("high")) return "High";
  if (p.includes("med") || p.includes("mid")) return "Medium";
  if (p.includes("low")) return "Low";
  return "Unknown";
}

/**
 * Canonicalize Billing Status (handles "BIlled" -> "Billed")
 */
export function canonicalizeBillingStatus(raw: string | null | undefined): WOBillingStatus {
  const s = canonicalizeString(raw).toLowerCase();
  if (s === "billed" || s === "billed." || s.includes("billed")) {
    if (s.includes("part")) return "Partially Billed";
    if (s.includes("unbilled") || s.includes("not billed")) return "Unbilled";
    return "Billed";
  }
  if (s.includes("unbilled")) return "Unbilled";
  return "Unknown";
}

/**
 * Canonicalize Execution Status
 */
export function canonicalizeExecutionStatus(raw: string | null | undefined): WOExecutionStatus {
  const s = canonicalizeString(raw).toLowerCase();
  if (s.includes("completed") || s.includes("done") || s.includes("executed")) return "Completed";
  if (s.includes("progress") || s.includes("ongoing")) return "In Progress";
  if (s.includes("not started") || s.includes("pending")) return "Not Started";
  if (s.includes("hold")) return "On Hold";
  if (s.includes("cancelled") || s.includes("dropped")) return "Cancelled";
  return "Unknown";
}

/**
 * Checks if a raw deal row is a junk header row (e.g. Nezuko / Bugs Bunny header repetitions)
 */
export function isJunkHeaderRow(name: string, row: Record<string, unknown>): boolean {
  const n = canonicalizeString(name).toLowerCase();
  if (n === "nezuko" || n === "bugs bunny") return true;

  const headerKeywords = [
    "deal status",
    "close date (a)",
    "closure probability",
    "masked deal value",
    "tentative close date",
    "deal stage",
    "product deal",
    "sector/service",
    "work order no",
    "order value",
  ];

  let matches = 0;
  for (const val of Object.values(row)) {
    if (typeof val === "string") {
      const v = val.toLowerCase().trim();
      if (headerKeywords.some((k) => v === k)) {
        matches++;
      }
    }
  }

  return matches >= 2;
}

export interface RawMondayItem {
  id: string;
  name: string;
  column_values?: Array<{
    id: string;
    text?: string | null;
    value?: string | null;
  }>;
}

export interface RequiredColumnDef {
  field: string;
  candidates: string[];
  immutableIds?: string[];
  severity: "critical" | "warning";
}

export const REQUIRED_DEALS_COLUMNS: RequiredColumnDef[] = [
  {
    field: "dealValue",
    candidates: ["Masked Deal value", "Deal value", "Deal Value", "numbers_val"],
    immutableIds: ["numbers_val", "numbers", "numbers_1", "numeric_val"],
    severity: "critical",
  },
  {
    field: "status",
    candidates: ["Deal Status", "status_deal", "Deal status", "Status"],
    immutableIds: ["status_deal", "status", "status_1"],
    severity: "critical",
  },
  {
    field: "tentativeCloseDate",
    candidates: ["Tentative Close Date", "Tentative close date", "date_close_t", "Close Date"],
    immutableIds: ["date_close_t", "date4", "date_1", "date"],
    severity: "warning",
  },
  {
    field: "clientCode",
    candidates: ["Client Code", "Customer Name Code", "text_client", "Client"],
    immutableIds: ["text_client", "text", "text_1"],
    severity: "warning",
  },
];

export const REQUIRED_WORK_ORDERS_COLUMNS: RequiredColumnDef[] = [
  {
    field: "orderValueExclGst",
    candidates: [
      "Amount in Rupees (Excl of GST) (Masked)",
      "Order Value (Excl. GST)",
      "Order Value (Excl GST)",
      "Amount (Excl. GST)",
      "numbers_order_excl",
    ],
    immutableIds: ["numbers_order_excl", "numbers", "numbers_1"],
    severity: "critical",
  },
  {
    field: "billedAmountExclGst",
    candidates: [
      "Billed Value in Rupees (Excl of GST.) (Masked)",
      "Billed Value in Rupees (Excl of GST) (Masked)",
      "Billed Value (Excl. GST)",
      "Billed Amount (Excl. GST)",
      "numbers_billed_excl",
    ],
    immutableIds: ["numbers_billed_excl", "numbers_2"],
    severity: "critical",
  },
  {
    field: "collectedAmountInclGst",
    candidates: [
      "Collected Amount in Rupees (Incl of GST.) (Masked)",
      "Collected Amount (Incl. GST)",
      "Collected Amount (Incl GST)",
      "Collected Amount",
      "numbers_collected_incl",
    ],
    immutableIds: ["numbers_collected_incl", "numbers_3"],
    severity: "critical",
  },
  {
    field: "amountToBeBilledExclGst",
    candidates: [
      "Amount to be billed in Rs. (Exl. of GST) (Masked)",
      "Amount to be Billed (Excl. GST)",
      "Amount to be Billed",
      "numbers_tobe_billed",
    ],
    immutableIds: ["numbers_tobe_billed", "numbers_4"],
    severity: "warning",
  },
  {
    field: "clientCode",
    candidates: ["Customer Name Code", "Client Code", "text_client", "Customer"],
    immutableIds: ["text_client", "text", "text_1", "customer_name"],
    severity: "warning",
  },
  {
    field: "poDate",
    candidates: ["Date of PO/LOI", "PO Date", "PO/LOI Date", "date_po"],
    immutableIds: ["date_po", "date_1", "date"],
    severity: "warning",
  },
];

export function findMissingRequiredColumns(
  requiredCols: RequiredColumnDef[],
  columnMap: Record<string, string>,
  sampleItems: RawMondayItem[]
): { missing: RequiredColumnDef[]; present: string[]; driftWarnings: DataQualityIssue[] } {
  if (sampleItems.length === 0) return { missing: [], present: [], driftWarnings: [] };

  const knownKeys = new Set<string>();
  for (const k of Object.keys(columnMap)) {
    knownKeys.add(k.trim().toLowerCase());
  }

  for (const item of sampleItems.slice(0, 10)) {
    if (item.column_values) {
      for (const cv of item.column_values) {
        if (cv.id) knownKeys.add(cv.id.trim().toLowerCase());
      }
    }
  }

  const missing: RequiredColumnDef[] = [];
  const present: string[] = [];
  const driftWarnings: DataQualityIssue[] = [];

  for (const def of requiredCols) {
    const isImmutableMatched = def.immutableIds?.some((id) =>
      knownKeys.has(id.trim().toLowerCase())
    );
    const isCandidateMatched = def.candidates.some((c) => knownKeys.has(c.trim().toLowerCase()));

    if (isImmutableMatched || isCandidateMatched) {
      present.push(def.field);
      // If matched via secondary candidate and not immutable ID or primary candidate, flag drift warning
      if (!isImmutableMatched && !knownKeys.has(def.candidates[0].trim().toLowerCase())) {
        driftWarnings.push({
          type: "schema_drift_warning",
          board: def.field.startsWith("deal") || def.field === "status" ? "deals" : "work_orders",
          description: `Schema drift warning: Field '${def.field}' resolved via fallback alias instead of primary column '${def.candidates[0]}'.`,
          details: { field: def.field, primaryCandidate: def.candidates[0] },
        });
      }
    } else {
      missing.push(def);
    }
  }

  return { missing, present, driftWarnings };
}

/**
 * Normalize Deals dataset with full data quality auditing
 */
export function normalizeDeals(
  rawItems: RawMondayItem[],
  columnMap: Record<string, string> = {}
): { deals: Deal[]; report: Partial<DataQualityReport> } {
  const deals: Deal[] = [];
  const issues: DataQualityIssue[] = [];
  let junkRowsDropped = 0;
  let maskedValuesCount = 0;
  let maskedSumExcluded = 0;
  let statusStageContradictions = 0;
  let nearDuplicatesCount = 0;

  const seenHashes = new Set<string>();
  let closeDateANonEmptyCount = 0;

  // Schema Validation: Ensure required columns are present in schema
  const missingColsResult = findMissingRequiredColumns(REQUIRED_DEALS_COLUMNS, columnMap, rawItems);
  const missingRequiredColumns: string[] = [];
  for (const miss of missingColsResult.missing) {
    missingRequiredColumns.push(miss.field);
    issues.push({
      type: "missing_column_in_schema",
      board: "deals",
      description: `CRITICAL SCHEMA MISMATCH: Expected column for '${miss.field}' was not found in Deals board schema. Looked for: [${miss.candidates.join(", ")}]. Values default to 0 or null. Check board column titles.`,
      details: { field: miss.field, candidates: miss.candidates, severity: miss.severity },
    });
  }
  issues.push(...missingColsResult.driftWarnings);

  for (const item of rawItems) {
    const colDict: Record<string, string | null> = {};
    if (item.column_values) {
      for (const cv of item.column_values) {
        colDict[cv.id] = cv.text ?? null;
      }
    }

    const getVal = (colName: string, immutableIds: string[] = []): string | null => {
      for (const immId of immutableIds) {
        if (colDict[immId] !== undefined && colDict[immId] !== null) {
          return colDict[immId];
        }
      }
      const colId = columnMap[colName] || colName;
      if (colDict[colId] !== undefined && colDict[colId] !== null) {
        return colDict[colId];
      }
      const lowerKey = Object.keys(columnMap).find(
        (k) => k.toLowerCase().trim() === colName.toLowerCase().trim()
      );
      if (
        lowerKey &&
        colDict[columnMap[lowerKey]] !== undefined &&
        colDict[columnMap[lowerKey]] !== null
      ) {
        return colDict[columnMap[lowerKey]];
      }
      return null;
    };

    const rawName = item.name || "";
    const rawOwner = getVal("Owner code") || getVal("text_owner") || "";
    const rawClient = getVal("Client Code") || getVal("text_client") || "";
    const rawStatus = getVal("Deal Status") || getVal("status_deal") || "";
    const rawCloseDateA = getVal("Close Date (A)") || getVal("date_close_a") || "";
    const rawProb = getVal("Closure Probability") || getVal("status_prob") || "";
    const rawValStr = getVal("Masked Deal value") || getVal("numbers_val") || "";
    const rawCloseDateT = getVal("Tentative Close Date") || getVal("date_close_t") || "";
    const rawStage = getVal("Deal Stage") || getVal("status_stage") || "";
    const rawProd = getVal("Product deal") || getVal("text_prod") || "";
    const rawSec = getVal("Sector/service") || getVal("text_sec") || "";
    const rawCreated = getVal("Created Date") || getVal("date_created") || "";

    if (isJunkHeaderRow(rawName, { rawStatus, rawCloseDateA, rawProb, rawStage })) {
      junkRowsDropped++;
      issues.push({
        type: "junk_row_dropped",
        board: "deals",
        recordId: item.id,
        description: `Dropped junk repeated header row: "${rawName}"`,
      });
      continue;
    }

    if (rawCloseDateA && rawCloseDateA.trim()) {
      closeDateANonEmptyCount++;
    }

    let dealValue: number | null = null;
    let isMasked = false;
    if (rawValStr) {
      const cleanNum = parseFloat(rawValStr.replace(/,/g, ""));
      if (!isNaN(cleanNum)) {
        if (isMaskedPlaceholderValue(cleanNum)) {
          isMasked = true;
          maskedValuesCount++;
          maskedSumExcluded += cleanNum;
          dealValue = null;
          issues.push({
            type: "masked_placeholder_value",
            board: "deals",
            recordId: item.id,
            description: `Excluded masked placeholder value ₹${cleanNum} for deal "${rawName}". Treated as undisclosed.`,
          });
        } else {
          dealValue = cleanNum;
        }
      }
    }

    const status = canonicalizeDealStatus(rawStatus);
    const stage = canonicalizeString(rawStage);
    const stageCategory = categorizeDealStage(stage);
    const probability = canonicalizeProbability(rawProb);
    const tentativeCloseDate = parseDate(rawCloseDateT);
    const createdDate = parseDate(rawCreated);

    if (
      (status === "Dead" || status === "Lost") &&
      (stageCategory === "Won" || stage.toLowerCase().includes("won"))
    ) {
      statusStageContradictions++;
      issues.push({
        type: "status_stage_contradiction",
        board: "deals",
        recordId: item.id,
        description: `Contradiction in deal "${rawName}": Status="${rawStatus}" conflicts with Stage="${rawStage}". Prioritizing Stage for funnel and Status for active state.`,
      });
    } else if (
      status === "Won" &&
      (stageCategory === "Lead" || stage.toLowerCase().includes("lead"))
    ) {
      statusStageContradictions++;
      issues.push({
        type: "status_stage_contradiction",
        board: "deals",
        recordId: item.id,
        description: `Contradiction in deal "${rawName}": Status="Won" with early Stage="${rawStage}".`,
      });
    }

    const dedupHash = `${rawName.trim().toLowerCase()}|${rawClient.trim().toLowerCase()}|${dealValue ?? "masked"}|${tentativeCloseDate ?? "none"}`;
    let isDuplicate = false;
    if (seenHashes.has(dedupHash)) {
      nearDuplicatesCount++;
      isDuplicate = true;
      issues.push({
        type: "near_duplicate_detected",
        board: "deals",
        recordId: item.id,
        description: `Near-duplicate deal detected: "${rawName}" for client "${rawClient}" with value ₹${dealValue}. Retained with flag.`,
      });
    } else {
      seenHashes.add(dedupHash);
    }

    deals.push({
      id: item.id,
      name: rawName.trim(),
      ownerCode: canonicalizeString(rawOwner),
      clientCode: canonicalizeString(rawClient),
      status,
      rawStatus,
      probability,
      rawProbability: rawProb,
      dealValue,
      isMaskedPlaceholder: isMasked,
      rawDealValue: rawValStr,
      tentativeCloseDate,
      rawTentativeCloseDate: rawCloseDateT,
      stage,
      stageCategory,
      product: canonicalizeString(rawProd),
      sector: canonicalizeString(rawSec),
      createdDate,
      rawCreatedDate: rawCreated,
      dedupHash,
      isDuplicate,
    });
  }

  const emptyCols: string[] = [];
  if (closeDateANonEmptyCount === 0 && rawItems.length > 0) {
    emptyCols.push("Close Date (A)");
    issues.push({
      type: "empty_column_excluded",
      board: "deals",
      description: `Column "Close Date (A)" is 100% empty across all records. Excluded from all business logic.`,
    });
  }

  return {
    deals,
    report: {
      totalRawDealsRows: rawItems.length,
      totalValidDeals: deals.length,
      junkRowsDropped,
      emptyColumnsExcluded: emptyCols,
      missingRequiredColumns,
      maskedPlaceholderValuesCount: maskedValuesCount,
      maskedPlaceholderTotalSumExcluded: maskedSumExcluded,
      statusStageContradictionsCount: statusStageContradictions,
      nearDuplicatesCount,
      issues,
    },
  };
}

/**
 * Normalize Work Orders dataset with full data quality auditing
 */
export function normalizeWorkOrders(
  rawItems: RawMondayItem[],
  columnMap: Record<string, string> = {}
): { workOrders: WorkOrder[]; report: Partial<DataQualityReport> } {
  const workOrders: WorkOrder[] = [];
  const issues: DataQualityIssue[] = [];
  let junkRowsDropped = 0;
  let overBilledCount = 0;
  let dateAnomaliesCount = 0;
  let nearDuplicatesCount = 0;

  // Schema Validation: Ensure required columns are present in schema
  const missingColsResult = findMissingRequiredColumns(
    REQUIRED_WORK_ORDERS_COLUMNS,
    columnMap,
    rawItems
  );
  const missingRequiredColumns: string[] = [];
  for (const miss of missingColsResult.missing) {
    missingRequiredColumns.push(miss.field);
    issues.push({
      type: "missing_column_in_schema",
      board: "work_orders",
      description: `CRITICAL SCHEMA MISMATCH: Expected column for '${miss.field}' was not found in Work Orders board schema. Looked for: [${miss.candidates.join(", ")}]. Values default to 0 or null. Check board column titles.`,
      details: { field: miss.field, candidates: miss.candidates, severity: miss.severity },
    });
  }
  issues.push(...missingColsResult.driftWarnings);

  const seenHashes = new Set<string>();

  for (const item of rawItems) {
    const colDict: Record<string, string | null> = {};
    if (item.column_values) {
      for (const cv of item.column_values) {
        colDict[cv.id] = cv.text ?? null;
      }
    }

    const getVal = (colName: string, immutableIds: string[] = []): string | null => {
      for (const immId of immutableIds) {
        if (colDict[immId] !== undefined && colDict[immId] !== null) {
          return colDict[immId];
        }
      }
      const colId = columnMap[colName] || colName;
      if (colDict[colId] !== undefined && colDict[colId] !== null) {
        return colDict[colId];
      }
      const lowerKey = Object.keys(columnMap).find(
        (k) => k.toLowerCase().trim() === colName.toLowerCase().trim()
      );
      if (
        lowerKey &&
        colDict[columnMap[lowerKey]] !== undefined &&
        colDict[columnMap[lowerKey]] !== null
      ) {
        return colDict[columnMap[lowerKey]];
      }
      return null;
    };

    const rawWoNum = item.name || getVal("Work Order Number") || "";
    // "Customer Name Code" is the actual Monday column title (was "Client Code")
    const rawClient =
      getVal("Customer Name Code") || getVal("Client Code") || getVal("text_client") || "";
    const rawBdKam = getVal("BD/KAM Personnel code") || getVal("text_bdkam") || "";
    const rawSector = getVal("Sector") || getVal("text_sector") || "";
    const rawNature = getVal("Nature of Work") || getVal("text_nature") || "";
    // "Date of PO/LOI" is the actual Monday column title (was "PO Date")
    const rawPoDate = getVal("Date of PO/LOI") || getVal("PO Date") || getVal("date_po") || "";
    const rawDeliveryDate = getVal("Data Delivery Date") || getVal("date_delivery") || "";
    // Actual Monday column titles include "(Masked)" suffix
    const rawOrderValExcl =
      getVal("Amount in Rupees (Excl of GST) (Masked)") ||
      getVal("Order Value (Excl. GST)") ||
      getVal("numbers_order_excl") ||
      "0";
    const rawOrderValIncl =
      getVal("Amount in Rupees (Incl of GST) (Masked)") ||
      getVal("Order Value (Incl. GST)") ||
      getVal("numbers_order_incl") ||
      "0";
    const rawBilledExcl =
      getVal("Billed Value in Rupees (Excl of GST.) (Masked)") ||
      getVal("Billed Amount (Excl. GST)") ||
      getVal("numbers_billed_excl") ||
      "0";
    const rawBilledIncl =
      getVal("Billed Value in Rupees (Incl of GST.) (Masked)") ||
      getVal("Billed Amount (Incl. GST)") ||
      getVal("numbers_billed_incl") ||
      "0";
    const rawCollectedIncl =
      getVal("Collected Amount in Rupees (Incl of GST.) (Masked)") ||
      getVal("Collected Amount (Incl. GST)") ||
      getVal("numbers_collected_incl") ||
      "0";
    const rawAmountToBeBilled =
      getVal("Amount to be billed in Rs. (Exl. of GST) (Masked)") ||
      getVal("Amount to be Billed (Excl. GST)") ||
      getVal("numbers_tobe_billed") ||
      "0";
    const rawExecStatus = getVal("Execution Status") || getVal("status_exec") || "";
    const rawBillingStatus =
      getVal("Billing Status") || getVal("WO Status (billed)") || getVal("status_billing") || "";
    // "Quantities as per PO" is the actual Monday column title (was "PO Quantity")
    const rawPoQty =
      getVal("Quantities as per PO") || getVal("PO Quantity") || getVal("text_po_qty") || "";
    // "Quantity billed (till date)" is the actual Monday column title (was "Delivered Quantity")
    const rawDeliveredQty =
      getVal("Quantity billed (till date)") ||
      getVal("Delivered Quantity") ||
      getVal("text_del_qty") ||
      "";
    // "latest invoice no." is the actual Monday column title (was "Invoice Number")
    const rawInvoiceNum =
      getVal("latest invoice no.") || getVal("Invoice Number") || getVal("text_invoice") || null;

    if (!rawWoNum && !rawClient && !rawBdKam) {
      junkRowsDropped++;
      issues.push({
        type: "junk_row_dropped",
        board: "work_orders",
        recordId: item.id,
        description: "Dropped blank work order row",
      });
      continue;
    }

    if (
      rawWoNum.toLowerCase().includes("work order") ||
      rawWoNum.toLowerCase().includes("header")
    ) {
      junkRowsDropped++;
      issues.push({
        type: "junk_row_dropped",
        board: "work_orders",
        recordId: item.id,
        description: `Dropped repeated header row: "${rawWoNum}"`,
      });
      continue;
    }

    const parseMoney = (s: string) => {
      const clean = parseFloat(s.replace(/,/g, ""));
      return isNaN(clean) ? 0 : clean;
    };

    const orderValueExclGst = parseMoney(rawOrderValExcl);
    const orderValueInclGst = parseMoney(rawOrderValIncl);
    const billedAmountExclGst = parseMoney(rawBilledExcl);
    const billedAmountInclGst = parseMoney(rawBilledIncl);
    const collectedAmountInclGst = parseMoney(rawCollectedIncl);
    const amountToBeBilledExclGst = parseMoney(rawAmountToBeBilled);

    const isOverBilled = amountToBeBilledExclGst < 0;
    if (isOverBilled) {
      overBilledCount++;
      issues.push({
        type: "over_billed_negative",
        board: "work_orders",
        recordId: item.id,
        description: `Work order "${rawWoNum}" has negative amount to be billed: ₹${amountToBeBilledExclGst}. Flagged as over-billed.`,
      });
    }

    const uncollectedAmountInclGst = billedAmountInclGst - collectedAmountInclGst;

    const poDate = parseDate(rawPoDate);
    const dataDeliveryDate = parseDate(rawDeliveryDate);

    let hasDeliveryBeforePoAnomaly = false;
    if (poDate && dataDeliveryDate && new Date(dataDeliveryDate) < new Date(poDate)) {
      hasDeliveryBeforePoAnomaly = true;
      dateAnomaliesCount++;
      issues.push({
        type: "date_anomaly",
        board: "work_orders",
        recordId: item.id,
        description: `Date anomaly in work order "${rawWoNum}": Delivery date (${dataDeliveryDate}) precedes PO date (${poDate}).`,
      });
    }

    const poQuantity = parseQuantity(rawPoQty);
    const deliveredQuantity = parseQuantity(rawDeliveredQty);

    const dedupHash = `${rawWoNum.trim().toLowerCase()}|${rawClient.trim().toLowerCase()}|${orderValueExclGst}`;
    let isDuplicate = false;
    if (seenHashes.has(dedupHash)) {
      nearDuplicatesCount++;
      isDuplicate = true;
      issues.push({
        type: "near_duplicate_detected",
        board: "work_orders",
        recordId: item.id,
        description: `Duplicate work order detected: "${rawWoNum}"`,
      });
    } else {
      seenHashes.add(dedupHash);
    }

    workOrders.push({
      id: item.id,
      workOrderNumber: rawWoNum.trim(),
      clientCode: canonicalizeString(rawClient),
      bdKamPersonnelCode: canonicalizeString(rawBdKam),
      sector: canonicalizeString(rawSector),
      natureOfWork: canonicalizeString(rawNature),
      poDate,
      rawPoDate,
      dataDeliveryDate,
      rawDeliveryDate,
      orderValueExclGst,
      orderValueInclGst,
      billedAmountExclGst,
      billedAmountInclGst,
      collectedAmountInclGst,
      amountToBeBilledExclGst,
      isOverBilled,
      uncollectedAmountInclGst,
      executionStatus: canonicalizeExecutionStatus(rawExecStatus),
      billingStatus: canonicalizeBillingStatus(rawBillingStatus),
      poQuantity,
      deliveredQuantity,
      invoiceNumber: rawInvoiceNum ? rawInvoiceNum.trim() : null,
      hasDeliveryBeforePoAnomaly,
      dedupHash,
      isDuplicate,
    });
  }

  return {
    workOrders,
    report: {
      totalRawWorkOrdersRows: rawItems.length,
      totalValidWorkOrders: workOrders.length,
      junkRowsDropped,
      missingRequiredColumns,
      overBilledRecordsCount: overBilledCount,
      dateAnomaliesCount,
      nearDuplicatesCount,
      issues,
    },
  };
}

/**
 * Format currency in Indian notation: ₹ Lakhs (L) and ₹ Crores (Cr)
 */
export function formatInr(amount: number): string {
  const isNeg = amount < 0;
  const abs = Math.abs(amount);

  if (abs >= 10000000) {
    const cr = abs / 10000000;
    return `${isNeg ? "-" : ""}₹${cr.toFixed(2)} Cr`;
  }
  if (abs >= 100000) {
    const lakh = abs / 100000;
    return `${isNeg ? "-" : ""}₹${lakh.toFixed(2)} L`;
  }
  return `${isNeg ? "-" : ""}₹${abs.toLocaleString("en-IN")}`;
}
