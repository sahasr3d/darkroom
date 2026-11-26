import { useMemo } from 'react'
import type { CameraBody, Params } from '../cameras/types'
import { type HardwareApplied, sensorPoint } from '../engine/hardware'
import { cropRect } from '../engine/layout'
import { focalToOptics, gateRig, type Rig } from '../engine/look'
import { slotsOf, type Shot, type SourceImage } from '../engine/pipeline'
import { useHardwareSync } from './hooks'

interface Options {
  body: CameraBody
  params: Params
  rig: Rig
  live: boolean
  /** The live camera feed, or null. */
  liveSource: SourceImage | null
  /** What the finder shows: the live feed, else the still. */
  source: SourceImage | null
  pair: SourceImage | null
  /** First exposure frozen while a live two-exposure shot is half done. */
  pendingA: SourceImage | null
  multiFrame: boolean
  doubleActive: boolean
}

export interface LiveShot {
  shot: Shot | null
  /** The rig as rendered: sensor-applied exposure and white balance are not applied twice. */
  effectiveRig: Rig
  hardware: HardwareApplied
}

/** The shot the finder renders, with manual controls pushed to the camera hardware where it can take them. */
export function useShot({ body, params, rig, live, liveSource, source, pair, pendingA, multiFrame, doubleActive }: Options): LiveShot {
  // Hardware focus wants sensor coordinates: undo the body's crop, the zoom and selfie mirroring.
  const sensorFocus = useMemo(() => {
    if (!rig.focus || !liveSource) return null
    const slot = slotsOf(body, params)[0]
    const align = liveSource.mirrored ? 1 - slot.align : slot.align
    const crop = cropRect(liveSource.width, liveSource.height, slot.aspect, align)
    const zoom = focalToOptics(gateRig(rig, body.accessories, !!body.slots).focal).zoom
    return sensorPoint(rig.focus, crop, zoom, !!liveSource.mirrored)
  }, [rig, liveSource, body, params])
  const hardwareRig = useMemo<Rig>(() => ({ ...rig, focus: sensorFocus }), [rig, sensorFocus])
  const hardware = useHardwareSync(liveSource, hardwareRig)

  // Half-frame: A frozen, B live. Double exposure: live (or still) over the first exposure.
  const shotSource = multiFrame ? (pendingA ?? source) : source
  const shotPair = multiFrame ? (pendingA ? liveSource : pair) : doubleActive ? (pendingA ?? pair) : null
  const effectiveRig = useMemo<Rig>(
    () => ({ ...rig, hwExposure: live && hardware.exposure, kelvin: live && hardware.whiteBalance ? 5500 : rig.kelvin }),
    [rig, live, hardware.exposure, hardware.whiteBalance],
  )
  const shot = useMemo<Shot | null>(
    () => (shotSource ? { body, params, rig: effectiveRig, source: shotSource, pair: shotPair } : null),
    [body, params, effectiveRig, shotSource, shotPair],
  )
  return { shot, effectiveRig, hardware }
}
