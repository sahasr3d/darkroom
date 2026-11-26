import { useId, useRef } from 'react'
import { ControlGroupBox, Fader } from './controls'
import { IconUpload } from './icons'

export interface LoadedGrade {
  title: string
  size: number
}

type Props = {
  grade: LoadedGrade | null
  strength: number
  /** Last load problem, in the interface's voice, or null. */
  error: string | null
  loading: boolean
  onFile: (file: File) => void
  onRemove: () => void
  onStrength: (value: number) => void
}

/** Custom film stock: a .cube 3D LUT graded in on top of whichever body is mounted. */
export function CustomGrade({ grade, strength, error, loading, onFile, onRemove, onStrength }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const statusId = useId()
  return (
    <ControlGroupBox title="Custom grade">
      <div id={statusId} className="readout flex min-h-[34px] items-center justify-between gap-3 px-2 py-1.5" aria-live="polite">
        <span className="min-w-0 truncate text-[14px] leading-tight">{loading ? 'Reading cube…' : grade ? grade.title : 'No grade loaded'}</span>
        {grade && !loading && <span className="shrink-0 text-[12px] tabular-nums text-amber/70">{grade.size}³</span>}
      </div>
      {!grade && !error && <p className="text-[11px] leading-4 text-dim [text-wrap:pretty]">Load a 3D .cube LUT from Resolve, Lightroom or a LUT pack. It grades every body, after the body's own colour.</p>}
      {error && (
        <p role="alert" className="text-[11px] leading-4 text-rec [text-wrap:pretty]">
          {error}
        </p>
      )}
      {grade && <Fader label="Grade strength" value={strength} min={0} max={100} step={1} unit="%" resetTo={100} onChange={onStrength} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="key" disabled={loading} aria-describedby={statusId} onClick={() => inputRef.current?.click()}>
          <IconUpload />
          {grade ? 'Load another .cube' : 'Load .cube file'}
        </button>
        {grade && (
          <button type="button" className="key" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".cube"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </ControlGroupBox>
  )
}
