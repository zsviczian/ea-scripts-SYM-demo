/**
 * @file chartModel.ts
 * @overview Chart Studio model helpers, schema migration, palettes, multi-series operations, and budget-walk normalization.
 */

import type {
  BudgetRole,
  ChartConfig,
  ChartDatum,
  ChartElementData,
  ChartSelection,
  ChartSeries,
  ChartType,
} from "./chartTypes";

export const PALETTES: Record<string, readonly string[]> = {
  Classic: ["#4c6ef5", "#f06595", "#12b886", "#fab005", "#7950f2", "#15aabf", "#fa5252", "#82c91e"],
  Pastel: ["#a5d8ff", "#ffc9c9", "#b2f2bb", "#ffec99", "#d0bfff", "#99e9f2", "#ffd8a8", "#eebefa"],
  Ocean: ["#1864ab", "#1971c2", "#1c7ed6", "#228be6", "#339af0", "#4dabf7", "#74c0fc", "#a5d8ff"],
  Forest: ["#2b8a3e", "#37b24d", "#40c057", "#51cf66", "#69db7c", "#8ce99a", "#b2f2bb", "#d3f9d8"],
  Sunset: ["#e03131", "#f03e3e", "#f76707", "#fd7e14", "#f59f00", "#fab005", "#fcc419", "#ffe066"],
  Mono: ["#212529", "#343a40", "#495057", "#868e96", "#adb5bd", "#ced4da", "#dee2e6", "#f1f3f5"],
};

export const BUDGET_TOTAL_COLOR = "#4c6ef5";
export const BUDGET_POSITIVE_COLOR = "#12b886";
export const BUDGET_NEGATIVE_COLOR = "#fa5252";

const DEFAULT_ROWS: Array<[string, number]> = [
  ["Alpha", 40],
  ["Beta", 30],
  ["Gamma", 20],
  ["Delta", 10],
];

const DEFAULT_MULTI_ROWS: Array<[string, number, number]> = [
  ["Q1", 42, 36],
  ["Q2", 55, 48],
  ["Q3", 51, 57],
  ["Q4", 68, 61],
];

export interface ParsedBulkData {
  rows: ChartDatum[];
  seriesNames: string[];
}

/** Creates a fresh chart config with a useful sample for the requested type. */
export function defaultChartConfig(type: ChartType = "pie"): ChartConfig {
  const palette = PALETTES.Classic ?? ["#4c6ef5", "#f06595", "#12b886", "#fab005"];
  const base: ChartConfig = {
    version: 2,
    type,
    title: type === "budget-walk" ? "Budget walk" : "My chart",
    width: 560,
    height: 380,
    palette: "Classic",
    showLegend: true,
    showLabels: true,
    showValues: false,
    showPercentages: true,
    showAxes: true,
    showGrid: true,
    strokeWidth: 2,
    roughness: 0,
    donutHole: 48,
    series: [{ name: "Series 1", color: palette[0] ?? "#4c6ef5" }],
    data: DEFAULT_ROWS.map(([label, value], index) => ({
      label,
      values: [value],
      color: palette[index % palette.length] ?? "#4c6ef5",
    })),
  };

  if (supportsMultipleSeries(type)) {
    base.series = [
      { name: "Actual", color: palette[0] ?? "#4c6ef5" },
      { name: "Plan", color: palette[1] ?? "#f06595" },
    ];
    base.data = DEFAULT_MULTI_ROWS.map(([label, first, second], index) => ({
      label,
      values: [first, second],
      color: palette[index % palette.length] ?? "#4c6ef5",
    }));
    base.showPercentages = false;
  }

  if (type === "budget-walk") {
    base.series = [{ name: "Amount", color: BUDGET_TOTAL_COLOR }];
    base.data = [
      { label: "Opening", values: [100], color: BUDGET_TOTAL_COLOR, budgetRole: "opening" },
      { label: "Revenue", values: [25], color: BUDGET_POSITIVE_COLOR, budgetRole: "change" },
      { label: "Costs", values: [-15], color: BUDGET_NEGATIVE_COLOR, budgetRole: "change" },
      { label: "Closing", values: [110], color: BUDGET_TOTAL_COLOR, budgetRole: "closing" },
    ];
    base.showPercentages = false;
  }

  return base;
}

