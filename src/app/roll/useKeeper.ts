import { useCallback } from 'react'
import { download } from '../../engine/exporter'
import { keepSummary, type Keep, type KeepOutcome } from './keep'
import { thumbnailFromImage } from './thumbnail'
import type { Roll } from './useRoll'

/** The exposure sink: roll first, downloads by setting, download as a fallback when the roll fails or is memory-only. */
export function useKeeper(add: Roll['add'], alsoDownload: boolean, dualSave: boolean): Keep {
  return useCallback<Keep>(
    async (items) => {
      const outcomes: KeepOutcome[] = []
      let error: string | null = null
      for (const item of items) {
        const thumb = item.thumb !== undefined ? item.thumb : await thumbnailFromImage(item.blob)
        let kept = false
        let persisted = false
        try {
          const result = await add({
            kind: item.kind,
            blob: item.blob,
            thumb,
            original: item.original?.blob ?? null,
            filename: item.filename,
            width: item.width,
            height: item.height,
            ...item.snapshot,
          })
          kept = true
          persisted = result.persisted
        } catch (err: unknown) {
          error = err instanceof Error ? err.message : 'The camera roll could not keep this.'
        }
        // A shot held only in memory is gone when the tab closes, so download it too.
        const downloaded = alsoDownload || !persisted
        if (downloaded) download(item)
        const originalDownloaded = downloaded && dualSave && !!item.original
        if (originalDownloaded && item.original) download(item.original)
        outcomes.push({ filename: item.filename, kept, downloaded, originalDownloaded })
      }
      return keepSummary(outcomes, error)
    },
    [add, alsoDownload, dualSave],
  )
}
