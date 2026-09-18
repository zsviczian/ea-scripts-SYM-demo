import type { ChartConfig, ChartElementData, ChartLocation } from "./chartTypes";

const TEXT_COLOR = "#212529";
const AXIS_COLOR = "#495057";
const GRID_COLOR = "#ced4da";
const LABEL_FONT_SIZE = 14;
const TITLE_FONT_SIZE = 22;
const LEGEND_SWATCH = 14;

interface Layout {
  x: number;
  y: number;
  width: number;
  height: number;
  plotX: number;
  plotY: number;
  plotWidth: number;
  plotHeight: number;
  legendX: number;
  legendWidth: number;
}

interface RenderContext {
  ea: ExcalidrawAutomate;
  config: ChartConfig;
  chartId: string;
  ids: string[];
}

export async function drawChart(
  ea: ExcalidrawAutomate,
  config: ChartConfig,
  chartId: string,
  location: ChartLocation,
  repositionToCursor: boolean,
): Promise<void> {
  ea.reset();
  const ctx: RenderContext = { ea, config, chartId, ids: [] };
  const layout = createLayout(config, location);
  drawTitle(ctx, layout);

  if (config.type === "pie" || config.type === "donut") drawCircularChart(ctx, layout);
  else if (config.type === "bar") drawVerticalBars(ctx, layout);
  else if (config.type === "bar-horizontal") drawHorizontalBars(ctx, layout);
  else drawLineOrArea(ctx, layout);

  if (config.showLegend) drawLegend(ctx, layout);
  await ea.addElementsToView(repositionToCursor, true);
}

function createLayout(config: ChartConfig, location: ChartLocation): Layout {
  const titleHeight = config.title.trim() ? 44 : 12;
  const legendWidth = config.showLegend ? Math.min(150, Math.max(110, config.width * 0.25)) : 0;
  const axisLeft = config.type === "pie" || config.type === "donut" ? 12 : 58;
  const axisBottom = config.type === "pie" || config.type === "donut" ? 12 : 50;
  const rightPad = legendWidth + 18;
  return {
    x: location.x,
    y: location.y,
    width: config.width,
    height: config.height,
    plotX: location.x + axisLeft,
    plotY: location.y + titleHeight,
    plotWidth: Math.max(120, config.width - axisLeft - rightPad),
    plotHeight: Math.max(100, config.height - titleHeight - axisBottom),
    legendX: location.x + config.width - legendWidth,
    legendWidth,
  };
}

function drawTitle(ctx: RenderContext, layout: Layout): void {
  if (!ctx.config.title.trim()) return;
  setTextStyle(ctx.ea, TITLE_FONT_SIZE);
  const id = ctx.ea.addText(layout.x + 8, layout.y + 4, ctx.config.title.trim(), {
    width: Math.max(120, layout.width - 16),
    textAlign: "left",
  });
  tag(ctx, id, "title");
}

function drawCircularChart(ctx: RenderContext, layout: Layout): void {
  const total = ctx.config.data.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  const radius = Math.max(45, Math.min(layout.plotWidth, layout.plotHeight) * 0.43);
  const cx = layout.plotX + layout.plotWidth / 2;
  const cy = layout.plotY + layout.plotHeight / 2;
  const innerRadius = ctx.config.type === "donut" ? radius * (ctx.config.donutHole / 100) : 0;
  let angle = -90;

  ctx.config.data.forEach((row, index) => {
    const sweep = total === 0 ? 0 : (Math.max(0, row.value) / total) * 360;
    if (sweep <= 0) return;
    setShapeStyle(ctx.ea, row.color, ctx.config);
    const id = ctx.ea.addLine(createWedgePoints(cx, cy, radius, innerRadius, angle, sweep));
    tag(ctx, id, "slice", index);
    if (ctx.config.showLabels || ctx.config.showValues || ctx.config.showPercentages) {
      drawCircularLabel(ctx, row.label, row.value, total, cx, cy, radius, innerRadius, angle, sweep, index);
    }
    angle += sweep;
  });
}

function createWedgePoints(
  cx: number,
  cy: number,
  radius: number,
  innerRadius: number,
  startAngle: number,
  sweepAngle: number,
): [number, number][] {
  const segments = Math.max(3, Math.min(90, Math.ceil(Math.abs(sweepAngle) / 5)));
  const outer = arcPoints(cx, cy, radius, startAngle, sweepAngle, segments);
  if (innerRadius <= 0) return [[cx, cy], ...outer, [cx, cy]];
  const inner = arcPoints(cx, cy, innerRadius, startAngle + sweepAngle, -sweepAngle, segments);
  return [...outer, ...inner, outer[0] ?? [cx, cy]];
}

