import { defineEventHandler, getQuery } from "h3";
import axios from "axios";
import dotenv from "dotenv";
import { execSync } from "child_process";

dotenv.config();

interface UnusedResources {
  unusedPublicIPs: string[];
  unusedNSGs: string[];
  unusedLoadBalancers: string[];
}

export interface SeasonalityPattern {
  type: "weekly" | "monthly" | "daily";
  description: string;
  impact: string;
}

interface CognitiveServicesData {
  metrics: { resourceName: string; metrics: any }[];
  recommendations: string[];
}

interface GrafanaData {
  metrics: { resourceName: string; metrics: any }[];
  recommendations: string[];
}

interface UnderutilizedVMs {
  recommendations: string[];
}

interface ServiceCost {
  service: string;
  cost: number;
}

interface IndustryBenchmark {
  service: string;
  averageCostPerUnit: number;
  unitType: 'GB' | 'vCPU' | 'Transaction' | 'Hour';
  percentile50: number;
  percentile90: number;
}

export interface MultiCloudBenchmark {
  service: string;
  azureCost: number;
  awsCost: number;
  gcpCost: number;
  unitType: 'GB' | 'vCPU' | 'Transaction' | 'Hour';
}
export interface BenchmarkComparison {
  service: string;
  clientCost: number;
  industryAverage: number;
  variancePercentage: number;
  potentialSavings: number;
  severity: 'low' | 'medium' | 'high';
}

interface SpikeDetail {
  date: string;
  percentageIncrease: number;
  costIncrease: number;
  previousCost: number;
  currentCost: number;
  servicesAffected: ServiceCost[];
}

interface DeploymentEvent {
  eventTimestamp: string;
  operationName: string;
  resourceGroup: string;
  resourceType: string;
  resourceName: string;
}

interface DailyCostData {
  date: string;
  cost: number;
  serviceBreakdown: ServiceCost[];
}

interface VirtualNetwork {
  name: string;
  peerings: string[];
  gateways: string[];
  subnets: string[];
}

interface TrafficAnalysis {
  vnetName: string;
  trafficIncreasePercentage: number;
  trafficLogs: any[];
}

async function getAzureToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const token = execSync(
        'az account get-access-token --resource https://management.azure.com --query accessToken --output tsv',
        { encoding: "utf-8" }
      ).trim();

      if (!token) {
        reject(new Error("Azure access token is empty."));
      }

      resolve(token);
    } catch (error) {
      console.error("Error getting Azure token:", error);
      reject(new Error(`Azure authentication failed: ${error}`));
    }
  });
}

async function getAdvisorRecommendations(subscriptionId: string, token: string): Promise<any[]> {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Advisor/recommendations?api-version=2020-01-01`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data.value || [];
}

async function getGrafanaMetricsAndRecommendations(subscriptionId: string, token: string): Promise<GrafanaData> {
  const grafanaMetricsUrl = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Dashboard/grafana?api-version=2022-08-01`;
  const grafanaResponse = await axios.get(grafanaMetricsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const grafanaResources = grafanaResponse.data.value || [];

  const metrics = await Promise.all(
    grafanaResources.map(async (resource: any) => {
      const metricsUrl = `https://management.azure.com${resource.id}/providers/Microsoft.Insights/metrics?api-version=2021-05-01&metricnames=Requests`;
      const metricsResponse = await axios.get(metricsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        resourceName: resource.name,
        metrics: metricsResponse.data.value,
      };
    })
  );

  const recommendations = await getAdvisorRecommendations(subscriptionId, token);
  const grafanaRecommendations = recommendations
    .filter((rec) => rec.impactedField?.includes("Microsoft.Dashboard/grafana"))
    .map((rec) => `Resource: ${rec.impactedValue}, Issue: ${rec.shortDescription?.problem}, Solution: ${rec.shortDescription?.solution}`);

  return {
    metrics,
    recommendations: grafanaRecommendations,
  };
}

async function getCognitiveServicesMetricsAndRecommendations(subscriptionId: string, token: string): Promise<CognitiveServicesData> {
  const cognitiveServicesUrl = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CognitiveServices/accounts?api-version=2023-05-01`;
  const cognitiveServicesResponse = await axios.get(cognitiveServicesUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const cognitiveServicesResources = cognitiveServicesResponse.data.value || [];

  const metrics = await Promise.all(
    cognitiveServicesResources.map(async (resource: any) => {
      const metricsUrl = `https://management.azure.com${resource.id}/providers/Microsoft.Insights/metrics?api-version=2021-05-01&metricnames=TotalCalls,TotalErrors`;
      const metricsResponse = await axios.get(metricsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        resourceName: resource.name,
        metrics: metricsResponse.data.value,
      };
    })
  );

  const recommendations = await getAdvisorRecommendations(subscriptionId, token);
  const cognitiveServicesRecommendations = recommendations
    .filter((rec) => rec.impactedField?.includes("Microsoft.CognitiveServices/accounts"))
    .map((rec) => `Resource: ${rec.impactedValue}, Issue: ${rec.shortDescription?.problem}, Solution: ${rec.shortDescription?.solution}`);

  return {
    metrics,
    recommendations: cognitiveServicesRecommendations,
  };
}

