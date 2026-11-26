import type { SVGProps } from 'react'

/** Bespoke 16px markings, drawn like silk-screened panel legends: square caps, 1.5px strokes. */
type IconProps = SVGProps<SVGSVGElement>

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'square' as const,
  'aria-hidden': true,
}

export const IconDice = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="2" y="2" width="12" height="12" />
    <circle cx="5.5" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="10.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
)

export const IconUpload = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M2 11v3h12v-3" />
    <path d="M8 10V2.5M4.75 5.5 8 2.25l3.25 3.25" />
  </svg>
)

export const IconCamera = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M1.75 4.75h3l1.25-2h4l1.25 2h3v8.5H1.75z" />
    <circle cx="8" cy="9" r="2.6" />
  </svg>
)

export const IconShutter = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="8" r="6" />
    <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />
  </svg>
)

export const IconStop = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="4" y="4" width="8" height="8" fill="currentColor" stroke="none" />
  </svg>
)

export const IconSave = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M8 2v8M4.75 7 8 10.25 11.25 7" />
    <path d="M2 13.5h12" />
  </svg>
)

export const IconStory = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="4.25" y="1.5" width="7.5" height="13" />
    <path d="M6 10.5h4" />
  </svg>
)

export const IconSplit = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="1.75" y="2.75" width="12.5" height="10.5" />
    <path d="M8 1v14" />
    <path d="M1.75 13.25 8 7" strokeWidth="1" />
  </svg>
)

export const IconReseed = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M13 8a5 5 0 1 1-1.6-3.7" />
    <path d="M13.25 2.5v3h-3" />
  </svg>
)

export const IconFlip = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M2.5 6.5a5.5 5.5 0 0 1 10-2.2M13.5 9.5a5.5 5.5 0 0 1-10 2.2" />
    <path d="M12.75 1.75v2.75H10M3.25 14.25V11.5H6" />
  </svg>
)

/** Film canister: the "roll" of sources (scenes, imports). */
export const IconRoll = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="2" y="4" width="8" height="9" />
    <path d="M4 4V2.5h4V4M10 6h4v5h-4" />
  </svg>
)

export const IconClose = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </svg>
)

export const IconFreeze = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" />
    <rect x="6" y="6" width="4" height="4" fill="currentColor" stroke="none" />
  </svg>
)

export const IconChevron = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 6.5 8 10.5l4-4" />
  </svg>
)

/** Contact sheet: three frames on a strip. */
export const IconSample = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="1.5" y="3.5" width="13" height="9" />
    <path d="M5.75 3.5v9M10.25 3.5v9" />
  </svg>
)

/** Camera roll: a stack of developed prints. */
export const IconPrints = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="4.25" y="4.25" width="10" height="9.5" />
    <path d="M1.75 11.25V1.75h9.5" />
    <path d="M4.25 11.5 7.5 8.25l2 2 1.75-1.5 3 2.75" strokeWidth="1" />
  </svg>
)

/** Share: a print leaving its tray. */
export const IconShare = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M5 6.5H2.75v7.75h10.5V6.5H11" />
    <path d="M8 10V1.75M5.25 4.25 8 1.5l2.75 2.75" />
  </svg>
)

export const IconTrash = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M2 4h12M6 4V2h4v2" />
    <path d="M3.5 4l.75 10h7.5l.75-10" />
    <path d="M6.75 7v4.5M9.25 7v4.5" strokeWidth="1" />
  </svg>
)

export const IconLink = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M6.75 9.25 9.25 6.75" />
    <path d="M7.5 4.5 9 3a2.47 2.47 0 0 1 3.5 3.5L11 8M8.5 11.5 7 13a2.47 2.47 0 0 1-3.5-3.5L5 8" />
  </svg>
)

export const IconPencil = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M2.25 13.75 3 10.5l7.75-7.75 2.5 2.5L5.5 13z" />
    <path d="M9.25 4.25l2.5 2.5" strokeWidth="1" />
  </svg>
)

/** Recipe card: a filed setup with a notch. */
export const IconRecipe = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M3 1.75h7l3 3v9.5H3z" />
    <path d="M5.5 7.5h5M5.5 10.5h3.5" strokeWidth="1" />
  </svg>
)

export const IconArrow = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M10 3 5 8l5 5" />
  </svg>
)

export const IconKeyboard = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="1.5" y="4" width="13" height="8.5" />
    <path d="M4 6.75h.5M6.75 6.75h.5M9.5 6.75h.5M12 6.75h.01M5 9.75h6" strokeWidth="1.25" />
  </svg>
)
