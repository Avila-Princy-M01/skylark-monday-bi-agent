import { describe, it, expect } from "vitest";
import {
  parseQuantity,
  parseDate,
  isMaskedPlaceholderValue,
  canonicalizeDealStatus,
  categorizeDealStage,
  canonicalizeBillingStatus,
  formatInr,
} from "../lib/data/normalize";
import { generateDataQualityReport } from "../lib/data/quality-report";

describe("Data Resilience & Normalization Engine", () => {
  it("parses free-text quantities with heterogeneous units correctly", () => {
    expect(parseQuantity("5360 HA")).toEqual({ value: 5360, unit: "HA", raw: "5360 HA" });
    expect(parseQuantity("3956HA")).toEqual({ value: 3956, unit: "HA", raw: "3956HA" });
    expect(parseQuantity("2057 Acr")).toEqual({ value: 2057, unit: "Acr", raw: "2057 Acr" });
    expect(parseQuantity("98000 Acres")).toEqual({
      value: 98000,
      unit: "Acres",
      raw: "98000 Acres",
    });
    expect(parseQuantity("40MW")).toEqual({ value: 40, unit: "MW", raw: "40MW" });
    expect(parseQuantity("24 Months")).toEqual({ value: 24, unit: "Months", raw: "24 Months" });
    expect(parseQuantity("7 mines")).toEqual({ value: 7, unit: "mines", raw: "7 mines" });
    expect(parseQuantity("2 location")).toEqual({ value: 2, unit: "location", raw: "2 location" });
    expect(parseQuantity("NA")).toEqual({ value: null, unit: null, raw: "NA" });
    expect(parseQuantity("-")).toEqual({ value: null, unit: null, raw: "-" });
    expect(parseQuantity(null)).toEqual({ value: null, unit: null, raw: "" });
  });

  it("parses diverse date formats (ISO, DD/MM/YYYY, Excel serials)", () => {
    expect(parseDate("2026-02-26")).toBe("2026-02-26");
    expect(parseDate("26/02/2026")).toBe("2026-02-26");
    expect(parseDate("15-08-2025")).toBe("2025-08-15");
    expect(parseDate(45000)).toBe("2023-03-15");
    expect(parseDate("NA")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });

  it("detects masked placeholder values (~₹1) accurately", () => {
    expect(isMaskedPlaceholderValue(1.2332)).toBe(true);
    expect(isMaskedPlaceholderValue(1.455176)).toBe(true);
    expect(isMaskedPlaceholderValue(1.0)).toBe(false);
    expect(isMaskedPlaceholderValue(489360)).toBe(false);
    expect(isMaskedPlaceholderValue(null)).toBe(false);
  });

  it("canonicalizes statuses, stages and billing flags", () => {
    expect(canonicalizeDealStatus("Open")).toBe("Open");
    expect(canonicalizeDealStatus("Closed Won")).toBe("Won");
    expect(canonicalizeDealStatus("Dead")).toBe("Dead");
    expect(categorizeDealStage("A. Lead Generated")).toBe("Lead");
    expect(categorizeDealStage("B. Sales Qualified Leads")).toBe("Qualified");
    expect(categorizeDealStage("G. Project Won")).toBe("Won");
    expect(categorizeDealStage("L. Project Lost")).toBe("Lost");
    expect(canonicalizeBillingStatus("BIlled")).toBe("Billed");
    expect(canonicalizeBillingStatus("Partially Billed")).toBe("Partially Billed");
    expect(canonicalizeBillingStatus("Unbilled")).toBe("Unbilled");
  });

  it("formats founder-native Indian currency (₹ L and ₹ Cr)", () => {
    expect(formatInr(15000000)).toBe("₹1.50 Cr");
    expect(formatInr(750000)).toBe("₹7.50 L");
    expect(formatInr(50000)).toBe("₹50,000");
    expect(formatInr(-2500000)).toBe("-₹25.00 L");
  });

  it("drops junk repeated header rows and captures quality issues in DataQualityReport", () => {
    const rawDeals = [
      {
        id: "deal_1",
        name: "Naruto",
        column_values: [
          { id: "text_owner", text: "OWNER_001" },
          { id: "text_client", text: "COMPANY089" },
          { id: "status_deal", text: "Open" },
          { id: "date_close_a", text: null },
          { id: "status_prob", text: "High" },
          { id: "numbers_val", text: "489360" },
          { id: "date_close_t", text: "2026-02-26" },
          { id: "status_stage", text: "B. Sales Qualified Leads" },
          { id: "text_prod", text: "Service + Spectra" },
          { id: "text_sec", text: "Renewables" },
          { id: "date_created", text: "2025-04-10" },
        ],
      },
      // Masked placeholder value deal
      {
        id: "deal_2",
        name: "Sasuke",
        column_values: [
          { id: "text_owner", text: "OWNER_001" },
          { id: "text_client", text: "COMPANY091" },
          { id: "status_deal", text: "Open" },
          { id: "date_close_a", text: null },
          { id: "status_prob", text: "Medium" },
          { id: "numbers_val", text: "1.2332" },
          { id: "date_close_t", text: "2026-02-28" },
          { id: "status_stage", text: "B. Sales Qualified Leads" },
          { id: "text_prod", text: "Service" },
          { id: "text_sec", text: "Powerline" },
          { id: "date_created", text: "2025-05-12" },
        ],
      },
      // Junk Header Row (Nezuko)
      {
        id: "deal_3",
        name: "Nezuko",
        column_values: [
          { id: "text_owner", text: "" },
          { id: "text_client", text: null },
          { id: "status_deal", text: "Deal Status" },
          { id: "date_close_a", text: "Close Date (A)" },
          { id: "status_prob", text: "Closure Probability" },
          { id: "numbers_val", text: null },
          { id: "date_close_t", text: null },
          { id: "status_stage", text: null },
          { id: "text_prod", text: null },
          { id: "text_sec", text: null },
          { id: "date_created", text: null },
        ],
      },
    ];

    const rawWorkOrders = [
      {
        id: "wo_1",
        name: "SDPL/FY25-26/001",
        column_values: [
          { id: "text_client", text: "WOCOMPANY_001" },
          { id: "text_bdkam", text: "OWNER_001" },
          { id: "text_sector", text: "Renewables" },
          { id: "text_nature", text: "Solar Thermography" },
          { id: "date_po", text: "2025-06-01" },
          { id: "date_delivery", text: "2025-06-15" },
          { id: "numbers_order_excl", text: "1000000" },
          { id: "numbers_order_incl", text: "1180000" },
          { id: "numbers_billed_excl", text: "1200000" },
          { id: "numbers_billed_incl", text: "1416000" },
          { id: "numbers_collected_incl", text: "1416000" },
          { id: "numbers_tobe_billed", text: "-200000" }, // Over-billed negative!
          { id: "status_exec", text: "Completed" },
          { id: "status_billing", text: "BIlled" },
          { id: "text_po_qty", text: "50MW" },
          { id: "text_del_qty", text: "50MW" },
        ],
      },
    ];

    const { deals, workOrders, report } = generateDataQualityReport(rawDeals, rawWorkOrders);

    // 1. Valid deals count: Nezuko was dropped, Sasuke and Naruto kept
    expect(deals.length).toBe(2);
    expect(report.junkRowsDropped).toBe(1);

    // 2. Sasuke has masked placeholder value ₹1.2332 -> dealValue is null, isMaskedPlaceholder is true
    const sasuke = deals.find((d) => d.name === "Sasuke");
    expect(sasuke?.isMaskedPlaceholder).toBe(true);
    expect(sasuke?.dealValue).toBeNull();
    expect(report.maskedPlaceholderValuesCount).toBe(1);

    // 3. Work Orders: over-billed negative detected and recorded
    expect(workOrders.length).toBe(1);
    expect(workOrders[0].isOverBilled).toBe(true);
    expect(report.overBilledRecordsCount).toBe(1);

    // 4. Empty column Close Date (A) reported
    expect(report.emptyColumnsExcluded).toContain("Close Date (A)");
  });
});
