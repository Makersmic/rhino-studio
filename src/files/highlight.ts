/**
 * G-code and Klipper config highlighting for the file editor (CodeMirror 6, MIT).
 * Small stream parsers: comments, [sections], "key:" names, G/M words and
 * their parameters, numbers. Nothing here understands Jinja beyond {…}.
 */
import { StreamLanguage, type StreamParser } from '@codemirror/language'

const gcode: StreamParser<null> = {
  name: 'gcode',
  token(stream) {
    if (stream.eatSpace()) return null
    if (stream.match(/^;.*/)) return 'comment'
    if (stream.match(/^\(.*?\)/)) return 'comment'
    if (stream.sol() || /\s/.test(stream.string.charAt(stream.pos - 1) || ' ')) {
      if (stream.match(/^[GgMmTt]\d+(\.\d+)?/)) return 'keyword'
      if (stream.match(/^[A-Z_][A-Z0-9_]{2,}(?=\s|$)/)) return 'macroName' // a Klipper macro like START_JOB
    }
    if (stream.match(/^[A-Za-z_]+=/)) return 'propertyName' // TOOLHEAD=BlockOne
    if (stream.match(/^[XYZEFSPIJKRxyzefspijkr](?=-?[\d.])/)) return 'propertyName'
    if (stream.match(/^-?\d*\.?\d+/)) return 'number'
    stream.next()
    return null
  },
}

const klipper: StreamParser<{ inGcode: boolean }> = {
  name: 'klipper',
  startState: () => ({ inGcode: false }),
  token(stream, st) {
    if (stream.sol() && stream.match(/^\[[^\]]*\]/)) {
      st.inGcode = false
      return 'heading'
    }
    if (stream.sol() && stream.match(/^#\*#.*/)) return 'meta' // SAVE_CONFIG block
    if (stream.eatSpace()) return null
    if (stream.match(/^[#;].*/)) return 'comment'
    if (stream.sol() || stream.string.slice(0, stream.pos).trim() === '') {
      const m = stream.match(/^[A-Za-z0-9_]+(?=\s*[:=])/)
      if (m) {
        st.inGcode = /^gcode$/i.test((m as RegExpMatchArray)[0])
        return 'propertyName'
      }
    }
    if (stream.match(/^\{[%{#].*?[%}#]\}/)) return 'string' // Jinja
    if (stream.match(/^[GgMm]\d+(\.\d+)?\b/)) return 'keyword'
    if (stream.match(/^-?\d*\.?\d+/)) return 'number'
    if (stream.match(/^(true|false|True|False)\b/)) return 'atom'
    stream.next()
    return null
  },
}

export const gcodeLanguage = StreamLanguage.define(gcode)
export const klipperLanguage = StreamLanguage.define(klipper)
