import { describe, it, expect } from "vitest";
import { normalizeWorkOrders } from "../lib/data/normalize";
import {
  mockWorkOrdersItems,
  mockWorkOrdersColumnMap,
} from "./fixtures/monday/work-orders.fixture";

describe("normalizeWorkOrders Unit & Schema Resilience", () => {
  it("normalizes real board schema items with non-zero financial metrics", () => {
    const { workOrders, report } = normalizeWorkOrders(
      mockWorkOrdersItems,
      mockWorkOrdersColumnMap
    );

    expect(report.totalValidWorkOrders).toBe(3);

    // Filter to the standard valid work order
    const wo1 = workOrders.find((w) => w.id === "wo_real_001");
    expect(wo1).toBeDefined();

    // Critical financial assertion: Non-zero values must be parsed from real masked columns
    expect(wo1!.orderValueExclGst).toBe(1850000);
    expect(wo1!.orderValueInclGst).toBe(2183000);
    expect(wo1!.billedAmountExclGst).toBe(1200000);
    expect(wo1!.billedAmountInclGst).toBe(1416000);
    expect(wo1!.collectedAmountInclGst).toBe(1000000);
    expect(wo1!.amountToBeBilledExclGst).toBe(650000);

    // Field mapping assertions
    expect(wo1!.clientCode).toBe("ADANI_SOLAR_01");
    expect(wo1!.bdKamPersonnelCode).toBe("OWNER_001");
    expect(wo1!.sector).toBe("Renewables");
    expect(wo1!.natureOfWork).toBe("Solar PV Thermography");
    expect(wo1!.poDate).toBe("2025-05-10");
    expect(wo1!.dataDeliveryDate).toBe("2025-06-20");
    expect(wo1!.executionStatus).toBe("In Progress");
    expect(wo1!.billingStatus).toBe("Partially Billed");
    expect(wo1!.poQuantity).toEqual({ value: 150, unit: "MW", raw: "150 MW" });
    expect(wo1!.deliveredQuantity).toEqual({ value: 100, unit: "MW", raw: "100 MW" });
    expect(wo1!.invoiceNumber).toBe("INV/2025/089");
  });

  it("identifies over-billed work orders (negative amount to be billed)", () => {
    const { workOrders, report } = normalizeWorkOrders(
      mockWorkOrdersItems,
      mockWorkOrdersColumnMap
    );

    const wo2 = workOrders.find((w) => w.id === "wo_real_002");
    expect(wo2).toBeDefined();
    expect(wo2!.isOverBilled).toBe(true);
    expect(wo2!.amountToBeBilledExclGst).toBe(-250000);
    expect(report.overBilledRecordsCount).toBe(1);

    const overBilledIssue = report.issues?.find((i) => i.type === "over_billed_negative");
    expect(overBilledIssue).toBeDefined();
    expect(overBilledIssue?.recordId).toBe("wo_real_002");
  });

  it("flags date anomalies when delivery precedes PO date", () => {
    const { workOrders, report } = normalizeWorkOrders(
      mockWorkOrdersItems,
      mockWorkOrdersColumnMap
    );

    const wo3 = workOrders.find((w) => w.id === "wo_real_003");
    expect(wo3).toBeDefined();
    expect(wo3!.hasDeliveryBeforePoAnomaly).toBe(true);
    expect(report.dateAnomaliesCount).toBe(1);

    const dateIssue = report.issues?.find((i) => i.type === "date_anomaly");
    expect(dateIssue).toBeDefined();
    expect(dateIssue?.recordId).toBe("wo_real_003");
  });

  it("filters junk header rows and empty rows cleanly", () => {
    const { workOrders, report } = normalizeWorkOrders(
      mockWorkOrdersItems,
      mockWorkOrdersColumnMap
    );

    // 5 raw items: 3 valid, 1 header row dropped, 1 blank row dropped
    expect(report.totalRawWorkOrdersRows).toBe(5);
    expect(report.totalValidWorkOrders).toBe(3);
    expect(report.junkRowsDropped).toBe(2);
    expect(workOrders.length).toBe(3);
  });

  it("loudly surfaces missing required columns in schema as critical DataQualityIssue", () => {
    // Intentionally pass a column map that is missing required money columns
    const brokenColumnMap: Record<string, string> = {
      "Customer Name Code": "text_cust",
      "BD/KAM Personnel code": "text_bdkam",
      // "Amount in Rupees (Excl of GST) (Masked)" is deliberately missing!
      // "Billed Value in Rupees (Excl of GST.) (Masked)" is deliberately missing!
    };

    const singleItem = [
      {
        id: "wo_test_broken",
        name: "SDPL/FY25-26/999",
        column_values: [
          { id: "text_cust", text: "TEST_CLIENT" },
          { id: "text_bdkam", text: "OWNER_001" },
        ],
      },
    ];

    const { report } = normalizeWorkOrders(singleItem, brokenColumnMap);

    expect(report.missingRequiredColumns).toBeDefined();
    expect(report.missingRequiredColumns).toContain("orderValueExclGst");
    expect(report.missingRequiredColumns).toContain("billedAmountExclGst");

    const missingIssues = report.issues?.filter((i) => i.type === "missing_column_in_schema");
    expect(missingIssues?.length).toBeGreaterThan(0);
    const orderValIssue = missingIssues?.find((i) => i.description.includes("orderValueExclGst"));
    expect(orderValIssue).toBeDefined();
    expect(orderValIssue?.description).toContain("CRITICAL SCHEMA MISMATCH");
  });
});
