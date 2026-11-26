import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { CAMERA_BODIES } from '../cameras/registry'
import { MAX_NAME, type Recipe } from '../app/recipes'
import type { Recipes } from '../app/useRecipes'
import { IconClose, IconLink, IconPencil, IconRecipe, IconTrash } from './icons'
import { focusOnMount } from './useDialog'

type Props = {
  recipes: Recipes
  /** Badge of the mounted body, used to suggest a name. */
  badge: string
  onSave: (name: string) => void
}

const badgeOf = (id: string): string => CAMERA_BODIES.find((b) => b.id === id)?.badge ?? id

/** A one-line name form: amber readout field plus save and cancel keys. */
function NameForm({ initial, submitLabel, onSubmit, onCancel }: { initial: string; submitLabel: string; onSubmit: (name: string) => void; onCancel: () => void }) {
  const id = useId()
  const [name, setName] = useState(initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) onSubmit(name)
  }
  /** Escape cancels the form without also closing whatever sheet holds it. */
  const onKey = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    onCancel()
  }
  return (
    <form className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5" onSubmit={submit} onKeyDown={onKey}>
      <label htmlFor={id} className="sr-only">
        Recipe name
      </label>
      <input id={id} name="recipe-name" className="readout readout-input" value={name} maxLength={MAX_NAME} autoFocus autoComplete="off" spellCheck={false} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} />
      <button type="submit" className="key" disabled={!name.trim()}>
        {submitLabel}
      </button>
      <button type="button" className="key key-icon" aria-label="Cancel" onClick={onCancel}>
        <IconClose />
      </button>
    </form>
  )
}

function RecipeRow({ recipe, recipes }: { recipe: Recipe; recipes: Recipes }) {
  const [mode, setMode] = useState<'idle' | 'rename' | 'delete'>('idle')
  if (mode === 'rename') {
    return (
      <li>
        <NameForm initial={recipe.name} submitLabel="Rename" onCancel={() => setMode('idle')} onSubmit={(n) => {
            recipes.rename(recipe.id, n)
            setMode('idle')
          }} />
      </li>
    )
  }
  if (mode === 'delete') {
    return (
      <li role="group" aria-label={`Delete ${recipe.name}`} className="flex flex-wrap items-center gap-1.5">
        <span className="mr-auto min-w-0 truncate text-[12px] text-silver">Delete “{recipe.name}”?</span>
        <button type="button" className="key" onClick={() => recipes.remove(recipe.id)}>
          Delete
        </button>
        <button ref={focusOnMount} type="button" className="key" onClick={() => setMode('idle')}>
          Keep
        </button>
      </li>
    )
  }
  return (
    <li className="recipe-row">
      <button type="button" className="recipe-apply" onClick={() => recipes.apply(recipe)} aria-label={`Apply ${recipe.name} on the ${badgeOf(recipe.bodyId)}`}>
        <span className="truncate text-[12px] text-silver">{recipe.name}</span>
        <span className="shrink-0 font-[family-name:var(--font-badge)] text-[10px] font-bold text-dim" translate="no">{badgeOf(recipe.bodyId)}</span>
      </button>
      <button type="button" className="key key-icon" aria-label={`Copy a link to ${recipe.name}`} title="Copy link" onClick={() => void recipes.copyLink(recipe)}>
        <IconLink />
      </button>
      <button type="button" className="key key-icon" aria-label={`Rename ${recipe.name}`} title="Rename" onClick={() => setMode('rename')}>
        <IconPencil />
      </button>
      <button type="button" className="key key-icon" aria-label={`Delete ${recipe.name}`} title="Delete" onClick={() => setMode('delete')}>
        <IconTrash />
      </button>
    </li>
  )
}

/** Saved setups: body, params and rig under a name, one tap to bring back or share as a link. */
export function RecipesPanel({ recipes, badge, onSave }: Props) {
  const [naming, setNaming] = useState(false)
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="hairline-t grid gap-2.5 px-4 pb-4 pt-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="text-[12px] font-normal text-silver">
          Recipes
        </h3>
        {!naming && (
          <button type="button" className="key" onClick={() => setNaming(true)}>
            <IconRecipe />
            Save recipe
          </button>
        )}
      </div>
      {naming && <NameForm initial={`${badge} ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`} submitLabel="Save" onCancel={() => setNaming(false)} onSubmit={(n) => {
            onSave(n)
            setNaming(false)
          }} />}
      {recipes.list.length > 0 ? (
        <ul className="grid gap-1.5">
          {recipes.list.map((r) => (
            <RecipeRow key={r.id} recipe={r} recipes={recipes} />
          ))}
        </ul>
      ) : (
        !naming && <p className="text-[11px] leading-4 text-dim [text-wrap:pretty]">Keep this camera and its settings under a name to come back to, or share them as a link.</p>
      )}
    </section>
  )
}
