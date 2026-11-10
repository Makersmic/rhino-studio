/**
 * The job file's name in Job setup (Mike, Nov 9: editable). It's typed without ".gcode"; what's sent is cleaned the
 * same way as every prepared file (safeName: letters, digits, _ . - only), so a typed name can't reach another folder.
 */

/** A file name the Rhino will take: letters, digits, _ . - only; the extension lower case (.gcode if none) */
export function safeName(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'job'
  return `${base}${dot > 0 ? name.slice(dot).toLowerCase() : '.gcode'}`
}

/** The prepared file's extension, ".gcode" for a sliced file or a ready-made file's own (".nc", ".gco") */
export function extOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(dot).toLowerCase() : '.gcode'
}

/** "bracket.gcode" -> "bracket": what the field starts with */
export function baseOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/**
 * The file that's sent: the typed name with the prepared file's extension (typed or not), or the prepared file as it
 * is when the field is blank. No leading dots, so it can't become a hidden file.
 */
export function outFileName(typed: string | null, prepared: string): string {
  const ext = extOf(prepared)
  let t = (typed ?? '').trim()
  if (t.toLowerCase().endsWith(ext)) t = t.slice(0, -ext.length)
  t = t.replace(/^[.\s]+/, '')
  return t ? safeName(`${t}${ext}`) : prepared
}