/** Deep-clones chart data so state and element customData snapshots do not share arrays. */
export function cloneConfig(config: ChartConfig): ChartConfig {
  return {
    ...config,
    series: config.series.map((series) => ({ ...series })),
    data: config.data.map((row) => ({ ...row, values: [...row.values] })),
  };
}

/** Reads v2 chart configs and migrates the original v1 single-value schema. */
export function readChartConfig(value: unknown): ChartConfig {
  const fallback = defaultChartConfig();
  if (!isRecord(value)) return fallback;

  const type = isChartType(value.type) ? value.type : fallback.type;
  const palette = typeof value.palette === "string" && PALETTES[value.palette] ? value.palette : fallback.palette;
  const series = readSeries(value.series, palette);
  const data = readData(value.data, palette, series.length);
  const config: ChartConfig = {
    version: 2,
    type,
    title: typeof value.title === "string" ? value.title.slice(0, 120) : fallback.title,
    width: boundedNumber(value.width, fallback.width, 280, 1400),
    height: boundedNumber(value.height, fallback.height, 220, 1000),
    palette,
    showLegend: readBoolean(value.showLegend, fallback.showLegend),
    showLabels: readBoolean(value.showLabels, fallback.showLabels),
    showValues: readBoolean(value.showValues, fallback.showValues),
    showPercentages: readBoolean(value.showPercentages, fallback.showPercentages),
    showAxes: readBoolean(value.showAxes, fallback.showAxes),
    showGrid: readBoolean(value.showGrid, fallback.showGrid),
    strokeWidth: boundedNumber(value.strokeWidth, fallback.strokeWidth, 1, 5),
    roughness: boundedNumber(value.roughness, fallback.roughness, 0, 2),
    donutHole: boundedNumber(value.donutHole, fallback.donutHole, 20, 75),
    series,
    data,
  };
  ensureSeriesWidths(config);
  if (config.type === "budget-walk") normalizeBudgetWalk(config);
  return config;
}

function readSeries(value: unknown, paletteName: string): ChartSeries[] {
  const palette = PALETTES[paletteName] ?? PALETTES.Classic ?? ["#4c6ef5"];
  if (!Array.isArray(value) || value.length === 0) {
    return [{ name: "Series 1", color: palette[0] ?? "#4c6ef5" }];
  }
  const result = value.slice(0, 8).flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    return [{
      name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim().slice(0, 60) : `Series ${index + 1}`,
      color: isColor(entry.color) ? entry.color : palette[index % palette.length] ?? "#4c6ef5",
    }];
  });
  return result.length > 0 ? result : [{ name: "Series 1", color: palette[0] ?? "#4c6ef5" }];
}

function readData(value: unknown, paletteName: string, seriesCount: number): ChartDatum[] {
  const palette = PALETTES[paletteName] ?? PALETTES.Classic ?? ["#4c6ef5"];
  if (!Array.isArray(value)) return defaultChartConfig().data;

  const rows = value.slice(0, 40).flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const legacyValue = Number(entry.value);
    const rawValues = Array.isArray(entry.values)
      ? entry.values.map((item) => Number(item)).filter((item) => Number.isFinite(item))
      : Number.isFinite(legacyValue) ? [legacyValue] : [];
    if (rawValues.length === 0) return [];
    const values = Array.from({ length: Math.max(1, seriesCount) }, (_, seriesIndex) => rawValues[seriesIndex] ?? 0);
    const role = isBudgetRole(entry.budgetRole) ? entry.budgetRole : undefined;
    return [{
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim().slice(0, 80) : `Item ${index + 1}`,
      values,
      color: isColor(entry.color) ? entry.color : palette[index % palette.length] ?? "#4c6ef5",
      ...(role ? { budgetRole: role } : {}),
    }];
  });
  return rows.length > 0 ? rows : defaultChartConfig().data;
}

