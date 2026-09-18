import { showNotice } from "../../sharedUtils/notice";
import { drawChart } from "./chartRenderer";
import {
  PALETTES,
  applyPalette,
  chartTypeLabel,
  cloneConfig,
  defaultChartConfig,
  getChartSelection,
  isElementInChart,
  parseBulkData,
  readChartConfig,
  validateChart,
} from "./chartModel";
import { renderPreview } from "./panelPreview";
import type { ChartConfig, ChartDatum, ChartType } from "./chartTypes";

const CHART_TYPES: ChartType[] = ["pie", "donut", "bar", "bar-horizontal", "line", "area"];

interface PanelState {
  config: ChartConfig;
  activeChartId: string | null;
  viewAvailable: boolean;
}

interface PanelRefs {
  preview: HTMLElement | undefined;
  status: HTMLElement | undefined;
  updateButton: HTMLButtonElement | undefined;
  bulkTextarea: HTMLTextAreaElement | undefined;
}

export interface ChartPanelController {
  render(): void;
  refreshPreview(): void;
  setViewAvailable(available: boolean): void;
  refreshSelection(): void;
  destroy(): void;
}

export function createChartPanel(
  ea: ExcalidrawAutomate,
  tab: ExcalidrawSidepanelTab,
  initialConfig: ChartConfig,
): ChartPanelController {
  const state: PanelState = { config: cloneConfig(initialConfig), activeChartId: null, viewAvailable: Boolean(ea.getExcalidrawAPI()) };
  const refs: PanelRefs = { preview: undefined, status: undefined, updateButton: undefined, bulkTextarea: undefined };

  const controller: ChartPanelController = {
    render: () => renderPanel(ea, tab, state, refs, controller),
    refreshPreview: () => refreshPreview(tab, state),
    setViewAvailable: (available) => {
      state.viewAvailable = available;
      updateStatus(ea, state, refs);
    },
    refreshSelection: () => updateStatus(ea, state, refs),
    destroy: () => tab.contentEl.replaceChildren(),
  };
  return controller;
}

function renderPanel(
  ea: ExcalidrawAutomate,
  tab: ExcalidrawSidepanelTab,
  state: PanelState,
  refs: PanelRefs,
  controller: ChartPanelController,
): void {
  tab.contentEl.replaceChildren();
  refs.preview = undefined;
  refs.status = undefined;
  refs.updateButton = undefined;
  refs.bulkTextarea = undefined;
  injectStyles(tab.contentEl);
  const root = make("div", "chart-studio");
  tab.contentEl.appendChild(root);
  renderHeader(root, state, refs);
  renderTypePicker(root, state, controller);
  renderPreviewCard(root, state, refs);
  renderDataEditor(root, state, refs, controller);
  renderDisplayControls(root, state, controller);
  renderStyleControls(root, state, controller);
  renderActions(root, ea, tab, state, refs, controller);
  controller.refreshPreview();
  updateStatus(ea, state, refs);
}

function renderHeader(root: HTMLElement, state: PanelState, refs: PanelRefs): void {
  const header = make("div", "chart-studio-header");
  const titleWrap = make("div");
  const title = make("div", "chart-studio-title");
  title.textContent = "Chart Studio";
  const subtitle = make("div", "chart-studio-subtitle");
  subtitle.textContent = "Native, editable Excalidraw charts";
  titleWrap.append(title, subtitle);
  const badge = make("span", "chart-studio-badge");
  badge.textContent = state.activeChartId ? "EDIT" : "NEW";
  header.append(titleWrap, badge);
  root.appendChild(header);
  const status = make("div", "chart-studio-status");
  refs.status = status;
  root.appendChild(status);
}

function renderTypePicker(root: HTMLElement, state: PanelState, controller: ChartPanelController): void {
  const section = sectionEl("Chart type", "Choose the geometry you want to draw.");
  const grid = make("div", "chart-studio-type-grid");
  for (const type of CHART_TYPES) {
    const button = makeButton(chartTypeIcon(type), "chart-studio-type");
    button.title = chartTypeLabel(type);
    if (state.config.type === type) button.classList.add("is-active");
    const label = make("span");
    label.textContent = chartTypeLabel(type);
    button.appendChild(label);
    button.addEventListener("click", () => {
      state.config.type = type;
      controller.render();
    });
    grid.appendChild(button);
  }
  section.appendChild(grid);
  root.appendChild(section);
}