function arcPoints(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  sweepAngle: number,
  segments: number,
): [number, number][] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = ((startAngle + (sweepAngle * index) / segments) * Math.PI) / 180;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

function drawCircularLabel(
  ctx: RenderContext,
  label: string,
  value: number,
  total: number,
  cx: number,
  cy: number,
  radius: number,
  innerRadius: number,
  startAngle: number,
  sweepAngle: number,
  index: number,
): void {
  const midAngle = ((startAngle + sweepAngle / 2) * Math.PI) / 180;
  const labelRadius = innerRadius > 0 ? (radius + innerRadius) / 2 : radius * 0.62;
  const text = composeDataLabel(ctx.config, label, value, total);
  if (!text) return;
  setTextStyle(ctx.ea, LABEL_FONT_SIZE);
  const width = Math.max(54, Math.min(130, text.length * 7.2));
  const x = cx + Math.cos(midAngle) * labelRadius - width / 2;
  const y = cy + Math.sin(midAngle) * labelRadius - 10;
  const id = ctx.ea.addText(x, y, text, { width, textAlign: "center" });
  tag(ctx, id, "data-label", index);
}

function drawVerticalBars(ctx: RenderContext, layout: Layout): void {
  const scale = createScale(ctx.config.data.map((row) => row.value));
  drawCartesianGrid(ctx, layout, scale, false);
  const gap = Math.max(6, layout.plotWidth * 0.015);
  const slot = layout.plotWidth / Math.max(1, ctx.config.data.length);
  const barWidth = Math.max(8, slot - gap * 2);
  const zeroY = mapY(0, scale.min, scale.max, layout.plotY, layout.plotHeight);

  ctx.config.data.forEach((row, index) => {
    const x = layout.plotX + index * slot + (slot - barWidth) / 2;
    const valueY = mapY(row.value, scale.min, scale.max, layout.plotY, layout.plotHeight);
    const y = Math.min(zeroY, valueY);
    const height = Math.max(1, Math.abs(zeroY - valueY));
    setShapeStyle(ctx.ea, row.color, ctx.config);
    const id = ctx.ea.addRect(x, y, barWidth, height);
    tag(ctx, id, "bar", index);
    drawCartesianDataLabel(ctx, row.label, row.value, x + barWidth / 2, row.value >= 0 ? y - 22 : y + height + 4, index);
    drawCategoryLabel(ctx, row.label, x + barWidth / 2, layout.plotY + layout.plotHeight + 9, slot, index);
  });
}

function drawHorizontalBars(ctx: RenderContext, layout: Layout): void {
  const adjusted = { ...layout, plotX: layout.plotX + 45, plotWidth: Math.max(100, layout.plotWidth - 45) };
  const scale = createScale(ctx.config.data.map((row) => row.value));
  drawCartesianGrid(ctx, adjusted, scale, true);
  const slot = adjusted.plotHeight / Math.max(1, ctx.config.data.length);
  const barHeight = Math.max(8, slot * 0.58);
  const zeroX = mapX(0, scale.min, scale.max, adjusted.plotX, adjusted.plotWidth);

  ctx.config.data.forEach((row, index) => {
    const valueX = mapX(row.value, scale.min, scale.max, adjusted.plotX, adjusted.plotWidth);
    const x = Math.min(zeroX, valueX);
    const y = adjusted.plotY + index * slot + (slot - barHeight) / 2;
    const width = Math.max(1, Math.abs(zeroX - valueX));
    setShapeStyle(ctx.ea, row.color, ctx.config);
    const id = ctx.ea.addRect(x, y, width, barHeight);
    tag(ctx, id, "bar", index);
    drawHorizontalCategory(ctx, row.label, adjusted.plotX - 104, y + barHeight / 2 - 9, index);
    drawCartesianDataLabel(ctx, "", row.value, row.value >= 0 ? x + width + 28 : x - 28, y + barHeight / 2 - 9, index);
  });
}