/** Changes chart type and supplies a purpose-built sample when entering budget walk. */
export function changeChartType(config: ChartConfig, type: ChartType): ChartConfig {
  if (type === config.type) return cloneConfig(config);
  if (type === "budget-walk") {
    const next = defaultChartConfig("budget-walk");
    next.width = config.width;
    next.height = config.height;
    next.palette = config.palette;
    next.strokeWidth = config.strokeWidth;
    next.roughness = config.roughness;
    return next;
  }
  const next = cloneConfig(config);
  next.type = type;
  next.showPercentages = type === "pie" || type === "donut";
  if (config.type === "budget-walk") {
    const sample = defaultChartConfig(type);
    sample.width = config.width;
    sample.height = config.height;
    sample.palette = config.palette;
    sample.strokeWidth = config.strokeWidth;
    sample.roughness = config.roughness;
    return sample;
  }
  ensureSeriesWidths(next);
  return next;
}

/** Applies a palette to both series colors and per-slice colors. */
export function applyPalette(config: ChartConfig, paletteName: string): ChartConfig {
  const palette = PALETTES[paletteName] ?? PALETTES.Classic ?? ["#4c6ef5"];
  const next = cloneConfig(config);
  next.palette = paletteName;
  next.series = next.series.map((series, index) => ({ ...series, color: palette[index % palette.length] ?? "#4c6ef5" }));
  next.data = next.data.map((row, index) => ({ ...row, color: palette[index % palette.length] ?? "#4c6ef5" }));
  if (next.type === "budget-walk") normalizeBudgetWalk(next);
  return next;
}

export function supportsMultipleSeries(type: ChartType): boolean {
  return type === "bar" || type === "bar-horizontal" || type === "line" || type === "area";
}

export function isCircularType(type: ChartType): boolean {
  return type === "pie" || type === "donut";
}

export function getDatumValue(row: ChartDatum, seriesIndex = 0): number {
  return row.values[seriesIndex] ?? 0;
}

/** Adds a named series and a zero value for every category. */
export function addSeries(config: ChartConfig): void {
  if (config.series.length >= 8) return;
  const palette = PALETTES[config.palette] ?? PALETTES.Classic ?? ["#4c6ef5"];
  const index = config.series.length;
  config.series.push({ name: `Series ${index + 1}`, color: palette[index % palette.length] ?? "#4c6ef5" });
  config.data.forEach((row) => row.values.push(0));
}

/** Removes one series while guaranteeing at least one series remains. */
export function removeSeries(config: ChartConfig, seriesIndex: number): void {
  if (config.series.length <= 1) return;
  config.series.splice(seriesIndex, 1);
  config.data.forEach((row) => row.values.splice(seriesIndex, 1));
  ensureSeriesWidths(config);
}

export function ensureSeriesWidths(config: ChartConfig): void {
  if (config.series.length === 0) config.series.push({ name: "Series 1", color: "#4c6ef5" });
  config.data.forEach((row) => {
    while (row.values.length < config.series.length) row.values.push(0);
    if (row.values.length > config.series.length) row.values.length = config.series.length;
  });
}

/** Recomputes budget-walk roles and closing total from opening + all changes. */
export function normalizeBudgetWalk(config: ChartConfig): void {
  config.series = [{ name: config.series[0]?.name || "Amount", color: BUDGET_TOTAL_COLOR }];
  if (config.data.length < 2) {
    config.data = defaultChartConfig("budget-walk").data;
    return;
  }
  config.data.forEach((row) => {
    row.values = [row.values[0] ?? 0];
  });
  const first = config.data[0];
  const last = config.data.at(-1);
  if (!first || !last) return;
  first.budgetRole = "opening";
  first.color = BUDGET_TOTAL_COLOR;
  last.budgetRole = "closing";
  last.color = BUDGET_TOTAL_COLOR;
  config.data.slice(1, -1).forEach((row) => {
    row.budgetRole = "change";
    row.color = getDatumValue(row) >= 0 ? BUDGET_POSITIVE_COLOR : BUDGET_NEGATIVE_COLOR;
  });
  const closing = getDatumValue(first) + config.data.slice(1, -1).reduce((sum, row) => sum + getDatumValue(row), 0);
  last.values[0] = closing;
}