function renderPreviewCard(root: HTMLElement, state: PanelState, refs: PanelRefs): void {
  const card = make("div", "chart-studio-preview-card");
  const top = make("div", "chart-studio-preview-top");
  const label = make("span");
  label.textContent = "Preview";
  const dimensions = make("span", "chart-studio-muted");
  dimensions.classList.add("chart-studio-preview-dimensions");
  dimensions.textContent = `${Math.round(state.config.width)} × ${Math.round(state.config.height)}`;
  top.append(label, dimensions);
  const preview = make("div", "chart-studio-preview");
  refs.preview = preview;
  card.append(top, preview);
  root.appendChild(card);
}

function renderDataEditor(
  root: HTMLElement,
  state: PanelState,
  refs: PanelRefs,
  controller: ChartPanelController,
): void {
  const section = sectionEl("Data", "Edit rows directly or paste Label, Value data.");
  const rows = make("div", "chart-studio-data-rows");
  state.config.data.forEach((row, index) => rows.appendChild(renderDataRow(state, row, index, controller)));
  section.appendChild(rows);
  section.appendChild(renderDataToolbar(state, controller));
  section.appendChild(renderBulkEditor(state, refs, controller));
  root.appendChild(section);
}

function renderDataRow(
  state: PanelState,
  row: ChartDatum,
  index: number,
  controller: ChartPanelController,
): HTMLElement {
  const wrapper = make("div", "chart-studio-data-row");
  const color = document.createElement("input");
  color.type = "color";
  color.value = row.color;
  color.className = "chart-studio-color";
  color.title = "Series color";
  color.addEventListener("input", () => {
    const current = state.config.data[index];
    if (current) current.color = color.value;
    controller.refreshPreview();
  });

  const label = document.createElement("input");
  label.type = "text";
  label.value = row.label;
  label.placeholder = "Label";
  label.className = "chart-studio-input";
  label.addEventListener("input", () => {
    const current = state.config.data[index];
    if (current) current.label = label.value;
    controller.refreshPreview();
  });

  const value = document.createElement("input");
  value.type = "number";
  value.step = "any";
  value.value = String(row.value);
  value.className = "chart-studio-input chart-studio-value";
  value.addEventListener("input", () => {
    const current = state.config.data[index];
    const numeric = Number(value.value);
    if (current && Number.isFinite(numeric)) current.value = numeric;
    controller.refreshPreview();
  });

  const controls = make("div", "chart-studio-row-controls");
  controls.append(
    iconButton("↑", "Move up", () => moveRow(state, index, -1, controller)),
    iconButton("↓", "Move down", () => moveRow(state, index, 1, controller)),
    iconButton("×", "Delete row", () => deleteRow(state, index, controller)),
  );
  wrapper.append(color, label, value, controls);
  return wrapper;
}

function renderDataToolbar(state: PanelState, controller: ChartPanelController): HTMLElement {
  const toolbar = make("div", "chart-studio-toolbar");
  const add = makeButton("+ Add row");
  add.addEventListener("click", () => {
    const palette = PALETTES[state.config.palette] ?? PALETTES.Classic ?? ["#4c6ef5"];
    const index = state.config.data.length;
    state.config.data.push({ label: `Item ${index + 1}`, value: 10, color: palette[index % palette.length] ?? "#4c6ef5" });
    controller.render();
  });
  const sort = makeButton("Sort ↓");
  sort.addEventListener("click", () => {
    state.config.data.sort((a, b) => b.value - a.value);
    controller.render();
  });
  const sample = makeButton("Sample");
  sample.addEventListener("click", () => {
    state.config = defaultChartConfig();
    controller.render();
  });
  toolbar.append(add, sort, sample);
  return toolbar;
}

function renderBulkEditor(state: PanelState, refs: PanelRefs, controller: ChartPanelController): HTMLElement {
  const details = document.createElement("details");
  details.className = "chart-studio-details";
  const summary = document.createElement("summary");
  summary.textContent = "Paste CSV / tabular data";
  const textarea = document.createElement("textarea");
  textarea.className = "chart-studio-textarea";
  textarea.placeholder = "Alpha, 40\nBeta, 30\nGamma, 20";
  refs.bulkTextarea = textarea;
  const apply = makeButton("Apply pasted data", "mod-cta");
  apply.addEventListener("click", () => {
    const rows = parseBulkData(textarea.value, state.config.palette);
    if (rows.length === 0) {
      showNotice("Chart Studio: no valid rows found. Use one Label, Value pair per line.");
      return;
    }
    state.config.data = rows;
    controller.render();
  });
  details.append(summary, textarea, apply);
  return details;
}

