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

export function renderPreview(container: HTMLElement, config: ChartConfig): void {
  container.replaceChildren();
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute("aria-label", "Chart preview");
  svg.classList.add("chart-studio-preview-svg");
  container.appendChild(svg);

  const layout = createLayout(config);
  drawTitle(svg, config);
  if (config.type === "pie" || config.type === "donut") drawCircularPreview(svg, config, layout);
  else if (config.type === "bar") drawBarPreview(svg, config, layout, false);
  else if (config.type === "bar-horizontal") drawBarPreview(svg, config, layout, true);
  else drawLinePreview(svg, config, layout, config.type === "area");
  if (config.showLegend) drawLegend(svg, config, layout.legendX, layout.plotY);
}

function createLayout(config: ChartConfig): PreviewLayout {
  const titleHeight = config.title.trim() ? 25 : 8;
  const legendWidth = config.showLegend ? 86 : 0;
  const cartesian = config.type !== "pie" && config.type !== "donut";
  const left = cartesian ? 34 : 10;
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
  const total = config.data.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  const radius = Math.max(24, Math.min(layout.plotWidth, layout.plotHeight) * 0.42);
  const cx = layout.plotX + layout.plotWidth / 2;
  const cy = layout.plotY + layout.plotHeight / 2;
  const inner = config.type === "donut" ? radius * config.donutHole / 100 : 0;
  let start = -90;

  config.data.forEach((row) => {
    const sweep = total > 0 ? (Math.max(0, row.value) / total) * 360 : 0;
    if (sweep <= 0) return;
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", wedgePath(cx, cy, radius, inner, start, sweep));
    path.setAttribute("fill", row.color);
    path.setAttribute("stroke", "var(--background-primary)");
    path.setAttribute("stroke-width", "1.5");
    svg.appendChild(path);

    const label = composeLabel(config, row, total);
    if (label) {
      const angle = (start + sweep / 2) * Math.PI / 180;
      const labelRadius = inner > 0 ? (radius + inner) / 2 : radius * 0.64;
      appendText(
        svg,
        cx + Math.cos(angle) * labelRadius,
        cy + Math.sin(angle) * labelRadius + 2,
        ellipsis(label, 15),
        7.5,
        TEXT,
        "middle",
        "600",
      );
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
  const values = config.data.map((row) => row.value);
  const min = Math.min(0, ...values);
  const max = Math.max(1, 0, ...values);
  const span = max - min || 1;
  drawCartesianGuides(svg, config, layout, horizontal, min, max);

  config.data.forEach((row, index) => {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("fill", row.color);
    if (horizontal) {
      const slot = layout.plotHeight / Math.max(1, config.data.length);
      const zero = layout.plotX + ((0 - min) / span) * layout.plotWidth;
      const point = layout.plotX + ((row.value - min) / span) * layout.plotWidth;
      const x = Math.min(zero, point);
      const y = layout.plotY + index * slot + slot * 0.2;
      const width = Math.max(1, Math.abs(point - zero));
      const height = slot * 0.6;
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", String(height));
      svg.appendChild(rect);
      if (config.showLabels) appendText(svg, layout.plotX - 4, y + height / 2 + 2.5, ellipsis(row.label, 8), 7.5, MUTED, "end");
      if (config.showValues) appendText(svg, row.value >= 0 ? x + width + 3 : x - 3, y + height / 2 + 2.5, formatValue(row.value), 7.5, TEXT, row.value >= 0 ? "start" : "end", "600");
    } else {
      const slot = layout.plotWidth / Math.max(1, config.data.length);
      const zero = layout.plotY + layout.plotHeight - ((0 - min) / span) * layout.plotHeight;
      const point = layout.plotY + layout.plotHeight - ((row.value - min) / span) * layout.plotHeight;
      const x = layout.plotX + index * slot + slot * 0.18;
      const y = Math.min(zero, point);
      const width = slot * 0.64;
      const height = Math.max(1, Math.abs(point - zero));
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", String(height));
      svg.appendChild(rect);
      if (config.showLabels) appendText(svg, x + width / 2, layout.plotY + layout.plotHeight + 12, ellipsis(row.label, 8), 7.5, MUTED, "middle");
      if (config.showValues) appendText(svg, x + width / 2, row.value >= 0 ? y - 3 : y + height + 9, formatValue(row.value), 7.5, TEXT, "middle", "600");
    }
  });
}

function drawLinePreview(svg: SVGSVGElement, config: ChartConfig, layout: PreviewLayout, area: boolean): void {
  const values = config.data.map((row) => row.value);
  const min = Math.min(0, ...values);
  const max = Math.max(1, 0, ...values);
  const span = max - min || 1;
  drawCartesianGuides(svg, config, layout, false, min, max);
  const points = config.data.map((row, index) => {
    const px = config.data.length <= 1
      ? layout.plotX + layout.plotWidth / 2
      : layout.plotX + index / (config.data.length - 1) * layout.plotWidth;
    const py = layout.plotY + layout.plotHeight - (row.value - min) / span * layout.plotHeight;
    return [px, py] as const;
  });
  if (points.length === 0) return;
  if (area) {
    const polygon = document.createElementNS(SVG_NS, "polygon");
    const baseline = layout.plotY + layout.plotHeight - (0 - min) / span * layout.plotHeight;
    const first = points[0] ?? [layout.plotX, baseline];
    const last = points.at(-1) ?? first;
    polygon.setAttribute("points", `${first[0]},${baseline} ${points.map(([px, py]) => `${px},${py}`).join(" ")} ${last[0]},${baseline}`);
    polygon.setAttribute("fill", config.data[0]?.color ?? "#4c6ef5");
    polygon.setAttribute("opacity", "0.28");
    svg.appendChild(polygon);
  }
  if (points.length > 1) {
    const polyline = document.createElementNS(SVG_NS, "polyline");
    polyline.setAttribute("points", points.map(([px, py]) => `${px},${py}`).join(" "));
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", config.data[0]?.color ?? "#4c6ef5");
    polyline.setAttribute("stroke-width", "2.5");
    svg.appendChild(polyline);
  }
  points.forEach(([px, py], index) => {
    const row = config.data[index];
    if (!row) return;
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(px));
    circle.setAttribute("cy", String(py));
    circle.setAttribute("r", "3.3");
    circle.setAttribute("fill", row.color);
    svg.appendChild(circle);
    if (config.showValues) appendText(svg, px, py - 6, formatValue(row.value), 7.5, TEXT, "middle", "600");
    if (config.showLabels) appendText(svg, px, layout.plotY + layout.plotHeight + 12, ellipsis(row.label, 8), 7.5, MUTED, "middle");
  });
}

function drawCartesianGuides(
  svg: SVGSVGElement,
  config: ChartConfig,
  layout: PreviewLayout,
  horizontal: boolean,
  min: number,
  max: number,
): void {
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
  const maxRows = Math.min(6, config.data.length);
  config.data.slice(0, maxRows).forEach((row, index) => {
    const rowY = y + 4 + index * 18;
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(rowY));
    rect.setAttribute("width", "9");
    rect.setAttribute("height", "9");
    rect.setAttribute("rx", "2");
    rect.setAttribute("fill", row.color);
    svg.appendChild(rect);
    appendText(svg, x + 14, rowY + 8, ellipsis(row.label, 10), 7.5, TEXT, "start");
  });
  if (config.data.length > maxRows) appendText(svg, x, y + 9 + maxRows * 18, `+${config.data.length - maxRows} more`, 7, MUTED, "start");
}

function composeLabel(config: ChartConfig, row: ChartDatum, total: number): string {
  const parts: string[] = [];
  if (config.showLabels) parts.push(row.label);
  if (config.showValues) parts.push(formatValue(row.value));
  if (config.showPercentages && total > 0) parts.push(`${Math.round(row.value / total * 100)}%`);
  return parts.join(" · ");
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

function appendText(
  svg: SVGSVGElement,
  x: number,
  y: number,
  content: string,
  size: number,
  fill: string,
  anchor: "start" | "middle" | "end",
  weight = "400",
): void {
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
