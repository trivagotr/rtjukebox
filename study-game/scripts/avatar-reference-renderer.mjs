const INK = '#10242a'
const SKIN = '#efaa79'
const SKIN_SHADOW = '#c97755'
const HAIR = '#512f23'
const HAIR_LIGHT = '#774632'

function q(value) {
  return Math.round(value * 10) / 10
}

function rect(x, y, width, height, fill, stroke = 'none', strokeWidth = 0, radius = 0) {
  return `<rect x="${q(x)}" y="${q(y)}" width="${q(width)}" height="${q(height)}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
}

function ellipse(cx, cy, rx, ry, fill, stroke = 'none', strokeWidth = 0) {
  return `<ellipse cx="${q(cx)}" cy="${q(cy)}" rx="${q(rx)}" ry="${q(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
}

function polygon(points, fill, stroke = 'none', strokeWidth = 0) {
  const value = points.map(([x, y]) => `${q(x)},${q(y)}`).join(' ')
  return `<polygon points="${value}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`
}

function line(x1, y1, x2, y2, stroke, width = 1) {
  return `<line x1="${q(x1)}" y1="${q(y1)}" x2="${q(x2)}" y2="${q(y2)}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`
}

function direction(p) {
  const side = Math.abs(p.dx) > 0.9
  const diagonal = Math.abs(p.dx) > 0.2 && !side
  const front = p.dy > 0.2
  const rear = p.dy < -0.2
  const sign = p.dx === 0 ? 1 : Math.sign(p.dx)
  return { diagonal, front, rear, side, sign }
}

function geometry(p) {
  const d = direction(p)
  const center = 32 + p.dx * 1.8
  const headCenter = center + p.dx * 1.1
  const torsoWidth = d.side ? 25 : d.diagonal ? 30 : 34
  const torsoLeft = center - torsoWidth / 2
  const torsoTop = p.torsoY - 1
  const torsoBottom = p.hipY + 3
  return { ...d, center, headCenter, torsoBottom, torsoLeft, torsoTop, torsoWidth }
}

function palette(variant) {
  if (variant === 'varsity-jacket') {
    return { base: '#8f2438', light: '#b83b50', shade: '#631a2b', accent: '#f2dfc4' }
  }
  return { base: '#168c91', light: '#32afb0', shade: '#0a6068', accent: '#eefaf8' }
}

function bodyLayer(p) {
  const g = geometry(p)
  const legY = p.hipY + 1
  const seatedForward = p.dx * p.seated * 9
  const torso = rect(g.torsoLeft - 1, g.torsoTop - 1, g.torsoWidth + 2, g.torsoBottom - g.torsoTop + 2, INK, INK, 1, 5)
  const neck = rect(g.headCenter - 4, p.headY + 19, 8, 9, INK, INK, 1, 2)

  if (p.seated > 0.5) {
    const left = polygon([
      [g.center - 13, legY],
      [g.center - 1, legY],
      [g.center + seatedForward + 2, legY + 9],
      [g.center + seatedForward - 1, legY + 15],
      [g.center - 13, legY + 9],
    ], INK)
    const right = polygon([
      [g.center + 1, legY],
      [g.center + 13, legY],
      [g.center + seatedForward + 13, legY + 10],
      [g.center + seatedForward + 8, legY + 16],
      [g.center + 1, legY + 9],
    ], INK)
    return `${neck}${torso}${left}${right}`
  }

  const walk = p.swing * 0.7
  return `${neck}${torso}${rect(g.center - 13, legY + walk, 12, 25, INK, INK, 1, 3)}${rect(g.center + 1, legY - walk, 12, 25, INK, INK, 1, 3)}`
}