async function detectUnusedPublicIPs(subscriptionId: string, token: string): Promise<string[]> {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Network/publicIPAddresses?api-version=2023-05-01`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const unusedIPs: string[] = [];
  for (const ip of response.data.value || []) {
    if (!ip.properties?.ipConfiguration) {
      unusedIPs.push(ip.name);
    }
  }

  return unusedIPs;
}

async function detectUnusedNSGs(subscriptionId: string, token: string): Promise<string[]> {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Network/networkSecurityGroups?api-version=2023-05-01`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const unusedNSGs: string[] = [];
  for (const nsg of response.data.value || []) {
    if (!nsg.properties?.subnets && !nsg.properties?.networkInterfaces) {
      unusedNSGs.push(nsg.name);
    }
  }

  return unusedNSGs;
}

async function detectUnusedLoadBalancers(subscriptionId: string, token: string): Promise<string[]> {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Network/loadBalancers?api-version=2023-05-01`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const unusedLBs: string[] = [];
  for (const lb of response.data.value || []) {
    if (!lb.properties?.backendAddressPools && !lb.properties?.frontendIPConfigurations) {
      unusedLBs.push(lb.name);
    }
  }

  return unusedLBs;
}

async function getUnderutilizedVMRecommendations(subscriptionId: string, token: string): Promise<string[]> {
  const recommendations = await getAdvisorRecommendations(subscriptionId, token);

  const underutilizedVMRecommendations: string[] = [];
  for (const recommendation of recommendations) {
    if (
      recommendation.category === "Performance" &&
      recommendation.impactedField === "Microsoft.Compute/virtualMachines" &&
      recommendation.shortDescription?.problem?.includes("Underutilized virtual machine")
    ) {
      underutilizedVMRecommendations.push(
        `VM: ${recommendation.impactedValue} - ${recommendation.shortDescription.solution}`
      );
    }
  }

  return underutilizedVMRecommendations;
}

async function detectUnusedResources(subscriptionId: string): Promise<UnusedResources> {
  const token = await getAzureToken();

  const unusedPublicIPs = await detectUnusedPublicIPs(subscriptionId, token);
  const unusedNSGs = await detectUnusedNSGs(subscriptionId, token);
  const unusedLoadBalancers = await detectUnusedLoadBalancers(subscriptionId, token);

  return {
    unusedPublicIPs,
    unusedNSGs,
    unusedLoadBalancers,
  };
}

async function getVirtualNetworks(subscriptionId: string, token: string): Promise<VirtualNetwork[]> {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Network/virtualNetworks?api-version=2023-05-01`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const virtualNetworks: VirtualNetwork[] = [];
  for (const vnet of response.data.value || []) {
    const peerings = vnet.properties?.virtualNetworkPeerings?.map((peering: any) => peering.name) || [];
    const gateways = vnet.properties?.virtualNetworkGateways?.map((gateway: any) => gateway.name) || [];
    const subnets = vnet.properties?.subnets?.map((subnet: any) => subnet.name) || [];

    virtualNetworks.push({
      name: vnet.name,
      peerings,
      gateways,
      subnets,
    });
  }

  return virtualNetworks;
}

