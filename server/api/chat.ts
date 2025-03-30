import { defineEventHandler, getQuery } from "h3";
import dotenv from "dotenv";
import axios from "axios";
import { BenchmarkComparison, MultiCloudBenchmark, SeasonalityPattern } from "./cost";

dotenv.config();

interface RawServiceData {
  service: string;
  cost: number | string;
  currency: string;
  trend: string;
  usage: string;
}

interface ProcessedService {
  name: string;
  cost: number;
  currency: string;
}

interface UnusedResources {
  unusedPublicIPs: string[];
  unusedNSGs: string[];
  unusedLoadBalancers: string[];
}

interface UnderutilizedVMs {
  recommendations: string[];
}

interface VirtualNetwork {
  name: string;
  peerings: string[];
  gateways: string[];
  subnets: string[];
}

interface VnetAnomalies {
  trafficSpikes: { vnetName: string; trafficIncreasePercentage: number; trafficLogs: any[] }[];
  misconfigurations: string[];
}

interface CognitiveServicesData {
  metrics: { resourceName: string; metrics: any }[];
  recommendations: string[];
}

interface GrafanaData {
  metrics: { resourceName: string; metrics: any }[];
  recommendations: string[];
}

function parseCost(cost: number | string): number {
  if (typeof cost === 'number') return cost;
  return parseFloat(cost.replace(/[^\d.-]/g, '')) || 0;
}