function drawLineOrArea(ctx: RenderContext, layout: Layout): void {
  const scale = createScale(ctx.config.data.map((row) => row.value));
  drawCartesianGrid(ctx, layout, scale, false);
  const count = ctx.config.data.length;
  const points = ctx.config.data.map((row, index) => {
    const x = count === 1 ? layout.plotX + layout.plotWidth / 2 : layout.plotX + (index / (count - 1)) * layout.plotWidth;
    const y = mapY(row.value, scale.min, scale.max, layout.plotY, layout.plotHeight);
    return [x, y] as [number, number];
  });

  if (ctx.config.type === "area" && points.length > 0) {
    const zeroY = mapY(0, scale.min, scale.max, layout.plotY, layout.plotHeight);
    const first = points[0] ?? [layout.plotX, zeroY];
    const last = points.at(-1) ?? first;
    setShapeStyle(ctx.ea, ctx.config.data[0]?.color ?? "#4c6ef5", ctx.config);
    ctx.ea.style.opacity = 35;
    const id = ctx.ea.addLine([[first[0], zeroY], ...points, [last[0], zeroY], [first[0], zeroY]]);
    tag(ctx, id, "area");
  }

  if (points.length > 1) {
    setLineStyle(ctx.ea, ctx.config.data[0]?.color ?? "#4c6ef5", ctx.config);
    const id = ctx.ea.addLine(points);
    tag(ctx, id, "series-line");
  }

  points.forEach(([x, y], index) => {
    const row = ctx.config.data[index];
    if (!row) return;
    setShapeStyle(ctx.ea, row.color, ctx.config);
    const id = ctx.ea.addEllipse(x - 5, y - 5, 10, 10);
    tag(ctx, id, "point", index);
    drawCartesianDataLabel(ctx, row.label, row.value, x, y - 25, index);
    drawCategoryLabel(ctx, row.label, x, layout.plotY + layout.plotHeight + 9, Math.max(58, layout.plotWidth / Math.max(1, points.length)), index);
  });
}

function createScale(values: number[]): { min: number; max: number } {
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) {
    if (max === 0) max = 1;
    else {
      min = Math.min(0, min - Math.abs(min) * 0.1);
      max += Math.abs(max) * 0.1;
    }
  }
  const span = max - min;
  return { min: min - span * 0.08, max: max + span * 0.08 };
}

function drawCartesianGrid(ctx: RenderContext, layout: Layout, scale: { min: number; max: number }, horizontal: boolean): void {
  if (ctx.config.showGrid) {
    for (let index = 0; index <= 4; index += 1) {
      setGuideStyle(ctx.ea, GRID_COLOR, 1);
      if (horizontal) {
        const x = layout.plotX + (layout.plotWidth * index) / 4;
        tag(ctx, ctx.ea.addLine([[x, layout.plotY], [x, layout.plotY + layout.plotHeight]]), "grid");
      } else {
        const y = layout.plotY + (layout.plotHeight * index) / 4;
        tag(ctx, ctx.ea.addLine([[layout.plotX, y], [layout.plotX + layout.plotWidth, y]]), "grid");
      }
    }
  }
  if (!ctx.config.showAxes) return;
  setGuideStyle(ctx.ea, AXIS_COLOR, Math.max(1, ctx.config.strokeWidth));
  const zeroY = mapY(0, scale.min, scale.max, layout.plotY, layout.plotHeight);
  const zeroX = mapX(0, scale.min, scale.max, layout.plotX, layout.plotWidth);
  if (horizontal) {
    tag(ctx, ctx.ea.addLine([[zeroX, layout.plotY], [zeroX, layout.plotY + layout.plotHeight]]), "axis");
    tag(ctx, ctx.ea.addLine([[layout.plotX, layout.plotY + layout.plotHeight], [layout.plotX + layout.plotWidth, layout.plotY + layout.plotHeight]]), "axis");
  } else {
    tag(ctx, ctx.ea.addLine([[layout.plotX, layout.plotY], [layout.plotX, layout.plotY + layout.plotHeight]]), "axis");
    tag(ctx, ctx.ea.addLine([[layout.plotX, zeroY], [layout.plotX + layout.plotWidth, zeroY]]), "axis");
  }
}

function mapY(value: number, min: number, max: number, y: number, height: number): number {
  return y + height - ((value - min) / (max - min)) * height;
}

function mapX(value: number, min: number, max: number, x: number, width: number): number {
  return x + ((value - min) / (max - min)) * width;
}

function drawCategoryLabel(ctx: RenderContext, label: string, centerX: number, y: number, slotWidth: number, index: number): void {
  if (!ctx.config.showLabels) return;
  setTextStyle(ctx.ea, 12);
  const width = Math.max(40, Math.min(110, slotWidth));
  const id = ctx.ea.addText(centerX - width / 2, y, truncate(label, 16), { width, textAlign: "center" });
  tag(ctx, id, "category-label", index);
}

