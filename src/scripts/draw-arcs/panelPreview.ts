/**
 * @file panelPreview.ts
 * @overview Lightweight reactive SVG preview for Chart Studio, including multi-series and budget-walk charts.
 */

import {
  BUDGET_NEGATIVE_COLOR,
  BUDGET_POSITIVE_COLOR,
  BUDGET_TOTAL_COLOR,
  getDatumValue,
  isCircularType,
  supportsMultipleSeries,
} from "./chartModel";
import type { ChartConfig, ChartDatum } from "./chartTypes";

const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 320;
const HEIGHT = 180;
const TEXT = "var(--text-normal)";
const MUTED = "var(--text-muted)";
const BORDER = "var(--background-modifier-border)";

interface PreviewLayout {
  plotX: number;
  plotY: number;
  plotWidth: number;
  plotHeight: number;
  legendX: number;
  legendWidth: number;
}

/** Re-renders the current chart configuration as a compact SVG preview. */
export function renderPreview(container: HTMLElement, config: ChartConfig): void {
  container.replaceChildren();
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute("aria-label", "Chart preview");
  svg.classList.add("chart-studio-preview-svg");
  container.appendChild(svg);

  const layout = createLayout(config);
  drawTitle(svg, config);
  if (isCircularType(config.type)) drawCircularPreview(svg, config, layout);
  else if (config.type === "bar") drawBarPreview(svg, config, layout, false);
  else if (config.type === "bar-horizontal") drawBarPreview(svg, config, layout, true);
  else if (config.type === "budget-walk") drawBudgetWalkPreview(svg, config, layout);
  else drawLinePreview(svg, config, layout, config.type === "area");
  if (config.showLegend) drawLegend(svg, config, layout.legendX, layout.plotY);
}

function createLayout(config: ChartConfig): PreviewLayout {
  const titleHeight = config.title.trim() ? 25 : 8;
  const legendWidth = config.showLegend ? 88 : 0;
  const cartesian = !isCircularType(config.type);
  const left = cartesian ? (config.type === "bar-horizontal" ? 48 : 34) : 10;
  const bottom = cartesian ? 30 : 9;
  const right = legendWidth + (config.showLegend ? 7 : 6);
  return {
    plotX: left,
    plotY: titleHeight,
    plotWidth: Math.max(80, WIDTH - left - right),
    plotHeight: Math.max(70, HEIGHT - titleHeight - bottom),
    legendX: WIDTH - legendWidth + 2,
    legendWidth,
  };
}

function drawTitle(svg: SVGSVGElement, config: ChartConfig): void {
  const title = config.title.trim();
  if (!title) return;
  appendText(svg, 10, 16, ellipsis(title, 36), 12, TEXT, "start", "700");
}

function drawCircularPreview(svg: SVGSVGElement, config: ChartConfig, layout: PreviewLayout): void {
  const total = config.data.reduce((sum, row) => sum + Math.max(0, getDatumValue(row)), 0);
  const radius = Math.max(24, Math.min(layout.plotWidth, layout.plotHeight) * 0.42);
  const cx = layout.plotX + layout.plotWidth / 2;
  const cy = layout.plotY + layout.plotHeight / 2;
  const inner = config.type === "donut" ? radius * config.donutHole / 100 : 0;
  let start = -90;

  config.data.forEach((row) => {
    const value = getDatumValue(row);
    const sweep = total > 0 ? (Math.max(0, value) / total) * 360 : 0;
    if (sweep <= 0) return;
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", wedgePath(cx, cy, radius, inner, start, sweep));
    path.setAttribute("fill", row.color);
    path.setAttribute("stroke", "var(--background-primary)");
    path.setAttribute("stroke-width", "1.5");
    svg.appendChild(path);

    const label = composeCircularLabel(config, row, total);
    if (label) {
      const angle = (start + sweep / 2) * Math.PI / 180;
      const labelRadius = inner > 0 ? (radius + inner) / 2 : radius * 0.64;
      appendText(svg, cx + Math.cos(angle) * labelRadius, cy + Math.sin(angle) * labelRadius + 2, ellipsis(label, 15), 7.5, TEXT, "middle", "600");
    }
    start += sweep;
  });
}