function skinLayer(p) {
  const g = geometry(p)
  const headWidth = g.side ? 19 : g.diagonal ? 22 : 24
  const head = ellipse(g.headCenter, p.headY + 12, headWidth / 2, 13, SKIN, INK, 1.5)
  const earShift = g.side ? g.sign * 9 : 0
  const ears = g.rear
    ? `${ellipse(g.headCenter - 10, p.headY + 13, 2.3, 3.2, SKIN_SHADOW, INK, 1)}${ellipse(g.headCenter + 10, p.headY + 13, 2.3, 3.2, SKIN_SHADOW, INK, 1)}`
    : ellipse(g.headCenter - earShift, p.headY + 13, 2.2, 3.2, SKIN_SHADOW, INK, 1)

  let face = ''
  if (!g.rear) {
    const look = g.side ? g.sign * 4.5 : g.diagonal ? g.sign * 2.5 : 0
    if (g.side) {
      face += ellipse(g.headCenter + look, p.headY + 11, 1.4, 1.8, '#17262b')
      face += line(g.headCenter + look, p.headY + 17, g.headCenter + look + g.sign * 2.5, p.headY + 16.4, '#8a3f3a', 1)
    } else {
      face += ellipse(g.headCenter - 4.3 + look, p.headY + 11, 1.3, 1.7, '#17262b')
      face += ellipse(g.headCenter + 4.3 + look, p.headY + 11, 1.3, 1.7, '#17262b')
      face += line(g.headCenter - 2 + look, p.headY + 18, g.headCenter + 2 + look, p.headY + 18, '#8a3f3a', 1)
    }
  }

  const armSwing = p.action === 'walk' ? p.swing * 0.8 : 0
  const handY = p.seated > 0.5 ? p.hipY + 3 : p.hipY - 4
  const hands = `${ellipse(g.torsoLeft - 2, handY - armSwing, 3, 4, SKIN, INK, 1)}${ellipse(g.torsoLeft + g.torsoWidth + 2, handY + armSwing, 3, 4, SKIN, INK, 1)}`
  return `${head}${ears}${face}${hands}`
}

function hairLayer(p) {
  const g = geometry(p)
  const top = p.headY + 1
  if (g.rear) {
    return `${ellipse(g.headCenter, top + 9, g.side ? 9 : 11.5, 10.5, HAIR, INK, 1)}${polygon([
      [g.headCenter - 10, top + 10], [g.headCenter - 7, top + 22], [g.headCenter - 2, top + 18],
      [g.headCenter + 2, top + 22], [g.headCenter + 7, top + 18], [g.headCenter + 10, top + 9],
    ], HAIR_LIGHT, INK, 1)}`
  }

  const sweep = g.sign * (g.side ? 3 : g.diagonal ? 2 : 0)
  return `${ellipse(g.headCenter - sweep, top + 3, g.side ? 8 : 11, 6, HAIR, INK, 1)}${polygon([
    [g.headCenter - 10 + sweep, top + 4], [g.headCenter - 7 + sweep, top + 12],
    [g.headCenter - 3 + sweep, top + 7], [g.headCenter + 1 + sweep, top + 12],
    [g.headCenter + 5 + sweep, top + 6], [g.headCenter + 10 + sweep, top + 9],
    [g.headCenter + 9 + sweep, top + 1], [g.headCenter - 8 + sweep, top],
  ], HAIR, INK, 1)}`
}

