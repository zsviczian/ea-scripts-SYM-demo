/**
 * @file chartTypes.ts
 * @overview Shared Chart Studio data model for single-series, multi-series, and budget-walk charts.
 */

export type ChartType = "pie" | "donut" | "bar" | "bar-horizontal" | "line" | "area" | "budget-walk";
export type BudgetRole = "opening" | "change" | "closing";
export type BarMode = "grouped" | "stacked" | "percent";

export interface ChartSeries {
  name: string;
  color: string;
}

export interface ChartDatum {
  label: string;
  /** One value per series. Pie/donut/budget-walk use values[0]. */
  values: number[];
  /** Per-slice color used by pie and donut charts. */
  color: string;
  /** Present on budget-walk rows. */
  budgetRole?: BudgetRole;
}

export interface ChartConfig {
  version: 3;
  type: ChartType;
  title: string;
  width: number;
  height: number;
  palette: string;
  showLegend: boolean;
  showLabels: boolean;
  showValues: boolean;
  showPercentages: boolean;
  showAxes: boolean;
  showGrid: boolean;
  strokeWidth: number;
  roughness: number;
  donutHole: number;
  /** Layout for column/horizontal bar charts. `percent` normalizes each category to 100%. */
  barMode: BarMode;
  series: ChartSeries[];
  data: ChartDatum[];
}

export interface ChartElementData {
  namespace: "ea-chart-studio";
  /** Metadata envelope version. Kept at 1 for backwards compatibility. */
  version: 1;
  chartId: string;
  role: string;
  config: ChartConfig;
  dataIndex?: number;
  seriesIndex?: number;
}

export interface ChartLocation {
  x: number;
  y: number;
}

export interface ChartSelection {
  chartId: string;
  config: ChartConfig;
  element: ExcalidrawElement;
}
