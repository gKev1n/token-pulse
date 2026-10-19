/** 精力值分级：上下文越满，小人越累；压缩上下文就是让它睡一觉 */
export type Level = {
  upTo: number
  word: string
  /** 小人和趋势条的颜色；中间色调在深浅主题下都看得清 */
  color: string
  /** 终端里的颜文字；只用单宽字符，避免在终端里错位 */
  kaomoji: string
  face: 'fresh' | 'focused' | 'tired' | 'drained' | 'asleep'
}

export const LEVELS: readonly Level[] = [
  { upTo: 25, word: 'Fresh', color: '#97C459', kaomoji: '(^‿^)', face: 'fresh' },
  { upTo: 50, word: 'Focused', color: '#5DCAA5', kaomoji: '(•_•)', face: 'focused' },
  { upTo: 75, word: 'Tired', color: '#EF9F27', kaomoji: '(-_-)', face: 'tired' },
  { upTo: 90, word: 'Drained', color: '#F0997B', kaomoji: '(=_=;)', face: 'drained' },
  { upTo: Infinity, word: 'Exhausted', color: '#E24B4A', kaomoji: '(-_-)zZ', face: 'asleep' },
]

export function levelFor(percent: number): Level {
  return LEVELS.find(l => percent < l.upTo) ?? LEVELS[LEVELS.length - 1]!
}

const INK = '#2C2C2A'

const line = (d: string, w = 1.4) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
const dot = (x: number, y: number, r = 1.3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/>`
const cheeks = '<circle cx="4.6" cy="13.4" r="1.5" fill="#F09595"/><circle cx="15.4" cy="13.4" r="1.5" fill="#F09595"/>'

function face(kind: Level['face']): string {
  switch (kind) {
    case 'fresh': // 眯眼大笑，脸红
      return (
        line('M5 10q1.6-2 3.2 0M11.8 10q1.6-2 3.2 0') +
        `<path d="M7 13.2h6q-0.4 3.4-3 3.4t-3-3.4z" fill="${INK}"/>` +
        cheeks
      )
    case 'focused': // 认真：圆眼 + 浅笑，不加眉毛（加了像生气）
      return dot(6.6, 10.2, 1.5) + dot(13.4, 10.2, 1.5) + line('M8.2 13.6q1.8 1.4 3.6 0')
    case 'tired': // 眼睛眯成线 + 打哈欠
      return line('M5 10.4h3.2M11.8 10.4h3.2') + `<ellipse cx="10" cy="14.4" rx="1.3" ry="1.6" fill="${INK}"/>`
    case 'drained': // 下垂眼（外低内高）+ 波浪嘴 + 汗珠
      return (
        line('M5 11.2l3-1.2M15 11.2l-3-1.2') +
        line('M7.6 14.6q1.2-1 2.4 0t2.4 0', 1.2) +
        '<path d="M18.2 3.4q1.6 2.4 0 3.5q-1.6-1.1 0-3.5z" fill="#85B7EB"/>'
      )
    case 'asleep': // 睡着：弯眼 + 平嘴 + zZ（灰色，深浅背景都看得见）
      return (
        line('M5 10.4q1.6 1.6 3.2 0M11.8 10.4q1.6 1.6 3.2 0') +
        line('M8.8 14.4h2.4') +
        `<text x="19.6" y="8.4" font-family="sans-serif" font-size="5.2" font-weight="700" fill="#888780">z</text>` +
        `<text x="22.6" y="5" font-family="sans-serif" font-size="7" font-weight="700" fill="#888780">Z</text>`
      )
  }
}

/** 桌面版小人：圆脸 + 表情，右侧留出放 zZ 和汗珠的位置，28×20 */
export function mascotSvg(level: Level): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 20" width="28" height="20">` +
    `<circle cx="10" cy="11" r="8.6" fill="${level.color}"/>` +
    face(level.face) +
    `</svg>`
  )
}
