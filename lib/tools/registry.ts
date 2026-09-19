import { z } from "zod";
import { Deal, WorkOrder } from "../data/types";
import { computePipelineHealth, getStalledDeals } from "../metrics/pipeline";
import { computeRevenueMetrics } from "../metrics/revenue";
import { computeCollectionsMetrics } from "../metrics/collections";
import { computeOperationsMetrics } from "../metrics/operations";
import { computeCrossBoardMetrics } from "../metrics/cross-board";
import { computeConcentrationRisk } from "../metrics/concentration";
import { computeStuckMoney } from "../metrics/stuck-money";
import { resolveSectorQuery } from "../query/aliases";
import { resolveIndianFiscalWindow } from "../query/fiscal";

export interface ToolContext {
  deals: Deal[];
  workOrders: WorkOrder[];
  asOfDate?: string;
}

export const PipelineHealthInputSchema = z.object({
  sector: z
    .array(z.string())
    .optional()
    .describe("List of sectors to filter by, e.g. ['Renewables', 'Powerline']"),
  ownerCode: z.string().optional().describe("Owner code, e.g. 'OWNER_001'"),
  stageCategory: z
    .enum(["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost", "Other"])
    .optional(),
  asOfDate: z.string().optional().describe("As-of date ISO YYYY-MM-DD"),
});

export const StalledDealsInputSchema = z.object({
  asOfDate: z.string().optional(),
  sector: z.array(z.string()).optional(),
  ownerCode: z.string().optional(),
});

export const RevenueInputSchema = z.object({
  sector: z.array(z.string()).optional(),
  bdKamPersonnelCode: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  asOfDate: z.string().optional(),
});

export const CollectionsInputSchema = z.object({
  sector: z.array(z.string()).optional(),
  bdKamPersonnelCode: z.string().optional(),
  asOfDate: z.string().optional(),
});

export const OperationsInputSchema = z.object({
  sector: z.array(z.string()).optional(),
  asOfDate: z.string().optional(),
});

export const CrossBoardInputSchema = z.object({
  asOfDate: z.string().optional(),
});

export const ConcentrationInputSchema = z.object({
  topN: z.number().optional().default(5),
  asOfDate: z.string().optional(),
});

export const StuckMoneyInputSchema = z.object({
  asOfDate: z.string().optional(),
});

export const FiscalResolverInputSchema = z.object({
  expression: z
    .string()
    .describe("Time expression like 'this quarter', 'last quarter', 'FY25-26', 'YTD'"),
  asOfDate: z.string().optional(),
});

export const SectorResolverInputSchema = z.object({
  query: z.string().describe("User input query string, e.g. 'energy', 'solar', 'wind'"),
});

export function createDeterministicToolRegistry(ctx: ToolContext) {
  return {
    resolve_sector_alias: {
      description: "Resolves aliases like 'energy' to concrete sectors ['Renewables', 'Powerline']",
      parameters: SectorResolverInputSchema,
      execute: async (args: z.infer<typeof SectorResolverInputSchema>) => {
        return resolveSectorQuery(args.query);
      },
    },

    resolve_fiscal_window: {
      description:
        "Resolves natural time queries into Indian Fiscal Year date ranges (April to March)",
      parameters: FiscalResolverInputSchema,
      execute: async (args: z.infer<typeof FiscalResolverInputSchema>) => {
        return resolveIndianFiscalWindow(args.expression, args.asOfDate || ctx.asOfDate);
      },
    },

    get_pipeline_health: {
      description:
        "Calculates total open pipeline value, weighted pipeline, deal counts, and median/mean size",
      parameters: PipelineHealthInputSchema,
      execute: async (args: z.infer<typeof PipelineHealthInputSchema>) => {
        return computePipelineHealth(ctx.deals, {
          sector: args.sector,
          ownerCode: args.ownerCode,
          stageCategory: args.stageCategory,
          asOfDate: args.asOfDate || ctx.asOfDate,
        });
      },
    },

    get_stalled_deals: {
      description: "Calculates stalled deals whose tentative close date is past the as-of date",
      parameters: StalledDealsInputSchema,
      execute: async (args: z.infer<typeof StalledDealsInputSchema>) => {
        return getStalledDeals(ctx.deals, {
          asOfDate: args.asOfDate || ctx.asOfDate,
          sector: args.sector,
          ownerCode: args.ownerCode,
        });
      },
    },

    get_revenue_metrics: {
      description: "Computes pre-tax contracted order value, billed revenue, and cash collections",
      parameters: RevenueInputSchema,
      execute: async (args: z.infer<typeof RevenueInputSchema>) => {
        return computeRevenueMetrics(ctx.workOrders, {
          sector: args.sector,
          bdKamPersonnelCode: args.bdKamPersonnelCode,
          startDate: args.startDate,
          endDate: args.endDate,
          asOfDate: args.asOfDate || ctx.asOfDate,
        });
      },
    },

    get_collections_and_ar: {
      description: "Computes collection efficiency %, outstanding AR, and top AR-risk accounts",
      parameters: CollectionsInputSchema,
      execute: async (args: z.infer<typeof CollectionsInputSchema>) => {
        return computeCollectionsMetrics(ctx.workOrders, {
          sector: args.sector,
          bdKamPersonnelCode: args.bdKamPersonnelCode,
          asOfDate: args.asOfDate || ctx.asOfDate,
        });
      },
    },

    get_operational_metrics: {
      description:
        "Computes execution status distribution, unstarted WOs past PO dates, and software attach rate",
      parameters: OperationsInputSchema,
      execute: async (args: z.infer<typeof OperationsInputSchema>) => {
        return computeOperationsMetrics(ctx.workOrders, {
          sector: args.sector,
          asOfDate: args.asOfDate || ctx.asOfDate,
        });
      },
    },

    get_cross_board_scorecards: {
      description: "Computes joined scorecards for Owner and Sector across deals and work orders",
      parameters: CrossBoardInputSchema,
      execute: async (args: z.infer<typeof CrossBoardInputSchema>) => {
        return computeCrossBoardMetrics(ctx.deals, ctx.workOrders, {
          asOfDate: args.asOfDate || ctx.asOfDate,
        });
      },
    },

    get_concentration_risk: {
      description: "Computes client and owner share of open pipeline and order book",
      parameters: ConcentrationInputSchema,
      execute: async (args: z.infer<typeof ConcentrationInputSchema>) => {
        return computeConcentrationRisk(ctx.deals, ctx.workOrders, {
          topN: args.topN,
          asOfDate: args.asOfDate || ctx.asOfDate,
        });
      },
    },

    get_stuck_money_analysis: {
      description:
        "Computes where money is trapped in the conversion chain from won deals to uncollected AR",
      parameters: StuckMoneyInputSchema,
      execute: async (args: z.infer<typeof StuckMoneyInputSchema>) => {
        return computeStuckMoney(ctx.deals, ctx.workOrders, {
          asOfDate: args.asOfDate || ctx.asOfDate,
        });
      },
    },
  };
}
