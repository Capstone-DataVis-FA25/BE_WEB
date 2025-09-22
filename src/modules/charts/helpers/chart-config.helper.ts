export function parseChartSpecificConfig(
  type: string,
  config: any
): Record<string, any> {
  const chartSpecific: Record<string, any> = {};

  switch (type.toLowerCase()) {
    case "line":
      // Line chart specific settings
      chartSpecific.lineType = config.lineType ?? "basic"; // basic, smooth, stepped, dashed
      chartSpecific.curveType = config.curveType ?? "curveMonotoneX";
      chartSpecific.strokeWidth = config.strokeWidth ?? 2;
      chartSpecific.showPoints = config.showPoints ?? true; // Lines typically show points
      break;

    case "bar":
    case "column":
      // Bar/Column chart specific settings
      chartSpecific.barType = config.barType ?? "grouped"; // grouped, stacked, percentage
      chartSpecific.barWidth = config.barWidth ?? 0.8;
      chartSpecific.barGap = config.barGap ?? 0.2;
      chartSpecific.showValues = config.showValues ?? true; // Bars typically show values
      break;

    case "area":
      // Area chart specific settings
      chartSpecific.areaType = config.areaType ?? "basic"; // basic, stacked, percentage, stream
      chartSpecific.fillOpacity = config.fillOpacity ?? 0.6;
      chartSpecific.curveType = config.curveType ?? "curveMonotoneX";
      chartSpecific.strokeWidth = config.strokeWidth ?? 2;
      chartSpecific.showPoints = config.showPoints ?? false; // Areas typically don't show points
      break;

    case "pie":
      // Pie chart specific settings
      chartSpecific.pieType = config.pieType ?? "basic"; // basic, exploded, nested
      chartSpecific.innerRadius = config.innerRadius ?? 0;
      chartSpecific.showLabels = config.showLabels ?? true;
      chartSpecific.showPercentages = config.showPercentages ?? true;
      break;

    case "donut":
      // Donut chart specific settings
      chartSpecific.donutType = config.donutType ?? "basic"; // basic, multi-level, progress
      chartSpecific.innerRadius = config.innerRadius ?? 50;
      chartSpecific.showLabels = config.showLabels ?? true;
      chartSpecific.showPercentages = config.showPercentages ?? true;
      break;

    case "scatter":
      // Scatter plot specific settings
      chartSpecific.scatterType = config.scatterType ?? "basic"; // basic, regression, clustered
      chartSpecific.showPoints = config.showPoints ?? true;
      chartSpecific.strokeWidth = config.strokeWidth ?? 0; // No lines by default
      break;

    case "bubble":
      // Bubble chart specific settings
      chartSpecific.bubbleType = config.bubbleType ?? "basic"; // basic, packed, force
      chartSpecific.showPoints = config.showPoints ?? true;
      chartSpecific.strokeWidth = config.strokeWidth ?? 0;
      break;

    case "heatmap":
      // Heatmap specific settings
      chartSpecific.heatmapType = config.heatmapType ?? "grid"; // grid, calendar, treemap
      chartSpecific.colorScheme = config.colorScheme ?? "blues";
      break;

    case "radar":
      // Radar chart specific settings
      chartSpecific.radarType = config.radarType ?? "polygon"; // polygon, circular, spider
      chartSpecific.fillOpacity = config.fillOpacity ?? 0.2;
      chartSpecific.strokeWidth = config.strokeWidth ?? 2;
      break;

    case "treemap":
      // Treemap specific settings
      chartSpecific.treemapType = config.treemapType ?? "squarified"; // squarified, slice-dice, binary
      chartSpecific.tiling = config.tiling ?? "squarify";
      break;

    case "sankey":
      // Sankey diagram specific settings
      chartSpecific.sankeyType = config.sankeyType ?? "horizontal"; // horizontal, vertical, circular
      chartSpecific.nodeWidth = config.nodeWidth ?? 20;
      chartSpecific.nodePadding = config.nodePadding ?? 10;
      break;

    case "gauge":
      // Gauge chart specific settings
      chartSpecific.gaugeType = config.gaugeType ?? "arc"; // arc, linear, bullet
      chartSpecific.minValue = config.minValue ?? 0;
      chartSpecific.maxValue = config.maxValue ?? 100;
      chartSpecific.showThreshold = config.showThreshold ?? true;
      break;

    case "funnel":
      // Funnel chart specific settings
      chartSpecific.funnelType = config.funnelType ?? "pyramid"; // pyramid, inverted, cylinder
      chartSpecific.showPercentages = config.showPercentages ?? true;
      break;

    case "waterfall":
      // Waterfall chart specific settings
      chartSpecific.waterfallType = config.waterfallType ?? "standard"; // standard, bridge, variance
      chartSpecific.showConnectors = config.showConnectors ?? true;
      chartSpecific.showTotals = config.showTotals ?? true;
      break;

    default:
      // For other chart types, include common settings only
      break;
  }

  return chartSpecific;
}

/**
 * Get supported chart types with their specific configuration options
 */
export const SUPPORTED_CHART_TYPES = {
  line: {
    name: "Line Chart",
    specificOptions: ["lineType", "curveType", "strokeWidth", "showPoints"],
  },
  bar: {
    name: "Bar Chart",
    specificOptions: ["barType", "barWidth", "barGap", "showValues"],
  },
  column: {
    name: "Column Chart",
    specificOptions: ["barType", "barWidth", "barGap", "showValues"],
  },
  area: {
    name: "Area Chart",
    specificOptions: [
      "areaType",
      "fillOpacity",
      "curveType",
      "strokeWidth",
      "showPoints",
    ],
  },
  pie: {
    name: "Pie Chart",
    specificOptions: [
      "pieType",
      "innerRadius",
      "showLabels",
      "showPercentages",
    ],
  },
  donut: {
    name: "Donut Chart",
    specificOptions: [
      "donutType",
      "innerRadius",
      "showLabels",
      "showPercentages",
    ],
  },
  scatter: {
    name: "Scatter Plot",
    specificOptions: ["scatterType", "showPoints", "strokeWidth"],
  },
  bubble: {
    name: "Bubble Chart",
    specificOptions: ["bubbleType", "showPoints", "strokeWidth"],
  },
  heatmap: {
    name: "Heatmap",
    specificOptions: ["heatmapType", "colorScheme"],
  },
  radar: {
    name: "Radar Chart",
    specificOptions: ["radarType", "fillOpacity", "strokeWidth"],
  },
  treemap: {
    name: "Treemap",
    specificOptions: ["treemapType", "tiling"],
  },
  sankey: {
    name: "Sankey Diagram",
    specificOptions: ["sankeyType", "nodeWidth", "nodePadding"],
  },
  gauge: {
    name: "Gauge Chart",
    specificOptions: ["gaugeType", "minValue", "maxValue", "showThreshold"],
  },
  funnel: {
    name: "Funnel Chart",
    specificOptions: ["funnelType", "showPercentages"],
  },
  waterfall: {
    name: "Waterfall Chart",
    specificOptions: ["waterfallType", "showConnectors", "showTotals"],
  },
} as const;

/**
 * Validate if a chart type is supported
 */
export function isValidChartType(type: string): boolean {
  return type.toLowerCase() in SUPPORTED_CHART_TYPES;
}

/**
 * Get specific configuration options for a chart type
 */
export function getChartTypeOptions(type: string): readonly string[] {
  const chartType = type.toLowerCase() as keyof typeof SUPPORTED_CHART_TYPES;
  return SUPPORTED_CHART_TYPES[chartType]?.specificOptions || [];
}
