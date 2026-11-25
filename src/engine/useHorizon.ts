import { useCallback, useEffect, useState } from 'react'

export type HorizonSource = 'sensor' | 'simulator'

export interface Horizon {
  /** Camera roll in degrees (0 = level), or null while the level is off. */
  roll: number | null
  source: HorizonSource
  /** iOS asks for motion access from a tap before it sends orientation events. */
  needsPermission: boolean
  requestPermission: () => Promise<void>
  simulated: number
  setSimulated: (deg: number) => void
}

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }

/** No sensor reading within this window → fall back to the desktop tilt simulator. */
const SENSOR_TIMEOUT_MS = 1200

/** Roll from DeviceOrientation, corrected for screen rotation. */
export function rollFrom(beta: number, gamma: number, screenAngle: number): number {
  switch (((screenAngle % 360) + 360) % 360) {
    case 90:
      return -beta
    case 270:
      return beta
    case 180:
      return gamma
    default:
      return -gamma
  }
}

export function useHorizon(enabled: boolean): Horizon {
  const Ctor = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as OrientationCtor | undefined
  const [granted, setGranted] = useState(() => typeof Ctor?.requestPermission !== 'function')
  const [sensorRoll, setSensorRoll] = useState<number | null>(null)
  const [simulated, setSimulated] = useState(0)

  useEffect(() => {
    if (!enabled || !granted || !Ctor) return
    let gotReading = false
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return
      gotReading = true
      setSensorRoll(rollFrom(e.beta, e.gamma, screen.orientation?.angle ?? 0))
    }
    window.addEventListener('deviceorientation', onOrient)
    const timer = window.setTimeout(() => {
      if (!gotReading) setSensorRoll(null)
    }, SENSOR_TIMEOUT_MS)
    return () => {
      window.removeEventListener('deviceorientation', onOrient)
      window.clearTimeout(timer)
    }
  }, [enabled, granted, Ctor])

  const requestPermission = useCallback(async () => {
    if (typeof Ctor?.requestPermission !== 'function') return
    try {
      setGranted((await Ctor.requestPermission()) === 'granted')
    } catch {
      setGranted(false)
    }
  }, [Ctor])

  const source: HorizonSource = sensorRoll === null ? 'simulator' : 'sensor'
  return {
    roll: enabled ? (sensorRoll ?? simulated) : null,
    source,
    needsPermission: !granted,
    requestPermission,
    simulated,
    setSimulated,
  }
}