export function validateChart(config: ChartConfig): string | null {
  if (config.data.length === 0) return "Add at least one data row.";
  if (config.series.length === 0) return "Add at least one data series.";
  if (config.data.some((row) => row.values.some((value) => !Number.isFinite(value)))) return "Every value must be a valid number.";
  if (isCircularType(config.type) && config.data.some((row) => getDatumValue(row) < 0)) {
    return "Pie and donut charts cannot contain negative values.";
  }
  if (isCircularType(config.type) && config.data.reduce((sum, row) => sum + getDatumValue(row), 0) <= 0) {
    return "Pie and donut charts need a total greater than zero.";
  }
  if (config.type === "budget-walk" && config.data.length < 2) return "Budget walk needs an opening and closing value.";
  return null;
}

/** Parses Label, Value... text, optionally using a header row for series names. */
export function parseBulkData(text: string, paletteName: string): ParsedBulkData {
  const palette = PALETTES[paletteName] ?? PALETTES.Classic ?? ["#4c6ef5"];
  const rawLines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 41);
  if (rawLines.length === 0) return { rows: [], seriesNames: [] };
  const separator = rawLines.some((line) => line.includes("\t")) ? "\t" : rawLines.some((line) => line.includes(";")) ? ";" : ",";
  const parsed = rawLines.map((line) => line.split(separator).map((part) => part.trim().replace(/^['"]|['"]$/g, "")));
  const first = parsed[0] ?? [];
  const hasHeader = first.length > 1 && first.slice(1).some((cell) => !Number.isFinite(parseNumeric(cell)));
  const seriesNames = hasHeader
    ? first.slice(1).map((name, index) => name || `Series ${index + 1}`).slice(0, 8)
    : [];
  const body = (hasHeader ? parsed.slice(1) : parsed).slice(0, 40);
  const rows = body.flatMap((parts, index) => {
    if (parts.length < 2) return [];
    const values = parts.slice(1, 9).map(parseNumeric);
    if (values.length === 0 || values.some((value) => !Number.isFinite(value))) return [];
    return [{
      label: parts[0] || `Item ${index + 1}`,
      values,
      color: palette[index % palette.length] ?? "#4c6ef5",
    }];
  });
  return { rows, seriesNames };
}

export function getChartSelection(elements: ExcalidrawElement[]): ChartSelection | null {
  for (const element of elements) {
    const data = readElementChartData(element);
    if (data) return { chartId: data.chartId, config: cloneConfig(data.config), element };
  }
  return null;
}

export function readElementChartData(element: ExcalidrawElement): ChartElementData | null {
  const customData = isRecord(element.customData) ? element.customData : null;
  const raw = customData && isRecord(customData.chartStudio) ? customData.chartStudio : null;
  if (!raw || raw.namespace !== "ea-chart-studio" || raw.version !== 1 || typeof raw.chartId !== "string") return null;
  if (typeof raw.role !== "string") return null;
  return {
    namespace: "ea-chart-studio",
    version: 1,
    chartId: raw.chartId,
    role: raw.role,
    config: readChartConfig(raw.config),
    ...(typeof raw.dataIndex === "number" ? { dataIndex: raw.dataIndex } : {}),
    ...(typeof raw.seriesIndex === "number" ? { seriesIndex: raw.seriesIndex } : {}),
  };
}

export function isElementInChart(element: ExcalidrawElement, chartId: string): boolean {
  return readElementChartData(element)?.chartId === chartId;
}

export function chartTypeLabel(type: ChartType): string {
  const labels: Record<ChartType, string> = {
    pie: "Pie",
    donut: "Donut",
    bar: "Column",
    "bar-horizontal": "Bar",
    line: "Line",
    area: "Area",
    "budget-walk": "Budget walk",
  };
  return labels[type];
}

function parseNumeric(value: string): number {
  return Number(value.replace(/%$/, "").replace(/\s/g, ""));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isChartType(value: unknown): value is ChartType {
  return value === "pie" || value === "donut" || value === "bar" || value === "bar-horizontal" || value === "line" || value === "area" || value === "budget-walk";
}

function isBudgetRole(value: unknown): value is BudgetRole {
  return value === "opening" || value === "change" || value === "closing";
}

function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
