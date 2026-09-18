/**
 * @file chartRenderer.ts
 * @overview Renders Chart Studio configurations as grouped, native Excalidraw elements with full chart metadata in customData.
 */

import {
  BUDGET_NEGATIVE_COLOR,
  BUDGET_POSITIVE_COLOR,
  BUDGET_TOTAL_COLOR,
  cloneConfig,
  getDatumValue,
  getPercentShare,
  getStackedExtents,
  isCircularType,
  normalizeBudgetWalk,
  supportsMultipleSeries,
} from "./chartModel";
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

/** Draws a complete chart at an exact scene location and groups all generated elements. */
export async function drawChart(
  ea: ExcalidrawAutomate,
  config: ChartConfig,
  chartId: string,
  location: ChartLocation,
): Promise<void> {
  ea.clear();
  const normalized = cloneConfig(config);
  if (normalized.type === "budget-walk") normalizeBudgetWalk(normalized);
  const ctx: RenderContext = { ea, config: normalized, chartId, ids: [] };
  const layout = createLayout(normalized, location);
  drawTitle(ctx, layout);

  if (isCircularType(normalized.type)) drawCircularChart(ctx, layout);
  else if (normalized.type === "bar") drawVerticalBars(ctx, layout);
  else if (normalized.type === "bar-horizontal") drawHorizontalBars(ctx, layout);
  else if (normalized.type === "budget-walk") drawBudgetWalk(ctx, layout);
  else drawLineOrArea(ctx, layout);

  if (normalized.showLegend) drawLegend(ctx, layout);
  if (ctx.ids.length > 1) ea.addToGroup(ctx.ids);
  await ea.addElementsToView(false, true, true);
}