async function analyzeNetworkTraffic(subscriptionId: string, token: string): Promise<TrafficAnalysis[]> {
  const trafficSpikes: TrafficAnalysis[] = [];
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Network/networkWatchers?api-version=2022-01-01`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  for (const watcher of response.data.value || []) {
    const watcherName = watcher.name;
    const watcherUrl = `https://management.azure.com${watcher.id}/queryFlowLog?api-version=2022-01-01`;

    try {
      const logsResponse = await axios.post(
        watcherUrl,
        {
          query: "SELECT time, bytes FROM NetworkTraffic WHERE time > ago(7d) ORDER BY time DESC",
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const logs = logsResponse.data.value;
      if (logs.length < 2) continue;

      const latestTraffic = logs[0].bytes;
      const previousTraffic = logs[1].bytes;
      const increasePercentage = ((latestTraffic - previousTraffic) / previousTraffic) * 100;

      if (increasePercentage > 30) {
        trafficSpikes.push({
          vnetName: watcherName,
          trafficIncreasePercentage: increasePercentage,
          trafficLogs: logs.slice(0, 5),
        });
      }
    } catch (err) {
      console.error(`Failed to fetch network logs for ${watcherName}:`, err);
    }
  }

  return trafficSpikes;
}

async function detectMisconfigurations(vnets: VirtualNetwork[]): Promise<string[]> {
  const misconfigurations: string[] = [];

  for (const vnet of vnets) {
    if (vnet.peerings.length === 0) {
      misconfigurations.push(`🚨 **${vnet.name}** has no peerings. Consider removing it if not needed.`);
    }

    if (vnet.gateways.length === 0) {
      misconfigurations.push(`⚠️ **${vnet.name}** has no gateways. Ensure it's intentional.`);
    }

    if (vnet.subnets.length === 0) {
      misconfigurations.push(`🔍 **${vnet.name}** has no subnets. Check if it's in use.`);
    }
  }

  return misconfigurations;
}

interface AzureCostRow {
  [index: number]: string | number;
}

interface AzureCostResponse {
  properties?: {
    rows?: AzureCostRow[];
  };
}

interface ServiceCost {
  service: string;
  cost: number;
}

interface CostResponse {
  cost: number;
  currency: string;
  multiCloudBenchmarks?: MultiCloudBenchmark[];
  serviceBreakdown: ServiceCost[];
  period: string;
  budget?: AzureBudgetResponse;
  unusedResources?: UnusedResources;
  benchmarkComparisons?: BenchmarkComparison[];
  costSpikes?: string[];
  seasonality?: SeasonalityPattern[]; // Add this
  rootCauseAnalysis?: { date: string; spikeDetails: string; rootCauses: string[] }[];
  cognitiveServices?: CognitiveServicesData;
  grafana?: GrafanaData;
  underutilizedVMs?: UnderutilizedVMs;
  virtualNetworks?: VirtualNetwork[];
}

interface TimeRange {
  timeframe: string;
  start?: string;
  end?: string;
}

interface AzureBudgetResponse {
  amount: number;
  timeGrain: string;
  timePeriod: {
    startDate: string;
    endDate: string;
  };
  currentSpend: {
    amount: number;
    unit: string;
  };
  notifications?: {
    [key: string]: {
      threshold: number;
      contactEmails: string[];
    };
  };
}

async function getAzureBudget(subscriptionId: string, budgetName: string): Promise<AzureBudgetResponse> {
  const token = await getAzureToken();
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Consumption/budgets/${budgetName}?api-version=2021-10-01`;

  const response = await axios.get<AzureBudgetResponse>(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  return response.data;
}

function getTimeRange(period: string): TimeRange {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthYearMatch = period.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i);
  if (monthYearMatch) {
    const monthName = monthYearMatch[1].toLowerCase();
    const year = parseInt(monthYearMatch[2]);

    const monthMap: { [key: string]: number } = {
      january: 0,
      february: 1,
      march: 2,
      april: 3,
      may: 4,
      june: 5,
      july: 6,
      august: 7,
      september: 8,
      october: 9,
      november: 10,
      december: 11,
    };

    const month = monthMap[monthName];
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);

    return {
      timeframe: "Custom",
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  }

  const daysMatch = period.match(/last (\d+) days?/i);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    return {
      timeframe: "Custom",
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  }

  switch (period.toLowerCase()) {
    case "last month": {
      const start = new Date(currentYear, currentMonth - 1, 1);
      const end = new Date(currentYear, currentMonth, 0);
      return {
        timeframe: "Custom",
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    }
    case "last 3 months": {
      const start = new Date(currentYear, currentMonth - 3, 1);
      const end = new Date(currentYear, currentMonth, 0);
      return {
        timeframe: "Custom",
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    }
    case "last 6 months": {
      const start = new Date(currentYear, currentMonth - 6, 1);
      const end = new Date(currentYear, currentMonth, 0);
      return {
        timeframe: "Custom",
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    }
    case "year to date": {
      return {
        timeframe: "YearToDate",
      };
    }
    default:
      return {
        timeframe: "MonthToDate",
      };
  }
}

async function getDailyCostData(subscriptionId: string, token: string, timeRange: TimeRange): Promise<DailyCostData[]> {
  const costRequest = {
    type: "ActualCost",
    timeframe: timeRange.timeframe,
    timePeriod: timeRange.start && timeRange.end ? {
      from: timeRange.start,
      to: timeRange.end
    } : undefined,
    dataset: {
      granularity: "Daily",
      aggregation: {
        totalCost: { name: "Cost", function: "Sum" }
      },
      grouping: [
        {
          type: "Dimension",
          name: "ServiceName"
        }
      ]
    }
  };

  const costResponse = await axios.post<AzureCostResponse>(
    process.env.AZURE_COST_API!,
    costRequest,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  const dailyCosts: { [date: string]: DailyCostData } = {};

  (costResponse.data?.properties?.rows || []).forEach(row => {
    const dateStr = String(row[1]).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"); // Convert YYYYMMDD to YYYY-MM-DD
    const service = String(row[2]);
    const cost = parseFloat(String(row[0]));

    if (!dailyCosts[dateStr]) {
      dailyCosts[dateStr] = {
        date: dateStr,
        cost: 0,
        serviceBreakdown: []
      };
    }

    dailyCosts[dateStr].cost += cost;
    dailyCosts[dateStr].serviceBreakdown.push({ service, cost });
  });

  return Object.values(dailyCosts);
}

async function detectSeasonality(dailyCosts: DailyCostData[]): Promise<SeasonalityPattern[]> {
  const patterns: SeasonalityPattern[] = [];

  if (!dailyCosts || dailyCosts.length === 0) {
    return patterns; // Return an empty array if no data is provided
  }

  const weeklyCosts: { [day: string]: number } = {};
  dailyCosts.forEach((day) => {
    const date = new Date(day.date);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    weeklyCosts[dayOfWeek] = (weeklyCosts[dayOfWeek] || 0) + day.cost;
  });

  const averageWeeklyCost = Object.values(weeklyCosts).reduce((sum, cost) => sum + cost, 0) / 7;
  for (const [day, cost] of Object.entries(weeklyCosts)) {
    if (cost > averageWeeklyCost * 1.2) {
      const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][Number(day)];
      patterns.push({
        type: "weekly",
        description: `Higher costs on ${dayName}s`,
        impact: `Costs are ${((cost - averageWeeklyCost) / averageWeeklyCost * 100).toFixed(2)}% higher than average.`,
      });
    }
  }

  const monthlyCosts: { [day: string]: number } = {};
  dailyCosts.forEach((day) => {
    const date = new Date(day.date);
    const dayOfMonth = date.getDate();
    monthlyCosts[dayOfMonth] = (monthlyCosts[dayOfMonth] || 0) + day.cost;
  });

  const averageMonthlyCost = Object.values(monthlyCosts).reduce((sum, cost) => sum + cost, 0) / 31;
  for (const [day, cost] of Object.entries(monthlyCosts)) {
    if (cost > averageMonthlyCost * 1.2) {
      patterns.push({
        type: "monthly",
        description: `Higher costs on day ${day} of the month`,
        impact: `Costs are ${((cost - averageMonthlyCost) / averageMonthlyCost * 100).toFixed(2)}% higher than average.`,
      });
    }
  }

  return patterns; // Return the detected patterns (or an empty array if none are found)
}

async function getDeploymentEvents(subscriptionId: string, token: string, startDate: string, endDate: string): Promise<DeploymentEvent[]> {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Insights/eventtypes/management/values?api-version=2017-03-01-preview&$filter=eventTimestamp ge '${startDate}' and eventTimestamp le '${endDate}'`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data.value.map((event: any) => ({
    eventTimestamp: event.eventTimestamp,
    operationName: event.operationName.value,
    resourceGroup: event.resourceGroupName,
    resourceType: event.resourceType.value,
    resourceName: event.resourceName,
  }));
}

async function fetchHistoricalCosts(subscriptionId: string): Promise<{ [key: string]: number[] }> {
  const response = await axios.get(
    `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2021-10-01`,
    {
      headers: { Authorization: `Bearer ${process.env.AZURE_API_KEY}` },
      data: {
        type: "ActualCost",
        timeframe: "Last30Days",
        dataset: {
          granularity: "Daily",
          grouping: [{ type: "Dimension", name: "ServiceName" }],
          aggregation: { totalCost: { name: "PreTaxCost", function: "Sum" } },
        },
      },
    }
  );

  let historicalData: { [key: string]: number[] } = {};
  response.data.properties.rows.forEach((row: any[]) => {
    const service = row[0];
    const cost = parseFloat(row[1]);
    if (!historicalData[service]) historicalData[service] = [];
    historicalData[service].push(cost);
  });

  return historicalData;
}

function generateHistoricalComparison(
  currentCosts: { [key: string]: number },
  historicalData: { [key: string]: number[] }
): { [key: string]: string } {
  let recommendations: { [key: string]: string } = {};

  for (const service in currentCosts) {
    const currentCost = currentCosts[service] || 0;
    const history = historicalData[service] || [];

    if (history.length === 0) continue; // Skip if no historical data available

    const avgHistoricalCost = history.reduce((a, b) => a + b, 0) / history.length;
    const increasePercentage = ((currentCost - avgHistoricalCost) / avgHistoricalCost) * 100;

    if (increasePercentage > 20) {
      recommendations[service] = `🚨 **${service} costs increased by ${increasePercentage.toFixed(2)}%!**  
      🔍 Consider reviewing recent changes to this service to understand the spike.`;
    } else {
      recommendations[service] = `✅ **${service} costs are stable and within normal limits.**`;
    }
  }

  return recommendations;
}


async function analyzeRootCause(subscriptionId: string, token: string, costSpikeDate: string): Promise<string[]> {
  const startDate = new Date(costSpikeDate);
  startDate.setHours(0, 0, 0, 0); // पूरा दिन कवर करें
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 1);

  const events = await getDeploymentEvents(subscriptionId, token, startDate.toISOString(), endDate.toISOString());
  
  return events
    .filter(event => 
      event.operationName.includes("Write") || 
      event.operationName.includes("Create") ||
      event.operationName.includes("Update")
    )
    .map(event => 
      `🚀 **${event.eventTimestamp}**: ${event.operationName} on ${event.resourceType} **${event.resourceName}**`
    );
}