function drawHorizontalCategory(ctx: RenderContext, label: string, x: number, y: number, index: number): void {
  if (!ctx.config.showLabels) return;
  setTextStyle(ctx.ea, 12);
  const id = ctx.ea.addText(x, y, truncate(label, 16), { width: 96, textAlign: "right" });
  tag(ctx, id, "category-label", index);
}

function drawCartesianDataLabel(ctx: RenderContext, label: string, value: number, x: number, y: number, index: number): void {
  if (!ctx.config.showValues) return;
  setTextStyle(ctx.ea, 12);
  const text = label && !ctx.config.showLabels ? `${truncate(label, 12)} ${formatNumber(value)}` : formatNumber(value);
  const width = Math.max(48, Math.min(120, text.length * 7));
  const id = ctx.ea.addText(x - width / 2, y, text, { width, textAlign: "center" });
  tag(ctx, id, "value-label", index);
}

function drawLegend(ctx: RenderContext, layout: Layout): void {
  if (layout.legendWidth <= 0) return;
  const maxRows = Math.max(1, Math.floor((layout.height - 58) / 25));
  ctx.config.data.slice(0, maxRows).forEach((row, index) => {
    const y = layout.y + 50 + index * 25;
    setShapeStyle(ctx.ea, row.color, { ...ctx.config, strokeWidth: 1, roughness: 0 });
    const swatchId = ctx.ea.addRect(layout.legendX + 4, y + 2, LEGEND_SWATCH, LEGEND_SWATCH);
    tag(ctx, swatchId, "legend-swatch", index);
    setTextStyle(ctx.ea, 12);
    const text = `${truncate(row.label, 17)}${ctx.config.showValues ? `  ${formatNumber(row.value)}` : ""}`;
    const textId = ctx.ea.addText(layout.legendX + 24, y, text, { width: Math.max(70, layout.legendWidth - 28) });
    tag(ctx, textId, "legend-label", index);
  });
}

function composeDataLabel(config: ChartConfig, label: string, value: number, total: number): string {
  const parts: string[] = [];
  if (config.showLabels) parts.push(truncate(label, 14));
  if (config.showValues) parts.push(formatNumber(value));
  if (config.showPercentages) parts.push(total === 0 ? "0%" : `${((value / total) * 100).toFixed(1)}%`);
  return parts.join("\n");
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, Math.max(1, length - 1))}…` : value;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function setShapeStyle(ea: ExcalidrawAutomate, color: string, config: ChartConfig): void {
  ea.style.strokeColor = AXIS_COLOR;
  ea.style.backgroundColor = color;
  ea.style.strokeWidth = config.strokeWidth;
  ea.style.fillStyle = "solid";
  ea.style.roughness = config.roughness;
  ea.style.opacity = 100;
}

function setLineStyle(ea: ExcalidrawAutomate, color: string, config: ChartConfig): void {
  ea.style.strokeColor = color;
  ea.style.backgroundColor = "transparent";
  ea.style.strokeWidth = Math.max(2, config.strokeWidth);
  ea.style.fillStyle = "solid";
  ea.style.roughness = config.roughness;
  ea.style.opacity = 100;
}

function setGuideStyle(ea: ExcalidrawAutomate, color: string, width: number): void {
  ea.style.strokeColor = color;
  ea.style.backgroundColor = "transparent";
  ea.style.strokeWidth = width;
  ea.style.fillStyle = "solid";
  ea.style.roughness = 0;
  ea.style.opacity = 100;
}

function setTextStyle(ea: ExcalidrawAutomate, size: number): void {
  ea.style.strokeColor = TEXT_COLOR;
  ea.style.backgroundColor = "transparent";
  ea.style.fontSize = size;
  ea.style.fontFamily = 2;
  ea.style.textAlign = "left";
  ea.style.verticalAlign = "top";
  ea.style.roughness = 0;
  ea.style.opacity = 100;
}

function tag(ctx: RenderContext, id: string, role: string, dataIndex?: number): void {
  const metadata: ChartElementData = {
    namespace: "ea-chart-studio",
    version: 1,
    chartId: ctx.chartId,
    role,
    config: { ...ctx.config, data: ctx.config.data.map((row) => ({ ...row })) },
    ...(dataIndex === undefined ? {} : { dataIndex }),
  };
  ctx.ea.addAppendUpdateCustomData(id, { chartStudio: metadata });
  ctx.ids.push(id);
}