function createLayout(config: ChartConfig, location: ChartLocation): Layout {
  const titleHeight = config.title.trim() ? 44 : 12;
  const legendWidth = config.showLegend ? Math.min(160, Math.max(110, config.width * 0.25)) : 0;
  const circular = isCircularType(config.type);
  const axisLeft = circular ? 12 : config.type === "bar-horizontal" ? 96 : 58;
  const axisBottom = circular ? 12 : 50;
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
  const total = ctx.config.data.reduce((sum, row) => sum + Math.max(0, getDatumValue(row)), 0);
  const radius = Math.max(45, Math.min(layout.plotWidth, layout.plotHeight) * 0.43);
  const cx = layout.plotX + layout.plotWidth / 2;
  const cy = layout.plotY + layout.plotHeight / 2;
  const innerRadius = ctx.config.type === "donut" ? radius * (ctx.config.donutHole / 100) : 0;
  let angle = -90;

  ctx.config.data.forEach((row, index) => {
    const value = getDatumValue(row);
    const sweep = total === 0 ? 0 : (Math.max(0, value) / total) * 360;
    if (sweep <= 0) return;
    setShapeStyle(ctx.ea, row.color, ctx.config);
    const id = ctx.ea.addLine(createWedgePoints(cx, cy, radius, innerRadius, angle, sweep));
    tag(ctx, id, "slice", index, 0);
    if (ctx.config.showLabels || ctx.config.showValues || ctx.config.showPercentages) {
      drawCircularLabel(ctx, row.label, value, total, cx, cy, radius, innerRadius, angle, sweep, index);
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
  const text = composeCircularLabel(ctx.config, label, value, total);
  if (!text) return;
  setTextStyle(ctx.ea, LABEL_FONT_SIZE);
  const width = Math.max(54, Math.min(130, text.length * 7.2));
  const x = cx + Math.cos(midAngle) * labelRadius - width / 2;
  const y = cy + Math.sin(midAngle) * labelRadius - 10;
  const id = ctx.ea.addText(x, y, text, { width, textAlign: "center" });
  tag(ctx, id, "data-label", index, 0);
}

function drawVerticalBars(ctx: RenderContext, layout: Layout): void {
  if (ctx.config.barMode === "grouped") {
    drawGroupedVerticalBars(ctx, layout);
    return;
  }

  const percent = ctx.config.barMode === "percent";
  const scale = percent ? { min: 0, max: 100 } : createScale(getStackedExtents(ctx.config));
  drawCartesianGrid(ctx, layout, scale, false);
  const categories = Math.max(1, ctx.config.data.length);
  const slot = layout.plotWidth / categories;
  const barWidth = Math.max(10, slot * 0.66);

  ctx.config.data.forEach((row, dataIndex) => {
    const x = layout.plotX + dataIndex * slot + (slot - barWidth) / 2;
    let positive = 0;
    let negative = 0;
    ctx.config.series.forEach((series, seriesIndex) => {
      const rawValue = getDatumValue(row, seriesIndex);
      const value = percent ? getPercentShare(row, seriesIndex) : rawValue;
      const start = percent || value >= 0 ? positive : negative;
      const end = start + value;
      if (percent || value >= 0) positive = end;
      else negative = end;
      const startY = mapY(start, scale.min, scale.max, layout.plotY, layout.plotHeight);
      const endY = mapY(end, scale.min, scale.max, layout.plotY, layout.plotHeight);
      const y = Math.min(startY, endY);
      const height = Math.max(1, Math.abs(startY - endY));
      setShapeStyle(ctx.ea, series.color, ctx.config);
      const id = ctx.ea.addRect(x, y, barWidth, height);
      tag(ctx, id, percent ? "bar-percent-segment" : "bar-stacked-segment", dataIndex, seriesIndex);
      drawStackedValueLabel(ctx, rawValue, value, percent, x + barWidth / 2, y + height / 2 - 9, dataIndex, seriesIndex);
    });
    drawCategoryLabel(ctx, row.label, x + barWidth / 2, layout.plotY + layout.plotHeight + 9, slot, dataIndex);
  });
}

function drawGroupedVerticalBars(ctx: RenderContext, layout: Layout): void {
  const scale = createScale(allCartesianValues(ctx.config));
  drawCartesianGrid(ctx, layout, scale, false);
  const categories = Math.max(1, ctx.config.data.length);
  const seriesCount = Math.max(1, ctx.config.series.length);
  const slot = layout.plotWidth / categories;
  const groupWidth = slot * 0.76;
  const seriesGap = Math.min(6, groupWidth * 0.04);
  const barWidth = Math.max(4, (groupWidth - seriesGap * Math.max(0, seriesCount - 1)) / seriesCount);
  const zeroY = mapY(0, scale.min, scale.max, layout.plotY, layout.plotHeight);

  ctx.config.data.forEach((row, dataIndex) => {
    const groupX = layout.plotX + dataIndex * slot + (slot - groupWidth) / 2;
    ctx.config.series.forEach((series, seriesIndex) => {
      const value = getDatumValue(row, seriesIndex);
      const valueY = mapY(value, scale.min, scale.max, layout.plotY, layout.plotHeight);
      const x = groupX + seriesIndex * (barWidth + seriesGap);
      const y = Math.min(zeroY, valueY);
      const height = Math.max(1, Math.abs(zeroY - valueY));
      setShapeStyle(ctx.ea, series.color, ctx.config);
      const id = ctx.ea.addRect(x, y, barWidth, height);
      tag(ctx, id, "bar", dataIndex, seriesIndex);
      drawCartesianValueLabel(ctx, value, x + barWidth / 2, value >= 0 ? y - 21 : y + height + 4, dataIndex, seriesIndex);
    });
    drawCategoryLabel(ctx, row.label, layout.plotX + dataIndex * slot + slot / 2, layout.plotY + layout.plotHeight + 9, slot, dataIndex);
  });
}

function drawHorizontalBars(ctx: RenderContext, layout: Layout): void {
  if (ctx.config.barMode === "grouped") {
    drawGroupedHorizontalBars(ctx, layout);
    return;
  }

  const percent = ctx.config.barMode === "percent";
  const scale = percent ? { min: 0, max: 100 } : createScale(getStackedExtents(ctx.config));
  drawCartesianGrid(ctx, layout, scale, true);
  const categories = Math.max(1, ctx.config.data.length);
  const slot = layout.plotHeight / categories;
  const barHeight = Math.max(10, slot * 0.66);

  ctx.config.data.forEach((row, dataIndex) => {
    const y = layout.plotY + dataIndex * slot + (slot - barHeight) / 2;
    let positive = 0;
    let negative = 0;
    ctx.config.series.forEach((series, seriesIndex) => {
      const rawValue = getDatumValue(row, seriesIndex);
      const value = percent ? getPercentShare(row, seriesIndex) : rawValue;
      const start = percent || value >= 0 ? positive : negative;
      const end = start + value;
      if (percent || value >= 0) positive = end;
      else negative = end;
      const startX = mapX(start, scale.min, scale.max, layout.plotX, layout.plotWidth);
      const endX = mapX(end, scale.min, scale.max, layout.plotX, layout.plotWidth);
      const x = Math.min(startX, endX);
      const width = Math.max(1, Math.abs(startX - endX));
      setShapeStyle(ctx.ea, series.color, ctx.config);
      const id = ctx.ea.addRect(x, y, width, barHeight);
      tag(ctx, id, percent ? "bar-percent-segment" : "bar-stacked-segment", dataIndex, seriesIndex);
      drawStackedValueLabel(ctx, rawValue, value, percent, x + width / 2, y + barHeight / 2 - 9, dataIndex, seriesIndex);
    });
    drawHorizontalCategory(ctx, row.label, layout.plotX - 102, y + barHeight / 2 - 9, dataIndex);
  });
}

function drawGroupedHorizontalBars(ctx: RenderContext, layout: Layout): void {
  const scale = createScale(allCartesianValues(ctx.config));
  drawCartesianGrid(ctx, layout, scale, true);
  const categories = Math.max(1, ctx.config.data.length);
  const seriesCount = Math.max(1, ctx.config.series.length);
  const slot = layout.plotHeight / categories;
  const groupHeight = slot * 0.76;
  const seriesGap = Math.min(5, groupHeight * 0.05);
  const barHeight = Math.max(4, (groupHeight - seriesGap * Math.max(0, seriesCount - 1)) / seriesCount);
  const zeroX = mapX(0, scale.min, scale.max, layout.plotX, layout.plotWidth);

  ctx.config.data.forEach((row, dataIndex) => {
    const groupY = layout.plotY + dataIndex * slot + (slot - groupHeight) / 2;
    ctx.config.series.forEach((series, seriesIndex) => {
      const value = getDatumValue(row, seriesIndex);
      const valueX = mapX(value, scale.min, scale.max, layout.plotX, layout.plotWidth);
      const x = Math.min(zeroX, valueX);
      const y = groupY + seriesIndex * (barHeight + seriesGap);
      const width = Math.max(1, Math.abs(zeroX - valueX));
      setShapeStyle(ctx.ea, series.color, ctx.config);
      const id = ctx.ea.addRect(x, y, width, barHeight);
      tag(ctx, id, "bar", dataIndex, seriesIndex);
      drawCartesianValueLabel(ctx, value, value >= 0 ? x + width + 28 : x - 28, y + barHeight / 2 - 9, dataIndex, seriesIndex);
    });
    drawHorizontalCategory(ctx, row.label, layout.plotX - 102, layout.plotY + dataIndex * slot + slot / 2 - 9, dataIndex);
  });
}

function drawLineOrArea(ctx: RenderContext, layout: Layout): void {
  const scale = createScale(allCartesianValues(ctx.config));
  drawCartesianGrid(ctx, layout, scale, false);
  const count = ctx.config.data.length;
  const zeroY = mapY(0, scale.min, scale.max, layout.plotY, layout.plotHeight);

  ctx.config.series.forEach((series, seriesIndex) => {
    const points = ctx.config.data.map((row, dataIndex) => {
      const x = count === 1 ? layout.plotX + layout.plotWidth / 2 : layout.plotX + (dataIndex / (count - 1)) * layout.plotWidth;
      const y = mapY(getDatumValue(row, seriesIndex), scale.min, scale.max, layout.plotY, layout.plotHeight);
      return [x, y] as [number, number];
    });

    if (ctx.config.type === "area" && points.length > 0) {
      const first = points[0] ?? [layout.plotX, zeroY];
      const last = points.at(-1) ?? first;
      setShapeStyle(ctx.ea, series.color, ctx.config);
      ctx.ea.style.opacity = Math.max(14, 38 - seriesIndex * 5);
      const id = ctx.ea.addLine([[first[0], zeroY], ...points, [last[0], zeroY], [first[0], zeroY]]);
      tag(ctx, id, "area", undefined, seriesIndex);
    }

    if (points.length > 1) {
      setLineStyle(ctx.ea, series.color, ctx.config);
      const id = ctx.ea.addLine(points);
      tag(ctx, id, "series-line", undefined, seriesIndex);
    }

    points.forEach(([x, y], dataIndex) => {
      const row = ctx.config.data[dataIndex];
      if (!row) return;
      setShapeStyle(ctx.ea, series.color, ctx.config);
      const id = ctx.ea.addEllipse(x - 5, y - 5, 10, 10);
      tag(ctx, id, "point", dataIndex, seriesIndex);
      const offset = seriesIndex % 2 === 0 ? -25 - Math.floor(seriesIndex / 2) * 14 : 6 + Math.floor(seriesIndex / 2) * 14;
      drawCartesianValueLabel(ctx, getDatumValue(row, seriesIndex), x, y + offset, dataIndex, seriesIndex);
    });
  });

  ctx.config.data.forEach((row, dataIndex) => {
    const x = count === 1 ? layout.plotX + layout.plotWidth / 2 : layout.plotX + (dataIndex / (count - 1)) * layout.plotWidth;
    drawCategoryLabel(ctx, row.label, x, layout.plotY + layout.plotHeight + 9, Math.max(58, layout.plotWidth / Math.max(1, count)), dataIndex);
  });
}

function drawBudgetWalk(ctx: RenderContext, layout: Layout): void {
  normalizeBudgetWalk(ctx.config);
  const rows = ctx.config.data;
  const opening = getDatumValue(rows[0] ?? { label: "", values: [0], color: BUDGET_TOTAL_COLOR });
  const levels: number[] = [0, opening];
  let running = opening;
  rows.slice(1, -1).forEach((row) => {
    levels.push(running);
    running += getDatumValue(row);
    levels.push(running);
  });
  levels.push(0, running);
  const scale = createScale(levels);
  drawCartesianGrid(ctx, layout, scale, false);
  const slot = layout.plotWidth / Math.max(1, rows.length);
  const barWidth = Math.max(10, slot * 0.58);
  const zeroY = mapY(0, scale.min, scale.max, layout.plotY, layout.plotHeight);
  running = opening;

  rows.forEach((row, index) => {
    const role = row.budgetRole ?? (index === 0 ? "opening" : index === rows.length - 1 ? "closing" : "change");
    const value = getDatumValue(row);
    let startValue = 0;
    let endValue = value;
    let color = BUDGET_TOTAL_COLOR;
    if (role === "change") {
      startValue = running;
      endValue = running + value;
      color = value >= 0 ? BUDGET_POSITIVE_COLOR : BUDGET_NEGATIVE_COLOR;
    } else if (role === "closing") {
      startValue = 0;
      endValue = running;
      color = BUDGET_TOTAL_COLOR;
    } else {
      endValue = opening;
    }

    const startY = mapY(startValue, scale.min, scale.max, layout.plotY, layout.plotHeight);
    const endY = mapY(endValue, scale.min, scale.max, layout.plotY, layout.plotHeight);
    const x = layout.plotX + index * slot + (slot - barWidth) / 2;
    const y = Math.min(startY, endY);
    const height = Math.max(1, Math.abs(startY - endY));
    setShapeStyle(ctx.ea, color, ctx.config);
    const id = ctx.ea.addRect(x, y, barWidth, height);
    tag(ctx, id, `budget-${role}`, index, 0);

    if (index < rows.length - 1) {
      const connectorLevel = role === "change" ? endValue : endValue;
      const connectorY = mapY(connectorLevel, scale.min, scale.max, layout.plotY, layout.plotHeight);
      const nextX = layout.plotX + (index + 1) * slot + (slot - barWidth) / 2;
      setGuideStyle(ctx.ea, AXIS_COLOR, 1);
      ctx.ea.style.opacity = 55;
      tag(ctx, ctx.ea.addLine([[x + barWidth, connectorY], [nextX, connectorY]]), "budget-connector", index, 0);
    }

    const displayValue = role === "change" ? value : endValue;
    drawBudgetValueLabel(ctx, displayValue, role, x + barWidth / 2, endValue >= startValue ? y - 22 : y + height + 4, index);
    drawCategoryLabel(ctx, row.label, x + barWidth / 2, layout.plotY + layout.plotHeight + 9, slot, index);
    if (role === "change") running = endValue;
  });

  if (ctx.config.showAxes && zeroY >= layout.plotY && zeroY <= layout.plotY + layout.plotHeight) {
    setGuideStyle(ctx.ea, AXIS_COLOR, Math.max(1, ctx.config.strokeWidth));
  }
}

function allCartesianValues(config: ChartConfig): number[] {
  if (!supportsMultipleSeries(config.type)) return config.data.map((row) => getDatumValue(row));
  return config.data.flatMap((row) => config.series.map((_series, seriesIndex) => getDatumValue(row, seriesIndex)));
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
  const span = max - min || 1;
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

function drawCartesianValueLabel(
  ctx: RenderContext,
  value: number,
  x: number,
  y: number,
  dataIndex: number,
  seriesIndex: number,
): void {
  if (!ctx.config.showValues) return;
  setTextStyle(ctx.ea, 12);
  const text = formatNumber(value);
  const width = Math.max(42, Math.min(100, text.length * 7));
  const id = ctx.ea.addText(x - width / 2, y, text, { width, textAlign: "center" });
  tag(ctx, id, "value-label", dataIndex, seriesIndex);
}

function drawStackedValueLabel(
  ctx: RenderContext,
  rawValue: number,
  renderedValue: number,
  percent: boolean,
  x: number,
  y: number,
  dataIndex: number,
  seriesIndex: number,
): void {
  if (!ctx.config.showValues) return;
  setTextStyle(ctx.ea, 12);
  const text = percent ? `${formatNumber(renderedValue)}%` : formatNumber(rawValue);
  const width = Math.max(42, Math.min(90, text.length * 7));
  const id = ctx.ea.addText(x - width / 2, y, text, { width, textAlign: "center" });
  tag(ctx, id, percent ? "percent-value-label" : "value-label", dataIndex, seriesIndex);
}

function drawBudgetValueLabel(
  ctx: RenderContext,
  value: number,
  role: "opening" | "change" | "closing",
  x: number,
  y: number,
  dataIndex: number,
): void {
  if (!ctx.config.showValues) return;
  setTextStyle(ctx.ea, 12);
  const text = role === "change" && value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
  const width = Math.max(48, Math.min(100, text.length * 7));
  const id = ctx.ea.addText(x - width / 2, y, text, { width, textAlign: "center" });
  tag(ctx, id, "value-label", dataIndex, 0);
}

function drawLegend(ctx: RenderContext, layout: Layout): void {
  if (layout.legendWidth <= 0) return;
  const maxRows = Math.max(1, Math.floor((layout.height - 58) / 25));
  const entries = legendEntries(ctx.config).slice(0, maxRows);
  entries.forEach((entry, index) => {
    const y = layout.y + 50 + index * 25;
    setShapeStyle(ctx.ea, entry.color, { ...ctx.config, strokeWidth: 1, roughness: 0 });
    const swatchId = ctx.ea.addRect(layout.legendX + 4, y + 2, LEGEND_SWATCH, LEGEND_SWATCH);
    tag(ctx, swatchId, "legend-swatch", entry.dataIndex, entry.seriesIndex);
    setTextStyle(ctx.ea, 12);
    const textId = ctx.ea.addText(layout.legendX + 24, y, truncate(entry.label, 18), { width: Math.max(70, layout.legendWidth - 28) });
    tag(ctx, textId, "legend-label", entry.dataIndex, entry.seriesIndex);
  });
}

function legendEntries(config: ChartConfig): Array<{ label: string; color: string; dataIndex?: number; seriesIndex?: number }> {
  if (isCircularType(config.type)) {
    return config.data.map((row, dataIndex) => ({ label: row.label, color: row.color, dataIndex, seriesIndex: 0 }));
  }
  if (config.type === "budget-walk") {
    return [
      { label: "Opening / closing", color: BUDGET_TOTAL_COLOR, seriesIndex: 0 },
      { label: "Increase", color: BUDGET_POSITIVE_COLOR, seriesIndex: 0 },
      { label: "Decrease", color: BUDGET_NEGATIVE_COLOR, seriesIndex: 0 },
    ];
  }
  return config.series.map((series, seriesIndex) => ({ label: series.name, color: series.color, seriesIndex }));
}

function composeCircularLabel(config: ChartConfig, label: string, value: number, total: number): string {
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

function tag(ctx: RenderContext, id: string, role: string, dataIndex?: number, seriesIndex?: number): void {
  const metadata: ChartElementData = {
    namespace: "ea-chart-studio",
    version: 1,
    chartId: ctx.chartId,
    role,
    config: cloneConfig(ctx.config),
    ...(dataIndex === undefined ? {} : { dataIndex }),
    ...(seriesIndex === undefined ? {} : { seriesIndex }),
  };
  ctx.ea.addAppendUpdateCustomData(id, { chartStudio: metadata });
  ctx.ids.push(id);
}
