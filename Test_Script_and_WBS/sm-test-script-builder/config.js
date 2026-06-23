import dotenv from "dotenv";
dotenv.config();

const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  matcha: {
    apiKey: process.env.MATCHA_API_KEY || "",
    baseUrl:
      process.env.BASE_URL ||
      "https://matcha.harriscomputer.com/rest/api/v1",
    workspaceId: parseInt(process.env.WORKSPACE_ID || "11797", 10),
    timeoutSeconds: parseInt(process.env.MATCHA_TIMEOUT_SECONDS || "300", 10),
    missions: {
      decomposer: parseInt(process.env.MISSION_ID_DECOMPOSER || "16131", 10),
      normaliser: parseInt(process.env.MISSION_ID_NORMALISER || "16132", 10),
      scenarioBuilder: parseInt(
        process.env.MISSION_ID_SCENARIO_BUILDER || "16130",
        10
      ),
      materialiser: parseInt(
        process.env.MISSION_ID_MATERIALISER || "16129",
        10
      ),
    },
  },
  azure: {
    clientId: process.env.AZURE_CLIENT_ID || "",
    tenantId: process.env.AZURE_TENANT_ID || "",
  },
};

export default config;