function topLayer(p, variant = 'radio-hoodie') {
  const g = geometry(p)
  const colors = palette(variant)
  const bodyColor = g.rear ? colors.shade : colors.base
  const farColor = g.side || g.diagonal ? colors.shade : colors.base
  const armSwing = p.action === 'walk' ? p.swing : 0
  const armBottom = p.seated > 0.5 ? p.hipY + 1 : p.hipY - 2
  const body = rect(g.torsoLeft, g.torsoTop, g.torsoWidth, g.torsoBottom - g.torsoTop, bodyColor, INK, 1.5, 5)
  const farArm = polygon([
    [g.torsoLeft + 2, g.torsoTop + 4], [g.torsoLeft - 5, g.torsoTop + 10],
    [g.torsoLeft - 4, armBottom - armSwing], [g.torsoLeft + 2, armBottom - armSwing],
    [g.torsoLeft + 7, g.torsoTop + 12],
  ], farColor, INK, 1)
  const nearArm = polygon([
    [g.torsoLeft + g.torsoWidth - 2, g.torsoTop + 4], [g.torsoLeft + g.torsoWidth + 5, g.torsoTop + 10],
    [g.torsoLeft + g.torsoWidth + 4, armBottom + armSwing], [g.torsoLeft + g.torsoWidth - 2, armBottom + armSwing],
    [g.torsoLeft + g.torsoWidth - 7, g.torsoTop + 12],
  ], colors.base, INK, 1)

  let detail = ''
  if (g.rear) {
    detail += `<path d="M ${q(g.center - 10)} ${q(g.torsoTop + 2)} Q ${q(g.center)} ${q(g.torsoTop + 13)} ${q(g.center + 10)} ${q(g.torsoTop + 2)}" fill="none" stroke="${colors.light}" stroke-width="2"/>`
    detail += line(g.center, g.torsoTop + 11, g.center, g.torsoBottom - 2, colors.light, 1)
  } else {
    const zipX = g.center + (g.side ? g.sign * 4 : g.diagonal ? g.sign * 2 : 0)
    detail += line(zipX, g.torsoTop + 3, zipX, g.torsoBottom - 2, colors.accent, 1.5)
    if (!g.side && variant === 'radio-hoodie') {
      const badgeX = zipX + (g.sign > 0 ? 5 : -9)
      detail += rect(badgeX, g.torsoTop + 9, 6, 5, colors.accent, 'none', 0, 1)
      detail += line(badgeX + 2, g.torsoTop + 10, badgeX + 2, g.torsoTop + 13, colors.shade, 1)
      detail += line(badgeX + 4, g.torsoTop + 10, badgeX + 4, g.torsoTop + 13, colors.shade, 1)
    }
    if (variant === 'varsity-jacket') {
      detail += rect(g.torsoLeft + 1, g.torsoBottom - 4, g.torsoWidth - 2, 3, colors.accent)
    }
  }

  return `${farArm}${body}${nearArm}${detail}`
}

function bottomLayer(p, variant = 'jeans') {
  const g = geometry(p)
  const base = variant === 'black-cargos' ? '#20272b' : '#285f86'
  const shade = variant === 'black-cargos' ? '#10171a' : '#173c5a'
  const stitch = variant === 'black-cargos' ? '#8f784b' : '#6ea1bd'
  const hipY = p.hipY

  if (p.seated > 0.5) {
    const forward = p.dx * 10
    const left = polygon([
      [g.center - 14, hipY], [g.center - 1, hipY], [g.center + forward + 1, hipY + 8],
      [g.center + forward - 2, hipY + 15], [g.center - 13, hipY + 10],
    ], shade, INK, 1)
    const right = polygon([
      [g.center + 1, hipY], [g.center + 14, hipY], [g.center + forward + 14, hipY + 9],
      [g.center + forward + 9, hipY + 16], [g.center + 1, hipY + 10],
    ], base, INK, 1)
    const pockets = variant === 'black-cargos'
      ? `${rect(g.center - 12, hipY + 4, 6, 5, stitch, INK, 1, 1)}${rect(g.center + 6, hipY + 4, 6, 5, stitch, INK, 1, 1)}`
      : ''
    return `${left}${right}${pockets}`
  }

  const walk = p.action === 'walk' ? p.swing * 0.75 : 0
  const leftY = hipY + walk
  const rightY = hipY - walk
  const far = rect(g.center - 13, leftY, 12, 25, shade, INK, 1, 3)
  const near = rect(g.center + 1, rightY, 12, 25, base, INK, 1, 3)
  const waist = rect(g.center - 14, hipY - 2, 28, 5, base, INK, 1, 2)
  const pockets = variant === 'black-cargos'
    ? g.rear
      ? `${rect(g.center - 11, hipY + 5, 8, 5, shade, stitch, 1, 1)}${rect(g.center + 3, hipY + 5, 8, 5, shade, stitch, 1, 1)}${line(g.center, hipY + 3, g.center, hipY + 15, stitch, 1)}`
      : `${rect(g.center - 13, hipY + 7, 6, 6, stitch, INK, 1, 1)}${rect(g.center + 7, hipY + 7, 6, 6, stitch, INK, 1, 1)}`
    : `${line(g.center - 10, hipY + 4, g.center - 4, hipY + 7, stitch, 1)}${line(g.center + 10, hipY + 4, g.center + 4, hipY + 7, stitch, 1)}`
  return `${far}${near}${waist}${pockets}`
}