function renderDisplayControls(root: HTMLElement, state: PanelState, controller: ChartPanelController): void {
  const section = sectionEl("Display", "Titles, labels, legend and plot guides.");
  section.appendChild(textField("Title", state.config.title, (value) => {
    state.config.title = value;
    controller.refreshPreview();
  }));
  const toggles = make("div", "chart-studio-toggle-grid");
  toggles.append(
    toggleField("Legend", state.config.showLegend, (value) => { state.config.showLegend = value; controller.refreshPreview(); }),
    toggleField("Labels", state.config.showLabels, (value) => { state.config.showLabels = value; controller.refreshPreview(); }),
    toggleField("Values", state.config.showValues, (value) => { state.config.showValues = value; controller.refreshPreview(); }),
  );
  if (state.config.type === "pie" || state.config.type === "donut") {
    toggles.append(toggleField("Percentages", state.config.showPercentages, (value) => { state.config.showPercentages = value; controller.refreshPreview(); }));
  } else {
    toggles.append(
      toggleField("Axes", state.config.showAxes, (value) => { state.config.showAxes = value; controller.refreshPreview(); }),
      toggleField("Grid", state.config.showGrid, (value) => { state.config.showGrid = value; controller.refreshPreview(); }),
    );
  }
  section.appendChild(toggles);
  root.appendChild(section);
}

function renderStyleControls(
  root: HTMLElement,
  state: PanelState,
  controller: ChartPanelController,
): void {
  const section = sectionEl("Style", "Size, palette and Excalidraw appearance.");
  const row = make("div", "chart-studio-field-grid");
  row.append(
    numberField("Width", state.config.width, 280, 1400, (value) => { state.config.width = value; controller.refreshPreview(); }),
    numberField("Height", state.config.height, 220, 1000, (value) => { state.config.height = value; controller.refreshPreview(); }),
  );
  section.appendChild(row);
  section.appendChild(selectField("Palette", Object.keys(PALETTES), state.config.palette, (value) => {
    state.config = applyPalette(state.config, value);
    controller.render();
  }));
  const styleGrid = make("div", "chart-studio-field-grid");
  styleGrid.append(
    numberField("Stroke", state.config.strokeWidth, 1, 5, (value) => { state.config.strokeWidth = value; controller.refreshPreview(); }),
    numberField("Roughness", state.config.roughness, 0, 2, (value) => { state.config.roughness = value; controller.refreshPreview(); }, 0.5),
  );
  section.appendChild(styleGrid);
  if (state.config.type === "donut") {
    section.appendChild(rangeField("Donut hole", state.config.donutHole, 20, 75, "%", (value) => {
      state.config.donutHole = value;
      controller.refreshPreview();
    }));
  }
  root.appendChild(section);
}

function renderActions(
  root: HTMLElement,
  ea: ExcalidrawAutomate,
  tab: ExcalidrawSidepanelTab,
  state: PanelState,
  refs: PanelRefs,
  controller: ChartPanelController,
): void {
  const actions = make("div", "chart-studio-actions");
  const insert = makeButton("Draw chart", "mod-cta chart-studio-primary");
  insert.addEventListener("click", () => void insertChart(ea, tab, state, refs));
  const update = makeButton("Update loaded chart", "chart-studio-secondary");
  refs.updateButton = update;
  update.addEventListener("click", () => void updateLoadedChart(ea, tab, state, refs));
  const load = makeButton("Load selected chart", "chart-studio-secondary");
  load.addEventListener("click", () => loadSelectedChart(ea, state, controller));
  const reset = makeButton("Reset", "chart-studio-quiet");
  reset.addEventListener("click", () => {
    state.config = defaultChartConfig();
    state.activeChartId = null;
    controller.render();
  });
  actions.append(insert, update, load, reset);
  root.appendChild(actions);
}

