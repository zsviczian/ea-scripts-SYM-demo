/** Chart model shared by the side panel and Excalidraw renderer. */

export type ChartType = "pie" | "donut" | "bar" | "bar-horizontal" | "line" | "area";

export interface ChartDatum {
  label: string;
  value: number;
  color: string;
}

export interface ChartConfig {
  version: 1;
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
  data: ChartDatum[];
}

export interface ChartElementData {
  namespace: "ea-chart-studio";
  version: 1;
  chartId: string;
  role: string;
  config: ChartConfig;
  dataIndex?: number;
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