function detectCostSpikes(dailyCosts: DailyCostData[], percentageThreshold: number = 10, absoluteThreshold: number = 500): string[] {
  const spikes: string[] = [];

  for (let i = 1; i < dailyCosts.length; i++) {
    const prevCost = dailyCosts[i - 1].cost;
    const currentCost = dailyCosts[i].cost;

    const increasePercentage = ((currentCost - prevCost) / (prevCost || 1)) * 100;
    const increaseAbsolute = currentCost - prevCost;

    if (increasePercentage >= percentageThreshold || increaseAbsolute >= absoluteThreshold) {
      const services = dailyCosts[i].serviceBreakdown
        .filter(service => service.cost > 0)
        .map(service => `**${service.service}**: ₹${service.cost.toFixed(2)}`)
        .join(', ');

      spikes.push(
        `🚀 **${dailyCosts[i].date}**: Cost spiked by ${increasePercentage.toFixed(2)}% (₹${prevCost.toFixed(2)} → ₹${currentCost.toFixed(2)}) - Services: ${services}`
      );
    }
  }

  return spikes;
}

async function fetchIndustryBenchmarks(serviceNames: string[]): Promise<IndustryBenchmark[]> {
  try {
    if (!process.env.CLOUD_BENCHMARK_API_KEY) {
      return getFallbackBenchmarks(serviceNames);
    }

    const response = await axios.post('https://api.cloudbenchmarking.com/v1/azure', {
      services: serviceNames,
      region: 'south-asia',
      industry: 'IT',
      tier: 'production'
    }, {
      headers: { 'Authorization': `Bearer ${process.env.CLOUD_BENCHMARK_API_KEY}` }
    });
    return response.data.benchmarks;
  } catch (error) {
    console.error('Using fallback benchmark data');
    return getFallbackBenchmarks(serviceNames);
  }
}