async function insertChart(
  ea: ExcalidrawAutomate,
  tab: ExcalidrawSidepanelTab,
  state: PanelState,
  refs: PanelRefs,
): Promise<void> {
  const error = validateChart(state.config);
  if (error) {
    showNotice(`Chart Studio: ${error}`);
    return;
  }
  if (!state.viewAvailable || !ea.getExcalidrawAPI()) {
    showNotice("Chart Studio: focus an Excalidraw drawing first.");
    return;
  }
  const chartId = createChartId();
  const center = ea.getViewCenterPosition();
  const location = {
    x: center.x - state.config.width / 2,
    y: center.y - state.config.height / 2,
  };
  await ea.setScriptSettings({ chartConfig: cloneConfig(state.config) });
  await drawChart(ea, cloneConfig(state.config), chartId, location);
  state.activeChartId = chartId;
  updateStatus(ea, state, refs);
  showNotice("Chart Studio: chart added and grouped. Double-click/enter the group to edit individual elements.");
  keepPanelFocused(tab);
}

async function updateLoadedChart(
  ea: ExcalidrawAutomate,
  tab: ExcalidrawSidepanelTab,
  state: PanelState,
  refs: PanelRefs,
): Promise<void> {
  const error = validateChart(state.config);
  if (error) {
    showNotice(`Chart Studio: ${error}`);
    return;
  }
  if (!state.activeChartId) {
    showNotice("Chart Studio: load a chart from the selection first.");
    return;
  }
  const api = ea.getExcalidrawAPI();
  if (!api) {
    showNotice("Chart Studio: focus an Excalidraw drawing first.");
    return;
  }
  const scene = [...api.getSceneElements()];
  const oldElements = scene.filter((element) => isElementInChart(element, state.activeChartId ?? ""));
  if (oldElements.length === 0) {
    showNotice("Chart Studio: the loaded chart is no longer present in this drawing.");
    return;
  }
  const location = getTopLeft(oldElements);
  ea.deleteViewElements(oldElements);
  await ea.setScriptSettings({ chartConfig: cloneConfig(state.config) });
  await drawChart(ea, cloneConfig(state.config), state.activeChartId, location);
  updateStatus(ea, state, refs);
  showNotice("Chart Studio: loaded chart updated from its embedded data.");
  keepPanelFocused(tab);
}

function keepPanelFocused(tab: ExcalidrawSidepanelTab): void {
  // Chart insertion no longer uses the reposition-to-cursor path, so normally
  // the dock remains untouched. Focus again after the scene update as a small
  // guard against host-level focus changes without closing/reopening the tab.
  tab.focus();
  window.requestAnimationFrame(() => tab.focus());
}

function loadSelectedChart(ea: ExcalidrawAutomate, state: PanelState, controller: ChartPanelController): void {
  const selection = getChartSelection(ea.getViewSelectedElements());
  if (!selection) {
    showNotice("Chart Studio: select any element from a Chart Studio chart first.");
    return;
  }
  state.config = readChartConfig(selection.config);
  state.activeChartId = selection.chartId;
  controller.render();
  showNotice("Chart Studio: chart data loaded from customData.");
}

function updateStatus(ea: ExcalidrawAutomate, state: PanelState, refs: PanelRefs): void {
  if (!refs.status) return;
  if (!state.viewAvailable || !ea.getExcalidrawAPI()) {
    refs.status.textContent = "Focus an Excalidraw canvas to draw charts.";
    refs.status.className = "chart-studio-status is-warning";
  } else {
    const selected = getChartSelection(ea.getViewSelectedElements());
    refs.status.textContent = selected
      ? `Selected: ${chartTypeLabel(selected.config.type)} chart · click “Load selected chart” to edit`
      : state.activeChartId
        ? "A chart is loaded for update. Select one of its elements anytime to reload its data."
        : "Ready. New charts are inserted in the visible canvas area.";
    refs.status.className = `chart-studio-status${selected ? " is-ready" : ""}`;
  }
  if (refs.updateButton) refs.updateButton.disabled = !state.activeChartId || !state.viewAvailable;
}

function getTopLeft(elements: ExcalidrawElement[]): { x: number; y: number } {
  return {
    x: Math.min(...elements.map((element) => element.x)),
    y: Math.min(...elements.map((element) => element.y)),
  };
}

function moveRow(state: PanelState, index: number, delta: number, controller: ChartPanelController): void {
  const target = index + delta;
  if (target < 0 || target >= state.config.data.length) return;
  const current = state.config.data[index];
  const other = state.config.data[target];
  if (!current || !other) return;
  state.config.data[index] = other;
  state.config.data[target] = current;
  controller.render();
}

function deleteRow(state: PanelState, index: number, controller: ChartPanelController): void {
  if (state.config.data.length <= 1) {
    showNotice("Chart Studio: keep at least one data row.");
    return;
  }
  state.config.data.splice(index, 1);
  controller.render();
}

