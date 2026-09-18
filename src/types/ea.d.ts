/**
 * @file ea.d.ts
 * @overview Ambient type declarations for the ExcalidrawAutomate globals
 *   injected by the Excalidraw Script Engine at runtime.
 *
 *   These are minimal stubs — add more signatures as your script grows.
 *   For the authoritative API see:
 *   https://zsviczian.github.io/obsidian-excalidraw-plugin/
 */

// ---------------------------------------------------------------------------
// Minimal ExcalidrawAutomate surface
// ---------------------------------------------------------------------------

declare interface ExcalidrawAutomate {
  /** Excalidraw view currently bound to this EA instance. */
  targetView: ExcalidrawView | null;

  /** Rebinds this EA instance to an Excalidraw view. */
  setView(view: ExcalidrawView | null): void;

  /** Current persistent scene-change subscription used by the script. */
  onSceneChangeHook: SceneChangeHook | null;

  /** Finds a sidepanel tab already owned by this script. */
  checkForActiveSidepanelTabForScript(scriptName?: string): ExcalidrawSidepanelTab | null;

  /** Creates a sidepanel tab for this script. */
  createSidepanelTab(title: string, persist?: boolean, reveal?: boolean): Promise<ExcalidrawSidepanelTab | null>;

  /** Marks the current sidepanel tab as persistent across plugin/workspace restarts. */
  persistSidepanelTab(): ExcalidrawSidepanelTab | null;

  /** Merges keys into an element's customData while preserving existing customData. */
  addAppendUpdateCustomData(id: string, newData: Record<string, unknown>): ExcalidrawElement;

  /** Returns true when the running plugin version meets the minimum. */
  verifyMinimumPluginVersion(version: string): boolean;

  /** Returns the live Excalidraw React API for the active canvas. */
  getExcalidrawAPI(): ExcalidrawAPI | null;

  /** Clears staged workbench elements without changing the sidepanel or style. */
  clear(): void;

  /** Resets the workbench and style. NOTE: the real API also closes sidepanelTab. */
  reset(): void;

  /** Adds the supplied staged element IDs to one Excalidraw group. */
  addToGroup(objectIds: string[]): string;

  /**
   * Copies staged elements to the live scene.
   *
   * @param repositionToCursor                 When true, elements are placed at the cursor position.
   * @param finalizeWhenFallbackIsAvailable    When true, the scene is finalised even if the
   *                                           canvas API falls back to a compatibility path.
   */
  addElementsToView(
    repositionToCursor?: boolean,
    save?: boolean,
    newElementsOnTop?: boolean,
    shouldRestoreElements?: boolean,
    captureUpdate?: unknown,
  ): Promise<void>;

  /** The currently selected elements on the canvas. */
  getViewSelectedElements(): ExcalidrawElement[];

  /** Center point of the currently visible Excalidraw viewport. */
  getViewCenterPosition(): { x: number; y: number };

  /** Deletes the supplied elements from the active scene. */
  deleteViewElements(elements: ExcalidrawElement[]): boolean;

  /** Gets the current script's settings object from Obsidian data. */
  getScriptSettings(): Record<string, unknown>;

  /** Persists updated script settings. */
  setScriptSettings(settings: Record<string, unknown>): Promise<void>;

  // Element creation helpers
  addRect(topX: number, topY: number, width: number, height: number): string;
  addEllipse(topX: number, topY: number, width: number, height: number): string;
  addText(topX: number, topY: number, text: string, formatting?: TextFormatting): string;
  addLine(points: [number, number][]): string;
  addArrow(points: [number, number][], formatting?: ArrowFormatting): string;

  // Style setters (apply before calling add*)
  style: ElementStyle;
}


declare interface ExcalidrawView {
  [key: string]: unknown;
}

declare interface ExcalidrawSidepanelTab {
  readonly contentEl: HTMLDivElement;
  onOpen: () => Promise<void> | void;
  onFocus: (view: ExcalidrawView | null) => void;
  onClose: () => void;
  onExcalidrawViewClosed: () => void;
  focus(): void;
  open(reveal?: boolean): void;
  close(): void;
  getHostEA(): ExcalidrawAutomate;
}

declare interface SceneChangeHook {
  appStateKeys: string[];
  trackElements: boolean;
  triggerWhenInvisible: boolean;
  callback: (
    elements: readonly ExcalidrawElement[],
    appState: Record<string, unknown>,
    files: Record<string, unknown>,
    view: ExcalidrawView | null,
    hookEA: ExcalidrawAutomate,
  ) => void;
}

declare interface ElementStyle {
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  fillStyle: "hachure" | "cross-hatch" | "solid" | "dots" | "dashed" | "zigzag";
  roughness: number;
  opacity: number;
  fontSize: number;
  fontFamily: 1 | 2 | 3 | 4;
  textAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
}

declare interface TextFormatting {
  width?: number;
  height?: number;
  textAlign?: "left" | "center" | "right";
  box?: boolean;
  boxPadding?: number;
}

declare interface ArrowFormatting {
  startArrowHead?: string;
  endArrowHead?: string;
}

declare interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  backgroundColor: string;
  opacity: number;
  [key: string]: unknown;
}

declare interface ExcalidrawAPI {
  getSceneElements(): readonly ExcalidrawElement[];
  getAppState(): Record<string, unknown>;
  updateScene(sceneData: {
    elements?: ExcalidrawElement[];
    appState?: Record<string, unknown>;
  }): void;
  refresh(): void;
}

// ---------------------------------------------------------------------------
// Globals injected by the Script Engine
// ---------------------------------------------------------------------------

/** The ExcalidrawAutomate instance for the currently active canvas. */
declare const ea: ExcalidrawAutomate;

/** Obsidian's Notice class — available globally in the plugin context. */
declare class Notice {
  constructor(message: string, timeout?: number);
}

/** Script Engine helpers for prompts and suggestions. */
declare const utils: {
  inputPrompt(header: string, placeholder?: string, value?: string): Promise<string | null>;
  suggester(displayItems: string[], items?: unknown[], hint?: string): Promise<unknown>;
};