function getFallbackBenchmarks(serviceNames: string[]): IndustryBenchmark[] {
  const fallbackData: {[key: string]: IndustryBenchmark} = {
    'Virtual Network': {
      service: 'Virtual Network',
      averageCostPerUnit: 35.50,
      unitType: 'GB',
      percentile50: 30.20,
      percentile90: 42.75
    },
    'Azure App Service': {
      service: 'Azure App Service',
      averageCostPerUnit: 22.80, 
      unitType: 'vCPU',
      percentile50: 19.50,
      percentile90: 27.40
    },
    'Storage': {
      service: 'Storage',
      averageCostPerUnit: 0.023,
      unitType: 'GB',
      percentile50: 0.018,
      percentile90: 0.028
    }
  };

  return serviceNames
    .filter(name => fallbackData[name])
    .map(name => fallbackData[name]);
}

async function fetchMultiCloudBenchmarks(serviceNames: string[]): Promise<MultiCloudBenchmark[]> {
  try {
    return serviceNames.map(service => ({
      service,
      azureCost: Math.random() * 1000,
      awsCost: Math.random() * 800,
      gcpCost: Math.random() * 900,
      unitType: 'vCPU'
    }));
  } catch (error) {
    return getFallbackMultiCloudBenchmarks(serviceNames);
  }
}