function shoesLayer(p, variant = 'sneakers') {
  const g = geometry(p)
  const boots = variant === 'boots'
  const base = boots ? '#4b3428' : '#f4faf8'
  const accent = boots ? '#251913' : '#168c91'
  const walk = p.action === 'walk' ? p.swing * 0.75 : 0

  if (p.seated > 0.5) {
    const forward = p.dx * 10
    const y = p.hipY + 14
    return `${rect(g.center + forward - 7, y, 13, boots ? 8 : 6, base, INK, 1, 2)}${rect(g.center + forward + 7, y + 1, 13, boots ? 8 : 6, base, INK, 1, 2)}${line(g.center + forward - 5, y + 3, g.center + forward + 3, y + 3, accent, 2)}${line(g.center + forward + 9, y + 4, g.center + forward + 17, y + 4, accent, 2)}`
  }

  const y = p.hipY + 22
  const facingNudge = p.dx * 2
  return `${rect(g.center - 14 + facingNudge, y + walk, 14, boots ? 8 : 6, base, INK, 1, 2)}${rect(g.center + 1 + facingNudge, y - walk, 14, boots ? 8 : 6, base, INK, 1, 2)}${line(g.center - 11 + facingNudge, y + 3 + walk, g.center - 3 + facingNudge, y + 3 + walk, accent, 2)}${line(g.center + 4 + facingNudge, y + 3 - walk, g.center + 12 + facingNudge, y + 3 - walk, accent, 2)}`
}

function hatLayer(p, variant = 'bucket-hat') {
  const g = geometry(p)
  const center = g.headCenter + p.dx * 0.8
  const top = p.headY - 4
  const base = variant === 'beanie' ? '#8f2438' : '#07515d'
  const light = variant === 'beanie' ? '#c94b5f' : '#147985'
  const shade = variant === 'beanie' ? '#5f1828' : '#032f39'

  if (variant === 'beanie') {
    const pom = ellipse(center, top + 1, 3, 2.5, light, INK, 1)
    const crown = ellipse(center, top + 9, g.side ? 9 : 12, 10, base, INK, 1.5)
    const band = rect(center - (g.side ? 9 : 12), top + 10, g.side ? 18 : 24, 5, shade, INK, 1, 2)
    return `${pom}${crown}${band}`
  }

  const brimWidth = g.side ? 25 : g.diagonal ? 29 : 31
  const brimShift = g.side ? g.sign * 3 : g.diagonal ? g.sign * 1.5 : 0
  const crownWidth = g.side ? 17 : g.diagonal ? 20 : 22
  const crown = polygon([
    [center - crownWidth / 2 + 2, top + 2], [center + crownWidth / 2 - 2, top + 2],
    [center + crownWidth / 2, top + 13], [center - crownWidth / 2, top + 13],
  ], base, INK, 1.5)
  const band = rect(center - crownWidth / 2, top + 9, crownWidth, 4, shade, INK, 1, 1)
  const brim = ellipse(center + brimShift, top + 14, brimWidth / 2, g.rear ? 3 : 3.8, base, INK, 1.5)
  const seam = g.rear
    ? `${line(center, top + 3, center, top + 9, light, 1)}${line(center - 7, top + 6, center - 5, top + 9, light, 1)}${line(center + 7, top + 6, center + 5, top + 9, light, 1)}`
    : line(center - crownWidth / 2 + 3, top + 6, center + crownWidth / 2 - 3, top + 6, light, 1)
  return `${crown}${seam}${band}${brim}`
}

const LAYERS = {
  body: bodyLayer,
  skin: skinLayer,
  hair: hairLayer,
  top: topLayer,
  bottom: bottomLayer,
  shoes: shoesLayer,
  hat: hatLayer,
}

export function renderReferenceLayer(layer, pose, variant) {
  const renderer = LAYERS[layer]
  if (!renderer) throw new Error(`Unknown avatar layer: ${layer}`)
  return renderer(pose, variant)
}
