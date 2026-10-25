/**
 * The camera's own brightness: exposure compensation, set on the camera
 * itself before the picture is taken.
 *
 * Making the picture darker afterwards would not do: a patch the camera has
 * already blown out to white holds nothing to darken, and lights fixed to a
 * board (a ring light) blow out the same segments in every frame. Turning the
 * exposure down is what gets the detail back.
 *
 * Not every camera lets a page do this. Chrome on Android usually does; Safari
 * on an iPhone does not, and neither do most laptop webcams. So the range is
 * read from the camera, and where there is none there is no control.
 */

/** What the camera allows, in its own units (usually EV stops), and what it is at. */
export interface Exposure {
  min: number;
  max: number;
  step: number;
  value: number;
}

// Exposure is in the Image Capture spec's constraints, which lib.dom does not type.
type WithExposure = { exposureCompensation?: { min: number; max: number; step: number }; exposureMode?: string[] };

/** The camera's exposure range and setting, or null if a page cannot change it. */
export function exposureOf(track: MediaStreamTrack | null | undefined): Exposure | null {
  const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & WithExposure) | undefined;
  const range = capabilities?.exposureCompensation;
  if (!track || !range || !(range.max > range.min)) return null;
  const value = (track.getSettings() as MediaTrackSettings & { exposureCompensation?: number }).exposureCompensation ?? 0;
  return { min: range.min, max: range.max, step: range.step > 0 ? range.step : (range.max - range.min) / 20, value };
}

/** `value` moved into the camera's range, onto one of its steps. */
export function clampExposure(value: number, range: Pick<Exposure, 'min' | 'max' | 'step'>): number {
  const stepped = range.min + Math.round((value - range.min) / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, Number(stepped.toFixed(4))));
}

/**
 * Sets the camera's exposure compensation; false if it did not take. The
 * constraints the camera was opened with are kept: applying only the new one
 * would drop the asked-for 1080p, and the camera would go back to its default
 * size, which breaks the calibration.
 *
 * A camera can pass over a set of `advanced` constraints it cannot meet
 * without saying so, so the setting is read back rather than trusted.
 */
export async function setExposure(track: MediaStreamTrack | null | undefined, value: number): Promise<boolean> {
  const range = exposureOf(track);
  if (!track || !range) return false;
  const target = clampExposure(value, range);
  const landed = () => Math.abs((exposureOf(track)?.value ?? Number.NaN) - target) <= range.step / 2;
  const apply = async (set: Record<string, unknown>) => {
    try {
      await track.applyConstraints({ ...track.getConstraints(), advanced: [set as MediaTrackConstraintSet] });
    } catch {
      // Refused: said by the read-back.
    }
    return landed();
  };

  const capabilities = track.getCapabilities() as MediaTrackCapabilities & WithExposure;
  // Compensation applies to the camera's own automatic exposure, which some
  // cameras have to be told to keep running; others refuse the two together.
  if (capabilities.exposureMode?.includes('continuous') && (await apply({ exposureMode: 'continuous', exposureCompensation: target }))) {
    return true;
  }
  return apply({ exposureCompensation: target });
}