function refreshPreview(tab: ExcalidrawSidepanelTab, state: PanelState): void {
  // Query the current panel DOM every time instead of relying on a reference
  // captured during a previous render. Some host-side tab lifecycle operations
  // can reparent/recreate the content element while keeping the controller alive.
  const preview = tab.contentEl.querySelector<HTMLElement>(".chart-studio-preview");
  if (preview) renderPreview(preview, state.config);
  const dimensions = tab.contentEl.querySelector<HTMLElement>(".chart-studio-preview-dimensions");
  if (dimensions) dimensions.textContent = `${Math.round(state.config.width)} × ${Math.round(state.config.height)}`;
}

function createChartId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `chart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function textField(labelText: string, value: string, onChange: (value: string) => void): HTMLElement {
  const field = fieldShell(labelText);
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.className = "chart-studio-input";
  input.addEventListener("input", () => onChange(input.value));
  field.appendChild(input);
  return field;
}

function numberField(
  labelText: string,
  value: number,
  min: number,
  max: number,
  onChange: (value: number) => void,
  step = 1,
): HTMLElement {
  const field = fieldShell(labelText);
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.className = "chart-studio-input";
  input.addEventListener("input", () => {
    const numeric = Number(input.value);
    if (Number.isFinite(numeric)) onChange(Math.min(max, Math.max(min, numeric)));
  });
  field.appendChild(input);
  return field;
}

function selectField(
  labelText: string,
  options: string[],
  selected: string,
  onChange: (value: string) => void,
): HTMLElement {
  const field = fieldShell(labelText);
  const select = document.createElement("select");
  select.className = "chart-studio-select";
  options.forEach((option) => {
    const el = document.createElement("option");
    el.value = option;
    el.textContent = option;
    el.selected = option === selected;
    select.appendChild(el);
  });
  select.addEventListener("change", () => onChange(select.value));
  field.appendChild(select);
  return field;
}

function rangeField(
  labelText: string,
  value: number,
  min: number,
  max: number,
  suffix: string,
  onChange: (value: number) => void,
): HTMLElement {
  const field = fieldShell(`${labelText}: ${Math.round(value)}${suffix}`);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.className = "chart-studio-range";
  input.addEventListener("input", () => onChange(Number(input.value)));
  field.appendChild(input);
  return field;
}

function toggleField(labelText: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
  const label = make("label", "chart-studio-toggle");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  // `input` fires immediately for checkbox toggles and keeps the chart preview
  // in lockstep with the visible switch state.
  input.addEventListener("input", () => onChange(input.checked));
  const switchEl = make("span", "chart-studio-switch");
  const text = make("span");
  text.textContent = labelText;
  label.append(input, switchEl, text);
  return label;
}

function fieldShell(labelText: string): HTMLElement {
  const label = make("label", "chart-studio-field");
  const caption = make("span", "chart-studio-field-label");
  caption.textContent = labelText;
  label.appendChild(caption);
  return label;
}

function sectionEl(titleText: string, description: string): HTMLElement {
  const section = make("section", "chart-studio-section");
  const title = make("div", "chart-studio-section-title");
  title.textContent = titleText;
  const hint = make("div", "chart-studio-section-hint");
  hint.textContent = description;
  section.append(title, hint);
  return section;
}

function iconButton(text: string, title: string, action: () => void): HTMLButtonElement {
  const button = makeButton(text, "chart-studio-icon-button");
  button.title = title;
  button.addEventListener("click", action);
  return button;
}

function makeButton(text: string, className = ""): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  if (className) button.className = className;
  return button;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

function chartTypeIcon(type: ChartType): string {
  const icons: Record<ChartType, string> = {
    pie: "◕",
    donut: "◉",
    bar: "▥",
    "bar-horizontal": "▤",
    line: "⌁",
    area: "◢",
  };
  return icons[type];
}

function injectStyles(parent: HTMLElement): void {
  const style = document.createElement("style");
  style.textContent = `
