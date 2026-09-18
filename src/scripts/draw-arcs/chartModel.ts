import type { ChartConfig, ChartDatum, ChartElementData, ChartSelection, ChartType } from "./chartTypes";

export const PALETTES: Record<string, readonly string[]> = {
  Classic: ["#4c6ef5", "#f06595", "#12b886", "#fab005", "#7950f2", "#15aabf", "#fa5252", "#82c91e"],
  Pastel: ["#a5d8ff", "#ffc9c9", "#b2f2bb", "#ffec99", "#d0bfff", "#99e9f2", "#ffd8a8", "#eebefa"],
  Ocean: ["#1864ab", "#1971c2", "#1c7ed6", "#228be6", "#339af0", "#4dabf7", "#74c0fc", "#a5d8ff"],
  Forest: ["#2b8a3e", "#37b24d", "#40c057", "#51cf66", "#69db7c", "#8ce99a", "#b2f2bb", "#d3f9d8"],
  Sunset: ["#e03131", "#f03e3e", "#f76707", "#fd7e14", "#f59f00", "#fab005", "#fcc419", "#ffe066"],
  Mono: ["#212529", "#343a40", "#495057", "#868e96", "#adb5bd", "#ced4da", "#dee2e6", "#f1f3f5"],
};

const DEFAULT_DATA: ChartDatum[] = [
  { label: "Alpha", value: 40, color: PALETTES.Classic?.[0] ?? "#4c6ef5" },
  { label: "Beta", value: 30, color: PALETTES.Classic?.[1] ?? "#f06595" },
  { label: "Gamma", value: 20, color: PALETTES.Classic?.[2] ?? "#12b886" },
  { label: "Delta", value: 10, color: PALETTES.Classic?.[3] ?? "#fab005" },
];

export function defaultChartConfig(): ChartConfig {
  return {
    version: 1,
    type: "pie",
    title: "My chart",
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
    data: DEFAULT_DATA.map((row) => ({ ...row })),
  };
}

export function cloneConfig(config: ChartConfig): ChartConfig {
  return { ...config, data: config.data.map((row) => ({ ...row })) };
}

export function readChartConfig(value: unknown): ChartConfig {
  const fallback = defaultChartConfig();
  if (!isRecord(value)) return fallback;

  const type = isChartType(value.type) ? value.type : fallback.type;
  const palette = typeof value.palette === "string" && PALETTES[value.palette] ? value.palette : fallback.palette;
  const data = readData(value.data, palette);

  return {
    version: 1,
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
    data,
  };
}

function readData(value: unknown, paletteName: string): ChartDatum[] {
  const palette = PALETTES[paletteName] ?? PALETTES.Classic ?? ["#4c6ef5"];
  if (!Array.isArray(value)) return defaultChartConfig().data;

  const rows = value.slice(0, 40).flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const numeric = Number(entry.value);
    if (!Number.isFinite(numeric)) return [];
    return [{
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim().slice(0, 80) : `Item ${index + 1}`,
      value: numeric,
      color: isColor(entry.color) ? entry.color : palette[index % palette.length] ?? "#4c6ef5",
    }];
  });
  return rows.length > 0 ? rows : defaultChartConfig().data;
}

export function applyPalette(config: ChartConfig, paletteName: string): ChartConfig {
  const palette = PALETTES[paletteName] ?? PALETTES.Classic ?? ["#4c6ef5"];
  return {
    ...config,
    palette: paletteName,
    data: config.data.map((row, index) => ({ ...row, color: palette[index % palette.length] ?? "#4c6ef5" })),
  };
}

export function validateChart(config: ChartConfig): string | null {
  if (config.data.length === 0) return "Add at least one data row.";
  if (config.data.some((row) => !Number.isFinite(row.value))) return "Every value must be a valid number.";
  if ((config.type === "pie" || config.type === "donut") && config.data.some((row) => row.value < 0)) {
    return "Pie and donut charts cannot contain negative values.";
  }
  if ((config.type === "pie" || config.type === "donut") && config.data.reduce((sum, row) => sum + row.value, 0) <= 0) {
    return "Pie and donut charts need a total greater than zero.";
  }
  return null;
}

export function parseBulkData(text: string, paletteName: string): ChartDatum[] {
  const palette = PALETTES[paletteName] ?? PALETTES.Classic ?? ["#4c6ef5"];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40)
    .flatMap((line, index) => {
      const separator = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
      const parts = line.split(separator);
      const rawValue = parts.at(-1)?.trim() ?? "";
      const numeric = Number(rawValue.replace(/%$/, ""));
      if (!Number.isFinite(numeric)) return [];
      const label = parts.slice(0, -1).join(separator).trim().replace(/^['"]|['"]$/g, "") || `Item ${index + 1}`;
      return [{ label, value: numeric, color: palette[index % palette.length] ?? "#4c6ef5" }];
    });
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
  };
  return labels[type];
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
  return value === "pie" || value === "donut" || value === "bar" || value === "bar-horizontal" || value === "line" || value === "area";
}

function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