function wedgePath(cx: number, cy: number, r: number, inner: number, start: number, sweep: number): string {
  const safeSweep = Math.min(359.999, sweep);
  const s = polar(cx, cy, r, start);
  const e = polar(cx, cy, r, start + safeSweep);
  const large = safeSweep > 180 ? 1 : 0;
  if (inner <= 0) return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
  const innerEnd = polar(cx, cy, inner, start + safeSweep);
  const innerStart = polar(cx, cy, inner, start);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} L ${innerEnd.x} ${innerEnd.y} A ${inner} ${inner} 0 ${large} 0 ${innerStart.x} ${innerStart.y} Z`;
}

function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  const radians = angle * Math.PI / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function drawBarPreview(svg: SVGSVGElement, config: ChartConfig, layout: PreviewLayout, horizontal: boolean): void {
  const values = allCartesianValues(config);
  const min = Math.min(0, ...values);
  const max = Math.max(1, 0, ...values);
  const span = max - min || 1;
  drawCartesianGuides(svg, config, layout, horizontal, min, max);
  const seriesCount = Math.max(1, config.series.length);

  config.data.forEach((row, dataIndex) => {
    if (horizontal) {
      const slot = layout.plotHeight / Math.max(1, config.data.length);
      const groupHeight = slot * 0.74;
      const gap = 1.5;
      const barHeight = Math.max(2, (groupHeight - gap * Math.max(0, seriesCount - 1)) / seriesCount);
      const zero = layout.plotX + ((0 - min) / span) * layout.plotWidth;
      config.series.forEach((series, seriesIndex) => {
        const value = getDatumValue(row, seriesIndex);
        const point = layout.plotX + ((value - min) / span) * layout.plotWidth;
        const x = Math.min(zero, point);
        const y = layout.plotY + dataIndex * slot + (slot - groupHeight) / 2 + seriesIndex * (barHeight + gap);
        appendRect(svg, x, y, Math.max(1, Math.abs(point - zero)), barHeight, series.color);
        if (config.showValues) appendText(svg, value >= 0 ? Math.max(x, point) + 3 : Math.min(x, point) - 3, y + barHeight / 2 + 2.5, formatValue(value), 6.8, TEXT, value >= 0 ? "start" : "end", "600");
      });
      if (config.showLabels) appendText(svg, layout.plotX - 4, layout.plotY + dataIndex * slot + slot / 2 + 2.5, ellipsis(row.label, 8), 7.5, MUTED, "end");
    } else {
      const slot = layout.plotWidth / Math.max(1, config.data.length);
      const groupWidth = slot * 0.76;
      const gap = 1.5;
      const barWidth = Math.max(2, (groupWidth - gap * Math.max(0, seriesCount - 1)) / seriesCount);
      const zero = layout.plotY + layout.plotHeight - ((0 - min) / span) * layout.plotHeight;
      config.series.forEach((series, seriesIndex) => {
        const value = getDatumValue(row, seriesIndex);
        const point = layout.plotY + layout.plotHeight - ((value - min) / span) * layout.plotHeight;
        const x = layout.plotX + dataIndex * slot + (slot - groupWidth) / 2 + seriesIndex * (barWidth + gap);
        const y = Math.min(zero, point);
        appendRect(svg, x, y, barWidth, Math.max(1, Math.abs(point - zero)), series.color);
        if (config.showValues) appendText(svg, x + barWidth / 2, value >= 0 ? y - 3 : y + Math.abs(point - zero) + 8, formatValue(value), 6.5, TEXT, "middle", "600");
      });
      if (config.showLabels) appendText(svg, layout.plotX + dataIndex * slot + slot / 2, layout.plotY + layout.plotHeight + 12, ellipsis(row.label, 8), 7.5, MUTED, "middle");
    }
  });
}

function drawLinePreview(svg: SVGSVGElement, config: ChartConfig, layout: PreviewLayout, area: boolean): void {
  const values = allCartesianValues(config);
  const min = Math.min(0, ...values);
  const max = Math.max(1, 0, ...values);
  const span = max - min || 1;
  drawCartesianGuides(svg, config, layout, false, min, max);
  const baseline = layout.plotY + layout.plotHeight - (0 - min) / span * layout.plotHeight;

  config.series.forEach((series, seriesIndex) => {
    const points = config.data.map((row, index) => {
      const px = config.data.length <= 1 ? layout.plotX + layout.plotWidth / 2 : layout.plotX + index / (config.data.length - 1) * layout.plotWidth;
      const py = layout.plotY + layout.plotHeight - (getDatumValue(row, seriesIndex) - min) / span * layout.plotHeight;
      return [px, py] as const;
    });
    if (points.length === 0) return;
    if (area) {
      const polygon = document.createElementNS(SVG_NS, "polygon");
      const first = points[0] ?? [layout.plotX, baseline];
      const last = points.at(-1) ?? first;
      polygon.setAttribute("points", `${first[0]},${baseline} ${points.map(([px, py]) => `${px},${py}`).join(" ")} ${last[0]},${baseline}`);
      polygon.setAttribute("fill", series.color);
      polygon.setAttribute("opacity", String(Math.max(0.14, 0.3 - seriesIndex * 0.04)));
      svg.appendChild(polygon);
    }
    if (points.length > 1) {
      const polyline = document.createElementNS(SVG_NS, "polyline");
      polyline.setAttribute("points", points.map(([px, py]) => `${px},${py}`).join(" "));
      polyline.setAttribute("fill", "none");
      polyline.setAttribute("stroke", series.color);
      polyline.setAttribute("stroke-width", "2.2");
      svg.appendChild(polyline);
    }
    points.forEach(([px, py], dataIndex) => {
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", String(px));
      circle.setAttribute("cy", String(py));
      circle.setAttribute("r", "3");
      circle.setAttribute("fill", series.color);
      svg.appendChild(circle);
      if (config.showValues) appendText(svg, px, py - 5 - seriesIndex * 7, formatValue(getDatumValue(config.data[dataIndex]!, seriesIndex)), 6.5, TEXT, "middle", "600");
    });
  });
  if (config.showLabels) config.data.forEach((row, index) => {
    const px = config.data.length <= 1 ? layout.plotX + layout.plotWidth / 2 : layout.plotX + index / (config.data.length - 1) * layout.plotWidth;
    appendText(svg, px, layout.plotY + layout.plotHeight + 12, ellipsis(row.label, 8), 7.5, MUTED, "middle");
  });
}

function drawBudgetWalkPreview(svg: SVGSVGElement, config: ChartConfig, layout: PreviewLayout): void {
  const rows = config.data;
  if (rows.length < 2) return;
  const opening = getDatumValue(rows[0]!);
  let running = opening;
  const levels: number[] = [0, opening];
  rows.slice(1, -1).forEach((row) => {
    levels.push(running);
    running += getDatumValue(row);
    levels.push(running);
  });
  levels.push(0, running);
  const min = Math.min(0, ...levels);
  const max = Math.max(1, 0, ...levels);
  const span = max - min || 1;
  drawCartesianGuides(svg, config, layout, false, min, max);
  const slot = layout.plotWidth / rows.length;
  const barWidth = slot * 0.58;
  running = opening;

  rows.forEach((row, index) => {
    const role = index === 0 ? "opening" : index === rows.length - 1 ? "closing" : "change";
    const value = getDatumValue(row);
    let start = 0;
    let end = value;
    let color = BUDGET_TOTAL_COLOR;
    if (role === "change") {
      start = running;
      end = running + value;
      color = value >= 0 ? BUDGET_POSITIVE_COLOR : BUDGET_NEGATIVE_COLOR;
    } else if (role === "closing") {
      start = 0;
      end = running;
    } else {
      end = opening;
    }
    const startY = layout.plotY + layout.plotHeight - (start - min) / span * layout.plotHeight;
    const endY = layout.plotY + layout.plotHeight - (end - min) / span * layout.plotHeight;
    const x = layout.plotX + index * slot + (slot - barWidth) / 2;
    const y = Math.min(startY, endY);
    const h = Math.max(1, Math.abs(startY - endY));
    appendRect(svg, x, y, barWidth, h, color);
    if (index < rows.length - 1) {
      const connectorY = endY;
      const nextX = layout.plotX + (index + 1) * slot + (slot - barWidth) / 2;
      appendLine(svg, x + barWidth, connectorY, nextX, connectorY, MUTED, 0.8);
    }
    const shownValue = role === "change" ? value : end;
    if (config.showValues) appendText(svg, x + barWidth / 2, y - 3, role === "change" && shownValue > 0 ? `+${formatValue(shownValue)}` : formatValue(shownValue), 6.7, TEXT, "middle", "600");
    if (config.showLabels) appendText(svg, x + barWidth / 2, layout.plotY + layout.plotHeight + 12, ellipsis(row.label, 8), 7.2, MUTED, "middle");
    if (role === "change") running = end;
  });
}

function drawCartesianGuides(svg: SVGSVGElement, config: ChartConfig, layout: PreviewLayout, horizontal: boolean, min: number, max: number): void {
  if (config.showGrid) {
    for (let index = 0; index <= 4; index += 1) {
      if (horizontal) {
        const x = layout.plotX + layout.plotWidth * index / 4;
        appendLine(svg, x, layout.plotY, x, layout.plotY + layout.plotHeight, BORDER, 0.8);
      } else {
        const y = layout.plotY + layout.plotHeight * index / 4;
        appendLine(svg, layout.plotX, y, layout.plotX + layout.plotWidth, y, BORDER, 0.8);
      }
    }
  }
  if (!config.showAxes) return;
  appendLine(svg, layout.plotX, layout.plotY, layout.plotX, layout.plotY + layout.plotHeight, MUTED, 1.2);
  appendLine(svg, layout.plotX, layout.plotY + layout.plotHeight, layout.plotX + layout.plotWidth, layout.plotY + layout.plotHeight, MUTED, 1.2);
  if (!horizontal) {
    appendText(svg, layout.plotX - 4, layout.plotY + 3, formatValue(max), 6.5, MUTED, "end");
    appendText(svg, layout.plotX - 4, layout.plotY + layout.plotHeight, formatValue(min), 6.5, MUTED, "end");
  }
}

function drawLegend(svg: SVGSVGElement, config: ChartConfig, x: number, y: number): void {
  const entries = legendEntries(config).slice(0, 7);
  entries.forEach((entry, index) => {
    const rowY = y + 4 + index * 18;
    appendRect(svg, x, rowY, 9, 9, entry.color, 2);
    appendText(svg, x + 14, rowY + 8, ellipsis(entry.label, 11), 7.5, TEXT, "start");
  });
}

function legendEntries(config: ChartConfig): Array<{ label: string; color: string }> {
  if (isCircularType(config.type)) return config.data.map((row) => ({ label: row.label, color: row.color }));
  if (config.type === "budget-walk") return [
    { label: "Total", color: BUDGET_TOTAL_COLOR },
    { label: "Increase", color: BUDGET_POSITIVE_COLOR },
    { label: "Decrease", color: BUDGET_NEGATIVE_COLOR },
  ];
  return config.series.map((series) => ({ label: series.name, color: series.color }));
}

function allCartesianValues(config: ChartConfig): number[] {
  if (!supportsMultipleSeries(config.type)) return config.data.map((row) => getDatumValue(row));
  return config.data.flatMap((row) => config.series.map((_series, seriesIndex) => getDatumValue(row, seriesIndex)));
}

function composeCircularLabel(config: ChartConfig, row: ChartDatum, total: number): string {
  const value = getDatumValue(row);
  const parts: string[] = [];
  if (config.showLabels) parts.push(row.label);
  if (config.showValues) parts.push(formatValue(value));
  if (config.showPercentages && total > 0) parts.push(`${Math.round(value / total * 100)}%`);
  return parts.join(" · ");
}

function appendRect(svg: SVGSVGElement, x: number, y: number, width: number, height: number, fill: string, radius = 0): void {
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", String(x));
  rect.setAttribute("y", String(y));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  if (radius > 0) rect.setAttribute("rx", String(radius));
  rect.setAttribute("fill", fill);
  svg.appendChild(rect);
}

function appendLine(svg: SVGSVGElement, x1: number, y1: number, x2: number, y2: number, stroke: string, width: number): void {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("stroke", stroke);
  line.setAttribute("stroke-width", String(width));
  svg.appendChild(line);
}

function appendText(svg: SVGSVGElement, x: number, y: number, content: string, size: number, fill: string, anchor: "start" | "middle" | "end", weight = "400"): void {
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("font-size", String(size));
  text.setAttribute("font-family", "var(--font-interface)");
  text.setAttribute("font-weight", weight);
  text.setAttribute("text-anchor", anchor);
  text.setAttribute("fill", fill);
  text.textContent = content;
  svg.appendChild(text);
}

function ellipsis(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 1))}…` : value;
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}