function formatCurrency(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

function extractTimePeriod(question: string): string {
  const monthYearMatch = question.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i);
  if (monthYearMatch) {
    return `${monthYearMatch[1]} ${monthYearMatch[2]}`; // Return "January 2025"
  }

  const daysMatch = question.match(/last (\d+) days?/i);
  if (daysMatch) {
    return daysMatch[0].toLowerCase();
  }

  const timePatterns = {
    'last month': /last month/i,
    'last 3 months': /last (three|3) months/i,
    'last 6 months': /last (six|6) months/i,
    'year to date': /year to date|ytd/i,
    'current month': /(this|current) month/i,
  };

  for (const [period, pattern] of Object.entries(timePatterns)) {
    if (pattern.test(question)) {
      return period;
    }
  }

  return 'current month';
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });

  if (event.method === "OPTIONS") return "";

  const query = getQuery(event);
  const question = String(query.q || "").trim().toLowerCase();

  if (!question) {
    return { error: "No question provided." };
  }

  try {
    const period = extractTimePeriod(question);
    const costResponse = await axios.get<{
      cost: number;
      currency: string;
      serviceBreakdown: RawServiceData[];
      costSpikes?: string[];
      seasonality?: SeasonalityPattern[]; // Add seasonality
      rootCauseAnalysis?: { date: string; spikeDetails: string; rootCauses: string[] }[];
      period: string;
      budget?: {
        properties: {
          amount: number;
          currentSpend: {
            amount: number;
            unit: string;
          };
          forecastSpend: {
            amount: number;
            unit: string;
          };
        };
      };
      unusedResources?: UnusedResources;
      cognitiveServices?: CognitiveServicesData;
      grafana?: GrafanaData;
      underutilizedVMs?: UnderutilizedVMs;
      vnetAnomalies?: VnetAnomalies;
      benchmarkComparisons?: BenchmarkComparison[];
      virtualNetworks?: VirtualNetwork[];
    }>(`http://localhost:3000/api/cost?period=${encodeURIComponent(period)}`);

    const serviceBreakdown = costResponse.data.serviceBreakdown || [];

    const processedServices: ProcessedService[] = serviceBreakdown
      .map(service => ({
        name: service.service,
        cost: parseCost(service.cost),
        currency: service.currency || 'INR'
      }))
      .filter(service => service.cost > 0)
      .sort((a, b) => b.cost - a.cost);

    const totalCost = processedServices.reduce((sum, service) => sum + service.cost, 0);

    const budget = costResponse.data.budget?.properties;
    const budgetAmount = budget?.amount || 0;
    const currentSpend = budget?.currentSpend?.amount || 0;
    const forecastSpend = budget?.forecastSpend?.amount || 0;

    const budgetUtilization = (currentSpend / budgetAmount) * 100;
    const remainingBudget = budgetAmount - currentSpend;
    const isOverBudget = forecastSpend > budgetAmount;

    let alertMessage = "";
    if (budget && budgetAmount > 0) {
      if (budgetUtilization >= 90) {
        alertMessage = `🚨 **Alert**: You have used **${budgetUtilization.toFixed(2)}%** of your budget. Only **₹${remainingBudget.toFixed(2)}** remains. Consider optimizing your spending to avoid exceeding your budget.`;
      } else if (isOverBudget) {
        alertMessage = `🚨 **Alert**: Your forecasted spend (₹${forecastSpend.toFixed(2)}) exceeds your budget (₹${budgetAmount.toFixed(2)}) by **₹${(forecastSpend - budgetAmount).toFixed(2)}**. Take immediate action to reduce costs.`;
      }
    }

    const grafanaData = costResponse.data.grafana || {
      metrics: [],
      recommendations: []
    };
    const cognitiveServicesData = costResponse.data.cognitiveServices || {
      metrics: [],
      recommendations: []
    };

    const context = {
      totalCost: formatCurrency(totalCost),
      period: costResponse.data.period,
      services: processedServices.slice(0, 5).map(service => ({
        name: service.name,
        cost: formatCurrency(service.cost)
      })),
      costSpikes: costResponse.data.costSpikes || [],
      multiCloudBenchmarks: (costResponse.data as any).multiCloudBenchmarks || [],
      benchmarkComparisons: (costResponse.data.benchmarkComparisons || []) as BenchmarkComparison[],
      seasonality: costResponse.data.seasonality || [], 
      rootCauseAnalysis: costResponse.data.rootCauseAnalysis || [],
      budget: {
        amount: formatCurrency(budgetAmount),
        currentSpend: formatCurrency(currentSpend),
        forecastSpend: formatCurrency(forecastSpend),
        utilization: budgetUtilization.toFixed(2),
        remaining: formatCurrency(remainingBudget)
      },
      alert: alertMessage,
      unusedResources: costResponse.data.unusedResources || {
        unusedPublicIPs: [],
        unusedNSGs: [],
        unusedLoadBalancers: []
      },
      cognitiveServices: cognitiveServicesData,
      grafana: grafanaData,
      underutilizedVMs: costResponse.data.underutilizedVMs || {
        recommendations: []
      },
      vnetAnomalies: costResponse.data.vnetAnomalies || {
        trafficSpikes: [],
        misconfigurations: [],
      },
      virtualNetworks: costResponse.data.virtualNetworks || []
    };

    const systemPrompt = `You are a Cloud cost analysis expert. Based solely on the provided cost data and service-level analysis, generate actionable recommendations that directly address the observed cost spikes and trends. Do not provide generic advice. For each spike, refer to the exact services and changes observed in the data and suggest tailored actions (e.g., if Cognitive Services cost surged, suggest reviewing API usage, scaling configuration, etc.).
IMPORTANT:
- - Always include the specific service names and exact details (e.g., autoscale configuration, unused container images) in your response.
- Use **markdown formatting** for headings, bullet points, and bold text , also use emojis wherever needed.
- Be **concise** yet **detailed** and avoid generic advice.
- Provide overall cost efficiency score everytime on basis of overall response
- Always **bold** important details like service names, costs, and key insights.
- Provide advanced insights such as potential future cost implications and optimization strategies.
- Be conversational, empathetic, and proactive in suggesting next steps.
🚨 **STRICT RULES: NO GENERAL ADVICE. USE ONLY API DATA.** 🚨  
- **Do NOT assume anything**. Use **only the provided API data**.  
- **DO NOT suggest common cost optimizations** unless **they are specifically relevant to the services listed in the API response**.  
- **Avoid vague suggestions like "optimize autoscaling"** unless **Azure App Service has a documented cost spike**.  
- **Each recommendation must directly refer to the services impacted and their cost changes**.  
Current data:
Period: ${context.period}
Total: ${context.totalCost}
Services: ${context.services.map(s => `${s.name}: ${s.cost}`).join(', ')}
🚀 **Cost Spikes:**
${context.costSpikes.length ? context.costSpikes.join('\n') : "No significant spikes detected."}
📊 **Seasonality Patterns:**
${context.seasonality.length ? context.seasonality.map(pattern => `- **${pattern.type}**: ${pattern.description} (${pattern.impact})`).join('\n') : "No significant seasonality patterns detected."}
🔍 **Root Cause Analysis:**
${context.rootCauseAnalysis.length ? context.rootCauseAnalysis.map(analysis => `- **${analysis.date}**: ${analysis.spikeDetails}\n  Root Causes:\n  ${analysis.rootCauses.join('\n  ') || 'None'}`).join('\n') : "No root cause analysis available."}
Budget: ${context.budget.amount} (Current Spend: ${context.budget.currentSpend}, Forecasted Spend: ${context.budget.forecastSpend}, Utilization: ${context.budget.utilization}%)
Unused Resources:
- **Public IPs**: ${context.unusedResources.unusedPublicIPs.join(', ') || 'None'}
- **NSGs**: ${context.unusedResources.unusedNSGs.join(', ') || 'None'}
- **Load Balancers**: ${context.unusedResources.unusedLoadBalancers.join(', ') || 'None'}
Grafana Recommendations:
- ${context.grafana.recommendations.join('\n- ') || 'None'}
Cognitive Services:
- **Recommendations**: ${context.cognitiveServices.recommendations.join(', ') || 'None'}
- **Metrics**: ${context.cognitiveServices.metrics.map(metric => `${metric.resourceName}: ${JSON.stringify(metric.metrics)}`).join(', ') || 'None'}
Underutilized VMs:
- ${context.underutilizedVMs.recommendations.join('\n- ') || 'None'}
Virtual Networks:
- ${context.virtualNetworks.map(vnet => `**${vnet.name}**: Peerings (${vnet.peerings.join(', ') || 'None'}), Gateways (${vnet.gateways.join(', ') || 'None'}), Subnets (${vnet.subnets.join(', ') || 'None'})`).join('\n- ') || 'None'}
🤖 **AI Services:**
${context.cognitiveServices?.metrics.map(service => 
  `- **${service.resourceName}**: ${service.metrics.TotalCalls} calls, ${service.metrics.TotalErrors} errors`
).join('\n') || 'No AI services data'}
📌 **Multi-Cloud Savings Opportunity**  
${
  context.multiCloudBenchmarks?.length ? 
  context.multiCloudBenchmarks.map((comp: MultiCloudBenchmark) => 
    `☁️ **${comp.service}**\n` + 
    `- Azure: ₹${comp.azureCost.toFixed(2)}\n` +
    `- AWS: ₹${comp.awsCost.toFixed(2)} (Save ${((1 - comp.awsCost/comp.azureCost)*100).toFixed(2)}%)\n` +
    `- GCP: ₹${comp.gcpCost.toFixed(2)} (Save ${((1 - comp.gcpCost/comp.azureCost)*100).toFixed(2)}%)`
  ).join('\n\n') 
  : '⚠️ Multi-cloud benchmark data not available'
}
📊 **Cost Benchmark Insights:**
${
  context.benchmarkComparisons?.length ? 
  context.benchmarkComparisons.map((comp: BenchmarkComparison) => { 
    const emoji = comp.variancePercentage > 0 ? '🔴' : '🟢';
    return `${emoji} **${comp.service}**: ₹${comp.clientCost.toFixed(2)} (Industry Avg: ₹${comp.industryAverage.toFixed(2)})`;
  }).join('\n') 
  : '⚠️ Benchmark data not available - Using internal optimization standards'}
🔍 **Network Health:**
- Misconfigurations: ${context.vnetAnomalies?.misconfigurations.length || 0}
- Traffic Spikes: ${context.vnetAnomalies?.trafficSpikes.map(ts => 
  `${ts.vnetName} (${ts.trafficIncreasePercentage.toFixed(2)}%)`).join(', ') || 'None'}
${context.alert ? `\n${context.alert}` : ''}`;

    const payload = {
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: question
        }
      ],
      temperature: 0.3,
      max_tokens: 1900
    };

    const openAIResponse = await axios.post(
      `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.AZURE_OPENAI_API_KEY,
        },
      }
    );

    const response = openAIResponse.data.choices[0].message.content.trim();
    return { response };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Azure API error:", error.response?.data || error.message);
      return {
        error: "Failed to fetch Azure cost data",
        details: error.response?.data?.error || error.message
      };
    }
    console.error("Unexpected error:", error);
    return {
      error: "An unexpected error occurred",
      details: error instanceof Error ? error.message : "Unknown error"
    };
  }
});