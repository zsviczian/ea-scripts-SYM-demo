/**
 * @file main.ts
 * @overview Draws a smooth, editable circular arc from user-supplied radius,
 *   start angle, and sweep angle values, placing it at the current cursor.
 */

import { showNotice } from "../../sharedUtils/notice";

const DEFAULT_RADIUS = 120;
const DEFAULT_START_ANGLE = 0;
const DEFAULT_SWEEP_ANGLE = 90;
const MIN_RADIUS = 1;
const MAX_SWEEP_ANGLE = 360;
const MIN_SEGMENTS = 12;
const MAX_SEGMENTS = 180;
const DEGREES_PER_SEGMENT = 8;
const SETTINGS_KEYS = {
  radius: "radius",
  startAngle: "startAngle",
  sweepAngle: "sweepAngle",
} as const;

interface ArcSettings {
  radius: number;
  startAngle: number;
  sweepAngle: number;
}

/**
 * Reads the last valid arc settings, falling back to useful drawing defaults.
 *
 * @param settings Persisted script settings.
 * @returns Normalized settings for the next arc.
 */
function readArcSettings(settings: Record<string, unknown>): ArcSettings {
  return {
    radius: readNumber(settings[SETTINGS_KEYS.radius], DEFAULT_RADIUS, MIN_RADIUS),
    startAngle: readNumber(settings[SETTINGS_KEYS.startAngle], DEFAULT_START_ANGLE),
    sweepAngle: readNumber(
      settings[SETTINGS_KEYS.sweepAngle],
      DEFAULT_SWEEP_ANGLE,
      -MAX_SWEEP_ANGLE,
      MAX_SWEEP_ANGLE,
    ),
  };
}

/**
 * Converts a persisted value into a bounded finite number.
 *
 * @param value Candidate persisted value.
 * @param fallback Value to use when the candidate is invalid.
 * @param minimum Optional inclusive lower bound.
 * @param maximum Optional inclusive upper bound.
 * @returns A finite number within the requested bounds.
 */
function readNumber(
  value: unknown,
  fallback: number,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, numberValue));
}

/**
 * Prompts for one numeric arc setting and validates the response.
 *
 * @param label Prompt title.
 * @param value Current setting value.
 * @param minimum Inclusive lower bound.
 * @param maximum Inclusive upper bound.
 * @returns The entered number, or null when the prompt is cancelled or invalid.
 */
async function promptNumber(
  label: string,
  value: number,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
): Promise<number | null> {
  const response = await utils.inputPrompt(label, "Enter a number", String(value));
  if (response === null) {
    return null;
  }

  const numberValue = Number(response.trim());
  if (!Number.isFinite(numberValue) || numberValue < minimum || numberValue > maximum) {
    showNotice(`${label}: enter a number from ${minimum} to ${maximum}.`);
    return null;
  }

  return numberValue;
}

/**
 * Samples an arc and normalizes its points to the element's top-left origin.
 *
 * @param settings Radius and angular settings for the arc.
 * @returns Relative points suitable for `ea.addLine`.
 */
export function createArcPoints(settings: ArcSettings): [number, number][] {
  const sweepRadians = (settings.sweepAngle * Math.PI) / 180;
  const segmentCount = Math.min(
    MAX_SEGMENTS,
    Math.max(MIN_SEGMENTS, Math.ceil(Math.abs(settings.sweepAngle) / DEGREES_PER_SEGMENT)),
  );
  const points = Array.from({ length: segmentCount + 1 }, (_, index) => {
    const angle = (settings.startAngle * Math.PI) / 180 + (sweepRadians * index) / segmentCount;
    return [settings.radius * Math.cos(angle), settings.radius * Math.sin(angle)] as [number, number];
  });
  const minimumX = Math.min(...points.map(([x]) => x));
  const minimumY = Math.min(...points.map(([, y]) => y));

  return points.map(([x, y]) => [x - minimumX, y - minimumY]);
}

/**
 * Draws one editable arc and places it at the canvas cursor.
 *
 * @param ea ExcalidrawAutomate instance.
 * @param _api Excalidraw API for the active view.
 * @returns A promise that resolves after the arc is committed.
 */
export async function runDrawArcs(ea: ExcalidrawAutomate, _api: ExcalidrawAPI): Promise<void> {
  const settings = readArcSettings(ea.getScriptSettings());
  const radius = await promptNumber("Arc radius", settings.radius, MIN_RADIUS);
  if (radius === null) {
    return;
  }

  const startAngle = await promptNumber("Arc start angle (degrees)", settings.startAngle, -360);
  if (startAngle === null) {
    return;
  }

  const sweepAngle = await promptNumber(
    "Arc sweep angle (degrees)",
    settings.sweepAngle,
    -MAX_SWEEP_ANGLE,
    MAX_SWEEP_ANGLE,
  );
  if (sweepAngle === null || sweepAngle === 0) {
    if (sweepAngle === 0) {
      showNotice("Arc sweep angle must not be zero.");
    }
    return;
  }

  const nextSettings = { radius, startAngle, sweepAngle };
  await ea.setScriptSettings(nextSettings);

  ea.reset();
  ea.style.backgroundColor = "transparent";
  ea.style.strokeWidth = 2;
  ea.style.roughness = 0;
  ea.addLine(createArcPoints(nextSettings));
  await ea.addElementsToView(true, true);
  showNotice("Arc added at the cursor.");
}

/**
 * Runs the script-engine entrypoint.
 *
 * @returns A promise that resolves after the script completes.
 */
async function main(): Promise<void> {
  if (!ea.verifyMinimumPluginVersion("2.0.0")) {
    new Notice("This script requires Excalidraw 2.0.0 or newer.");
    return;
  }

  const api = ea.getExcalidrawAPI();
  if (!api) {
    showNotice("draw-arcs: could not obtain Excalidraw API.");
    return;
  }

  await runDrawArcs(ea, api);
}

void main();
