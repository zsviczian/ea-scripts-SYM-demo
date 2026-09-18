/**
 * @file main.ts
 * @overview Opens Chart Studio, a persistent Excalidraw side panel for drawing and editing native pie, donut, bar, line, and area charts with chart data stored in element customData.
 */

import { showNotice } from "../../sharedUtils/notice";
import { readChartConfig } from "./chartModel";
import { createChartPanel } from "./panel";

async function main(): Promise<void> {
  if (!ea.verifyMinimumPluginVersion("2.0.0")) {
    new Notice("Chart Studio requires Excalidraw 2.0.0 or newer.");
    return;
  }

  const existingTab = ea.checkForActiveSidepanelTabForScript();
  if (existingTab) {
    const hostEA = existingTab.getHostEA();
    if (ea.targetView) hostEA.setView(ea.targetView);
    existingTab.open();
    return;
  }

  const settings = ea.getScriptSettings();
  const initialConfig = readChartConfig(settings.chartConfig);
  const tab = await ea.createSidepanelTab("Chart Studio", true, true);
  if (!tab) {
    showNotice("Chart Studio: could not create the Excalidraw side panel.");
    return;
  }

  const controller = createChartPanel(ea, tab, initialConfig);
  tab.onOpen = () => controller.render();
  tab.onFocus = (view) => {
    if (view && view !== ea.targetView) {
      ea.setView(view);
      ea.reset();
    }
    controller.setViewAvailable(Boolean(view));
    controller.refreshSelection();
  };
  tab.onClose = () => {
    ea.onSceneChangeHook = null;
    controller.destroy();
  };
  tab.onExcalidrawViewClosed = () => controller.setViewAvailable(false);

  ea.onSceneChangeHook = {
    appStateKeys: ["selectedElementIds"],
    trackElements: false,
    triggerWhenInvisible: false,
    callback: (_elements, _appState, _files, view) => {
      if (view && view !== ea.targetView) ea.setView(view);
      controller.setViewAvailable(Boolean(view));
      controller.refreshSelection();
    },
  };

  controller.render();
  tab.open();
}

void main();
