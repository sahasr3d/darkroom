/** File-name pieces shared by recordings and bursts: `vhs-20261126-061500.webm`. */
export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const stamp = (date: Date = new Date()): string => date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
