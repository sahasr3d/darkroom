import { useCallback, useEffect, useState } from 'react'
import { bodyById } from '../cameras/registry'
import type { Params } from '../cameras/types'
import { DEFAULT_RIG, type Rig } from '../engine/look'
import type { Aids, DrawerTab } from './aids'
import { defaultSettings, parseSettings, serializeSettings, SETTINGS_KEY } from './settings'
import { persistRig, type Snapshot } from './snapshot'
import { prefersDownloads, readStored, writeStored } from './storage'

/** Writes are batched: dragging a fader should not hit storage on every step. */
const SAVE_DELAY_MS = 400

export interface StudioState {
  bodyId: string
  setBodyId: (id: string) => void
  paramsById: Readonly<Record<string, Params>>
  /** Always derives from the latest stored params so rapid edits never overwrite each other. */
  updateParams: (id: string, update: (prev: Params) => Params) => void
  rig: Rig
  setRig: (patch: Partial<Rig>) => void
  aids: Aids
  setAids: (patch: Partial<Aids>) => void
  tab: DrawerTab
  setTab: (tab: DrawerTab) => void
  alsoDownload: boolean
  setAlsoDownload: (on: boolean) => void
  /** Switch to a snapshot's body and load its params and rig look (recipes, re-develop, links). */
  applySnapshot: (snap: Snapshot) => void
}

function loadInitial() {
  const s = parseSettings(readStored(SETTINGS_KEY), defaultSettings(prefersDownloads()))
  return { ...s, rig: { ...DEFAULT_RIG, ...s.rig } }
}

/** Studio settings, restored on start and remembered as they change (fail-soft localStorage). */
export function useStudioState(): StudioState {
  const [initial] = useState(loadInitial)
  const [bodyId, setBodyId] = useState(initial.bodyId)
  const [paramsById, setParamsById] = useState<Readonly<Record<string, Params>>>(initial.paramsById)
  const [rig, setRigState] = useState<Rig>(initial.rig)
  const [aids, setAidsState] = useState<Aids>(initial.aids)
  const [tab, setTab] = useState<DrawerTab>(initial.tab)
  const [alsoDownload, setAlsoDownload] = useState(initial.alsoDownload)

  useEffect(() => {
    const id = window.setTimeout(() => {
      writeStored(SETTINGS_KEY, serializeSettings({ bodyId, paramsById, rig: persistRig(rig), aids, tab, alsoDownload }))
    }, SAVE_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [bodyId, paramsById, rig, aids, tab, alsoDownload])

  const updateParams = useCallback((id: string, update: (prev: Params) => Params) => setParamsById((all) => ({ ...all, [id]: update(all[id] ?? bodyById(id).defaults) })), [])
  const setRig = useCallback((patch: Partial<Rig>) => setRigState((r) => ({ ...r, ...patch })), [])
  const setAids = useCallback((patch: Partial<Aids>) => setAidsState((a) => ({ ...a, ...patch })), [])
  const applySnapshot = useCallback((snap: Snapshot) => {
    setBodyId(snap.bodyId)
    setParamsById((all) => ({ ...all, [snap.bodyId]: snap.params }))
    setRigState((r) => ({ ...r, ...snap.rig }))
  }, [])

  return { bodyId, setBodyId, paramsById, updateParams, rig, setRig, aids, setAids, tab, setTab, alsoDownload, setAlsoDownload, applySnapshot }
}