.chart-studio{--cs-border:var(--background-modifier-border);--cs-soft:var(--background-secondary);--cs-accent:var(--interactive-accent);display:flex;flex-direction:column;gap:14px;padding:2px 10px 18px;font-size:13px;color:var(--text-normal)}
.chart-studio *{box-sizing:border-box}.chart-studio-header{display:flex;align-items:center;justify-content:space-between;padding-top:4px}.chart-studio-title{font-size:20px;font-weight:750;letter-spacing:-.02em}.chart-studio-subtitle,.chart-studio-muted{font-size:11px;color:var(--text-muted)}
.chart-studio-badge{font-size:9px;font-weight:800;letter-spacing:.08em;padding:4px 7px;border-radius:999px;background:var(--cs-soft);color:var(--text-muted)}.chart-studio-status{padding:9px 10px;border-radius:9px;background:var(--cs-soft);color:var(--text-muted);line-height:1.35}.chart-studio-status.is-ready{box-shadow:inset 3px 0 0 var(--cs-accent)}.chart-studio-status.is-warning{color:var(--text-warning)}
.chart-studio-section{display:flex;flex-direction:column;gap:9px;padding:12px;border:1px solid var(--cs-border);border-radius:12px;background:var(--background-primary)}.chart-studio-section-title{font-size:13px;font-weight:700}.chart-studio-section-hint{font-size:11px;color:var(--text-muted);margin-top:-5px}.chart-studio-type-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.chart-studio-type{height:48px;display:flex;flex-direction:column;gap:2px;align-items:center;justify-content:center;border-radius:9px;font-size:17px}.chart-studio-type span{font-size:10px}.chart-studio-type.is-active{background:color-mix(in srgb,var(--interactive-accent) 16%,var(--background-primary));border-color:var(--interactive-accent);color:var(--text-accent)}
.chart-studio-preview-card{overflow:hidden;border:1px solid var(--cs-border);border-radius:12px;background:var(--background-primary)}.chart-studio-preview-top{display:flex;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--cs-border);font-weight:650}.chart-studio-preview{height:180px;padding:6px;background:radial-gradient(circle at 1px 1px,var(--background-modifier-border) 1px,transparent 1px);background-size:14px 14px}.chart-studio-preview-svg{width:100%;height:100%;display:block}
.chart-studio-data-rows{display:flex;flex-direction:column;gap:6px}.chart-studio-data-row{display:grid;grid-template-columns:26px minmax(0,1fr) 72px auto;gap:5px;align-items:center}.chart-studio-color{width:26px;height:28px;border:0;padding:0;background:transparent}.chart-studio-input,.chart-studio-select,.chart-studio-textarea{width:100%;min-width:0;border:1px solid var(--cs-border);border-radius:7px;background:var(--background-primary-alt);color:var(--text-normal)}.chart-studio-input,.chart-studio-select{height:30px;padding:4px 7px}.chart-studio-row-controls{display:flex;gap:2px}.chart-studio-icon-button{min-width:24px;height:27px;padding:0 5px}.chart-studio-toolbar{display:flex;flex-wrap:wrap;gap:5px}.chart-studio-details{border-top:1px solid var(--cs-border);padding-top:8px}.chart-studio-details summary{cursor:pointer;color:var(--text-muted);margin-bottom:7px}.chart-studio-textarea{height:82px;resize:vertical;padding:7px;font-family:var(--font-monospace);font-size:11px;margin-bottom:6px}
.chart-studio-field{display:flex;flex-direction:column;gap:4px;min-width:0}.chart-studio-field-label{font-size:10px;font-weight:650;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em}.chart-studio-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.chart-studio-toggle-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.chart-studio-toggle{display:flex;align-items:center;gap:7px;cursor:pointer}.chart-studio-toggle input{position:absolute;opacity:0;pointer-events:none}.chart-studio-switch{width:28px;height:16px;border-radius:999px;background:var(--background-modifier-border);position:relative;transition:.15s}.chart-studio-switch:after{content:"";position:absolute;width:12px;height:12px;left:2px;top:2px;border-radius:50%;background:var(--text-muted);transition:.15s}.chart-studio-toggle input:checked+.chart-studio-switch{background:var(--interactive-accent)}.chart-studio-toggle input:checked+.chart-studio-switch:after{transform:translateX(12px);background:white}.chart-studio-range{width:100%;accent-color:var(--interactive-accent)}
.chart-studio-actions{position:sticky;bottom:0;z-index:2;display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px 0 2px;background:linear-gradient(transparent,var(--background-primary) 18%)}.chart-studio-actions button{min-height:34px;border-radius:8px}.chart-studio-primary{grid-column:1/-1;font-weight:700}.chart-studio-quiet{opacity:.78}
`;
  parent.appendChild(style);
}
