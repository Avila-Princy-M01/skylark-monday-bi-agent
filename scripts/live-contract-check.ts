import { MondayGraphQLSource } from "../lib/monday/graphql-source";
import {
  findMissingRequiredColumns,
  REQUIRED_DEALS_COLUMNS,
  REQUIRED_WORK_ORDERS_COLUMNS,
} from "../lib/data/normalize";

async function runLiveContractCheck() {
  const token = process.env.MONDAY_API_TOKEN;
  const dealsBoardId = process.env.MONDAY_DEALS_BOARD_ID || process.env.DEALS_BOARD_ID;
  const workOrdersBoardId =
    process.env.MONDAY_WORK_ORDERS_BOARD_ID || process.env.WORK_ORDERS_BOARD_ID;

  if (!token || !dealsBoardId || !workOrdersBoardId) {
    console.log("ℹ️ Live contract check skipped: MONDAY_API_TOKEN or board IDs not set.");
    process.exit(0);
  }

  console.log("🔍 Running Live monday.com Contract & Schema Drift Verification...");
  const source = new MondayGraphQLSource({ apiToken: token });

  try {
    const dealsSchema = await source.getBoardSchema(dealsBoardId);
    const dealsMapping = source.buildColumnMapping(dealsSchema);
    const dealsCheck = findMissingRequiredColumns(REQUIRED_DEALS_COLUMNS, dealsMapping, []);

    if (dealsCheck.missing.length > 0) {
      console.error(
        `❌ Deals Board Schema Mismatch: Missing required columns: ${dealsCheck.missing.map((m) => m.field).join(", ")}`
      );
      process.exit(1);
    }
    console.log(
      `✅ Deals Board schema verified (${Object.keys(dealsMapping).length} columns discovered).`
    );

    const woSchema = await source.getBoardSchema(workOrdersBoardId);
    const woMapping = source.buildColumnMapping(woSchema);
    const woCheck = findMissingRequiredColumns(REQUIRED_WORK_ORDERS_COLUMNS, woMapping, []);

    if (woCheck.missing.length > 0) {
      console.error(
        `❌ Work Orders Board Schema Mismatch: Missing required columns: ${woCheck.missing.map((m) => m.field).join(", ")}`
      );
      process.exit(1);
    }
    console.log(
      `✅ Work Orders Board schema verified (${Object.keys(woMapping).length} columns discovered).`
    );

    console.log("🎉 Live monday.com Contract Check PASSED successfully!");
  } catch (err) {
    console.error("❌ Live monday.com API Contract check failed:", err);
    process.exit(1);
  }
}

runLiveContractCheck();
