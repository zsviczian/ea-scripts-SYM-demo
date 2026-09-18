import type { ChartConfig } from "./chartTypes";

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderPreview(container: HTMLElement, config: ChartConfig): void {
  container.replaceChildren();
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 320 180");
  svg.setAttribute("aria-label", "Chart preview");
  svg.classList.add("chart-studio-preview-svg");
  container.appendChild(svg);

  if (config.type === "pie" || config.type === "donut") drawCircularPreview(svg, config);
  else if (config.type === "bar") drawBarPreview(svg, config, false);
  else if (config.type === "bar-horizontal") drawBarPreview(svg, config, true);
  else drawLinePreview(svg, config, config.type === "area");
}

function drawCircularPreview(svg: SVGSVGElement, config: ChartConfig): void {
  const total = config.data.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  const cx = 125;
  const cy = 90;
  const radius = 66;
  let start = -90;
  config.data.forEach((row) => {
    const sweep = total > 0 ? (Math.max(0, row.value) / total) * 360 : 0;
    if (sweep <= 0) return;
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", wedgePath(cx, cy, radius, config.type === "donut" ? radius * config.donutHole / 100 : 0, start, sweep));
    path.setAttribute("fill", row.color);
    path.setAttribute("stroke", "var(--background-primary)");
    path.setAttribute("stroke-width", "2");
    svg.appendChild(path);
    start += sweep;
  });
  drawMiniLegend(svg, config, 210, 36);
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

function drawBarPreview(svg: SVGSVGElement, config: ChartConfig, horizontal: boolean): void {
  const values = config.data.map((row) => row.value);
  const min = Math.min(0, ...values);
  const max = Math.max(1, 0, ...values);
  const span = max - min || 1;
  const x = 26;
  const y = 20;
  const w = 264;
  const h = 140;
  drawAxes(svg, x, y, w, h);

  config.data.forEach((row, index) => {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("fill", row.color);
    if (horizontal) {
      const slot = h / Math.max(1, config.data.length);
      const zero = x + ((0 - min) / span) * w;
      const point = x + ((row.value - min) / span) * w;
      rect.setAttribute("x", String(Math.min(zero, point)));
      rect.setAttribute("y", String(y + index * slot + slot * 0.2));
      rect.setAttribute("width", String(Math.max(1, Math.abs(point - zero))));
      rect.setAttribute("height", String(slot * 0.6));
    } else {
      const slot = w / Math.max(1, config.data.length);
      const zero = y + h - ((0 - min) / span) * h;
      const point = y + h - ((row.value - min) / span) * h;
      rect.setAttribute("x", String(x + index * slot + slot * 0.18));
      rect.setAttribute("y", String(Math.min(zero, point)));
      rect.setAttribute("width", String(slot * 0.64));
      rect.setAttribute("height", String(Math.max(1, Math.abs(point - zero))));
    }
    svg.appendChild(rect);
  });
}

function drawLinePreview(svg: SVGSVGElement, config: ChartConfig, area: boolean): void {
  const x = 26;
  const y = 20;
  const w = 264;
  const h = 140;
  drawAxes(svg, x, y, w, h);
  const values = config.data.map((row) => row.value);
  const min = Math.min(0, ...values);
  const max = Math.max(1, 0, ...values);
  const span = max - min || 1;
  const points = config.data.map((row, index) => {
    const px = config.data.length <= 1 ? x + w / 2 : x + index / (config.data.length - 1) * w;
    const py = y + h - (row.value - min) / span * h;
    return [px, py] as const;
  });
  if (points.length === 0) return;
  if (area) {
    const polygon = document.createElementNS(SVG_NS, "polygon");
    const baseline = y + h - (0 - min) / span * h;
    const first = points[0] ?? [x, baseline];
    const last = points.at(-1) ?? first;
    polygon.setAttribute("points", `${first[0]},${baseline} ${points.map(([px, py]) => `${px},${py}`).join(" ")} ${last[0]},${baseline}`);
    polygon.setAttribute("fill", config.data[0]?.color ?? "#4c6ef5");
    polygon.setAttribute("opacity", "0.28");
    svg.appendChild(polygon);
  }
  const polyline = document.createElementNS(SVG_NS, "polyline");
  polyline.setAttribute("points", points.map(([px, py]) => `${px},${py}`).join(" "));
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", config.data[0]?.color ?? "#4c6ef5");
  polyline.setAttribute("stroke-width", "3");
  svg.appendChild(polyline);
  points.forEach(([px, py], index) => {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(px));
    circle.setAttribute("cy", String(py));
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", config.data[index]?.color ?? "#4c6ef5");
    svg.appendChild(circle);
  });
}

function drawAxes(svg: SVGSVGElement, x: number, y: number, width: number, height: number): void {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", `M ${x} ${y} V ${y + height} H ${x + width}`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "var(--text-muted)");
  path.setAttribute("stroke-width", "1.5");
  svg.appendChild(path);
}

function drawMiniLegend(svg: SVGSVGElement, config: ChartConfig, x: number, y: number): void {
  config.data.slice(0, 5).forEach((row, index) => {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y + index * 22));
    rect.setAttribute("width", "11");
    rect.setAttribute("height", "11");
    rect.setAttribute("rx", "2");
    rect.setAttribute("fill", row.color);
    svg.appendChild(rect);
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", String(x + 17));
    text.setAttribute("y", String(y + 10 + index * 22));
    text.setAttribute("font-size", "10");
    text.setAttribute("fill", "var(--text-normal)");
    text.textContent = row.label.length > 11 ? `${row.label.slice(0, 10)}…` : row.label;
    svg.appendChild(text);
  });
}
