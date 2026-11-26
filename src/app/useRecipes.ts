import { useEffect, useState } from 'react'
import { bodyById } from '../cameras/registry'
import { cleanName, decodeRecipeHash, encodeRecipeHash, MAX_RECIPES, newRecipeId, parseRecipes, RECIPES_KEY, serializeRecipes, type Recipe } from './recipes'
import type { Snapshot } from './snapshot'
import { readStored, writeStored } from './storage'

export interface Recipes {
  list: readonly Recipe[]
  save: (name: string, snap: Snapshot) => void
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  apply: (recipe: Recipe) => void
  copyLink: (recipe: Recipe) => Promise<void>
}

/** A link to this page carrying the recipe, relative to wherever the app is served. */
function linkFor(recipe: Recipe): string {
  const url = new URL(window.location.href)
  url.hash = encodeRecipeHash(recipe, recipe.name).slice(1)
  return url.toString()
}

/**
 * Saved recipes (localStorage) and recipe links. A `#r=` link applies once on load, then the
 * hash is cleared so a reload does not re-apply it over later changes.
 */
export function useRecipes(applySnapshot: (snap: Snapshot) => void, onStatus: (message: string) => void): Recipes {
  const [list, setList] = useState<readonly Recipe[]>(() => parseRecipes(readStored(RECIPES_KEY)))

  /** Recipe edits are one click at a time, so they build on the rendered list. */
  const commit = (next: readonly Recipe[], done: string) => {
    setList(next)
    const stored = writeStored(RECIPES_KEY, serializeRecipes(next))
    onStatus(stored ? done : `${done} It lasts for this visit only: this browser blocked storage or it is full.`)
  }

  // On load, and whenever a link is pasted into an open tab.
  useEffect(() => {
    const readHash = () => {
      const hash = window.location.hash
      if (!hash.startsWith('#r=')) return
      const linked = decodeRecipeHash(hash)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      if (!linked) {
        onStatus('That recipe link is damaged or too long, so it was ignored.')
        return
      }
      applySnapshot(linked)
      onStatus(`Applied ${linked.name ? `“${linked.name}”` : 'a shared recipe'} on the ${bodyById(linked.bodyId).badge}.`)
    }
    readHash()
    window.addEventListener('hashchange', readHash)
    return () => window.removeEventListener('hashchange', readHash)
  }, [applySnapshot, onStatus])

  const save = (name: string, snap: Snapshot) => {
    const clean = cleanName(name)
    if (!clean) return
    commit([{ id: newRecipeId(), name: clean, createdAt: Date.now(), ...snap }, ...list].slice(0, MAX_RECIPES), `Saved recipe “${clean}”.`)
  }
  const rename = (id: string, name: string) => {
    const clean = cleanName(name)
    if (!clean) return
    commit(list.map((r) => (r.id === id ? { ...r, name: clean } : r)), `Renamed to “${clean}”.`)
  }
  const remove = (id: string) => {
    const gone = list.find((r) => r.id === id)
    if (gone) commit(list.filter((r) => r.id !== id), `Deleted recipe “${gone.name}”.`)
  }
  const apply = (recipe: Recipe) => {
    applySnapshot(recipe)
    onStatus(`Applied “${recipe.name}” on the ${bodyById(recipe.bodyId).badge}.`)
  }
  const copyLink = async (recipe: Recipe) => {
    try {
      await navigator.clipboard.writeText(linkFor(recipe))
      onStatus(`Link to “${recipe.name}” copied.`)
    } catch {
      onStatus('The link could not be copied: this browser blocked the clipboard.')
    }
  }

  return { list, save, rename, remove, apply, copyLink }
}
