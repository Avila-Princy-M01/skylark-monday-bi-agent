export type DealStatus = "Open" | "Won" | "Lost" | "Dead" | "On Hold" | "Unknown";

export type ClosureProbability = "High" | "Medium" | "Low" | "Unknown";

export interface ParsedQuantity {
  value: number | null;
  unit: string | null;
  raw: string;
}

export interface Deal {
  id: string;
  name: string;
  ownerCode: string;
  clientCode: string;
  status: DealStatus;
  rawStatus: string;
  probability: ClosureProbability;
  rawProbability: string;
  dealValue: number | null; // null if masked placeholder (approx 1) or missing
  isMaskedPlaceholder: boolean; // e.g. 1.2332, 1.455176
  rawDealValue: string | null;
  tentativeCloseDate: string | null; // ISO YYYY-MM-DD
  rawTentativeCloseDate: string | null;
  stage: string; // e.g. "B. Sales Qualified Leads", "G. Project Won"
  stageCategory: "Lead" | "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost" | "Other";
  product: string;
  sector: string;
  createdDate: string | null; // ISO YYYY-MM-DD
  rawCreatedDate: string | null;
  dedupHash: string;
  isDuplicate?: boolean;
}

export type WOExecutionStatus =
  "Completed" | "In Progress" | "Not Started" | "On Hold" | "Cancelled" | "Unknown";

export type WOBillingStatus = "Billed" | "Partially Billed" | "Unbilled" | "Unknown";

export interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientCode: string;
  bdKamPersonnelCode: string; // join key with Deal ownerCode
  sector: string;
  natureOfWork: string;
  poDate: string | null; // ISO YYYY-MM-DD
  rawPoDate: string | null;
  dataDeliveryDate: string | null; // ISO YYYY-MM-DD
  rawDeliveryDate: string | null;
  orderValueExclGst: number;
  orderValueInclGst: number;
  billedAmountExclGst: number;
  billedAmountInclGst: number;
  collectedAmountInclGst: number;
  amountToBeBilledExclGst: number;
  isOverBilled: boolean; // true if amountToBeBilled < 0
  uncollectedAmountInclGst: number;
  executionStatus: WOExecutionStatus;
  billingStatus: WOBillingStatus;
  poQuantity: ParsedQuantity;
  deliveredQuantity: ParsedQuantity;
  invoiceNumber: string | null;
  hasDeliveryBeforePoAnomaly: boolean;
  dedupHash: string;
  isDuplicate?: boolean;
}

export interface DataQualityIssue {
  type:
    | "junk_row_dropped"
    | "empty_column_excluded"
    | "masked_placeholder_value"
    | "over_billed_negative"
    | "date_anomaly"
    | "status_stage_contradiction"
    | "near_duplicate_detected"
    | "canonicalized_value"
    | "unparsed_quantity";
  description: string;
  recordId?: string;
  board: "deals" | "work_orders";
  details?: Record<string, unknown>;
}

export interface DataQualityReport {
  totalRawDealsRows: number;
  totalValidDeals: number;
  totalRawWorkOrdersRows: number;
  totalValidWorkOrders: number;
  junkRowsDropped: number;
  emptyColumnsExcluded: string[];
  maskedPlaceholderValuesCount: number;
  maskedPlaceholderTotalSumExcluded: number;
  overBilledRecordsCount: number;
  dateAnomaliesCount: number;
  statusStageContradictionsCount: number;
  nearDuplicatesCount: number;
  issues: DataQualityIssue[];
  generatedAt: string;
}

export interface MetricFactSheet {
  numbers: Record<string, number>;
  sourceRowIds: string[];
  rowsScanned: number;
  assumptions: string[];
  caveats: string[];
  asOfDate: string;
  fiscalYear: string;
  basis?: string;
}
