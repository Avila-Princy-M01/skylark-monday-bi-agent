import { getMondayConfig, MondayConfig } from "../config";
import { MondayDataSource } from "./source";
import { MondayGraphQLSource } from "./graphql-source";
import { MondayMcpSource } from "./mcp-source";

/**
 * Builds the configured monday.com data source.
 *
 * The brief permits either the GraphQL API or MCP. Making the transport a
 * configuration choice (MONDAY_DATA_SOURCE=graphql|mcp) keeps every downstream
 * layer — normalization, metrics, agents — transport-agnostic.
 */
export function createMondaySource(config: MondayConfig = getMondayConfig()): MondayDataSource {
  if (config.dataSource === "mcp") {
    return new MondayMcpSource({
      apiToken: config.apiToken,
      serverUrl: config.mcpServerUrl,
      apiVersion: config.apiVersion,
    });
  }

  return new MondayGraphQLSource({
    apiToken: config.apiToken,
    apiVersion: config.apiVersion,
  });
}