function getFallbackMultiCloudBenchmarks(serviceNames: string[]): MultiCloudBenchmark[] {
  const benchmarks: {[key: string]: MultiCloudBenchmark} = {
    'Virtual Machines': {
      service: 'Virtual Machines',
      azureCost: 12300,
      awsCost: 9800,
      gcpCost: 10500,
      unitType: 'vCPU'
    },
    'Storage': {
      service: 'Storage',
      azureCost: 2300,
      awsCost: 1800, 
      gcpCost: 2100,
      unitType: 'GB'
    }
  };

  return serviceNames
    .filter(name => benchmarks[name])
    .map(name => benchmarks[name]);
}

function compareWithBenchmarks(clientData: ServiceCost[], benchmarks: IndustryBenchmark[]): BenchmarkComparison[] {
  return clientData.map(service => {
    const benchmark = benchmarks.find(b => b.service === service.service);
    if (!benchmark) return null;

    const variance = ((service.cost - benchmark.averageCostPerUnit) / benchmark.averageCostPerUnit) * 100;
    const severity = variance > 20 ? 'high' : variance > 10 ? 'medium' : 'low';

    return {
      service: service.service,
      clientCost: service.cost,
      industryAverage: benchmark.averageCostPerUnit,
      variancePercentage: variance,
      potentialSavings: service.cost - benchmark.percentile50,
      severity
    };
  }).filter(Boolean) as BenchmarkComparison[];
}

async function getCostResponseWithBudget(subscriptionId: string, token: string, timeRange: TimeRange): Promise<CostResponse> {
  const dailyCosts = await getDailyCostData(subscriptionId, token, timeRange);
  const costSpikes = detectCostSpikes(dailyCosts, 5, 50); // Now correctly returns `string[]`
  const serviceBreakdown = dailyCosts.flatMap(day => day.serviceBreakdown);
  const servicesToCompare = [...new Set(serviceBreakdown.map(s => s.service))];
  const multiCloudBenchmarks = await fetchMultiCloudBenchmarks(servicesToCompare);
  const benchmarks = await fetchIndustryBenchmarks(servicesToCompare);
  const benchmarkComparisons = compareWithBenchmarks(serviceBreakdown, benchmarks);

  const response: CostResponse = {
    cost: dailyCosts.reduce((sum, entry) => sum + entry.cost, 0),
    currency: "INR",
    serviceBreakdown: dailyCosts.flatMap(day => day.serviceBreakdown),
    benchmarkComparisons,
    period: `${timeRange.start} to ${timeRange.end}`,
    budget: await getAzureBudget(subscriptionId, "COE-Overall-Budget"),
    unusedResources: await detectUnusedResources(subscriptionId),
    multiCloudBenchmarks,
    underutilizedVMs: { recommendations: await getUnderutilizedVMRecommendations(subscriptionId, token) },
    virtualNetworks: await getVirtualNetworks(subscriptionId, token),
    costSpikes, 
  };

  return response;
}


export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const period = String(query.period || "current month");
    const timeRange = getTimeRange(period);

    const token = await getAzureToken();
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID!;

    const costResponseWithBudget = await getCostResponseWithBudget(subscriptionId, token, timeRange);

    const grafanaData = await getGrafanaMetricsAndRecommendations(subscriptionId, token);

    const cognitiveServicesData = await getCognitiveServicesMetricsAndRecommendations(subscriptionId, token);

    const vnets = await getVirtualNetworks(subscriptionId, token);
    
    const trafficSpikes = await analyzeNetworkTraffic(subscriptionId, token);

    const rootCauseAnalysis = await Promise.all(
      (costResponseWithBudget.costSpikes || []).map(async (spike) => {
        const dateMatch = spike.match(/\*\*(\d{4}-\d{2}-\d{2})\*\*/);
        if (dateMatch) {
          const date = dateMatch[1];
          return {
            date,
            spikeDetails: spike,
            rootCauses: await analyzeRootCause(subscriptionId, token, date),
          };
        }
        return null;
      })
    );

    
    const misconfigurations = await detectMisconfigurations(vnets);

    const response = {
      ...costResponseWithBudget,
      grafana: grafanaData,
      virtualNetworks: vnets,
      trafficSpikes,
      misconfigurations,
      rootCauseAnalysis: rootCauseAnalysis.filter(Boolean),
      cognitiveServices: cognitiveServicesData,
    };

    return response;
  } catch (error) {
    console.error("Error fetching Azure data:", error);
    return { error: "Failed to fetch data" };
  }
});
