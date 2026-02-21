const jscad = require('@jscad/modeling')
const { colorize, hslToRgb } = jscad.colors
const { translate, translateX, rotateX, rotateY } = jscad.transforms
const { union, subtract } = jscad.booleans
const { circle, cuboid, roundedCuboid, cylinder, sphere } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { degToRad } = jscad.utils

// Parametric everyday glasses with independent round rims and round temples.
const getParameterDefinitions = () => [
  { name: 'frameWidth', type: 'number', initial: 140, min: 120, max: 170, step: 1, caption: 'Frame width (hinge to hinge, mm)' },
  { name: 'lensWidth', type: 'number', initial: 48, min: 40, max: 65, step: 1, caption: 'Lens diameter (mm)' },
  { name: 'lensHeight', type: 'number', initial: 48, min: 40, max: 65, step: 1, caption: 'Lens diameter (mm, vertical)' },
  { name: 'pupilDistance', type: 'number', initial: 62, min: 55, max: 75, step: 0.5, caption: 'Lens center distance (interpupillary, mm)' },
  { name: 'bridgeWidth', type: 'number', initial: 18, min: 12, max: 26, step: 0.5, caption: 'Bridge width (mm)' },
  { name: 'rimWidth', type: 'number', initial: 1.2, min: 0.9, max: 6, step: 0.1, caption: 'Rim width (mm)' },
  { name: 'frameThickness', type: 'number', initial: 1.2, min: 1.0, max: 6, step: 0.1, caption: 'Front thickness (mm)' },

  { name: 'templeLength', type: 'number', initial: 145, min: 120, max: 170, step: 1, caption: 'Temple length to ear (mm)' },
  { name: 'templeThickness', type: 'number', initial: 4, min: 3, max: 7, step: 0.5, caption: 'Temple diameter (mm)' },
  { name: 'templeTilt', type: 'number', initial: 8, min: 0, max: 15, step: 0.5, caption: 'Outward tilt (deg) toward ears' },
  { name: 'templeDrop', type: 'number', initial: 25, min: 10, max: 40, step: 1, caption: 'Ear hook drop length (mm)' },
  { name: 'templeBendAngle', type: 'number', initial: 40, min: 10, max: 70, step: 1, caption: 'Ear hook bend (deg)' },

  { name: 'nosePadDepth', type: 'number', initial: 2.5, min: 0, max: 6, step: 0.5, caption: 'Nose pad stand-off (mm)' },
  { name: 'nosePadWidth', type: 'number', initial: 8, min: 4, max: 14, step: 0.5, caption: 'Nose pad width (mm)' },
  { name: 'nosePadHeight', type: 'number', initial: 14, min: 8, max: 20, step: 0.5, caption: 'Nose pad height (mm)' },
]

const main = (p) => {
  // Basic sanity to avoid overlaps
  const minFrame = p.lensWidth * 2 + p.bridgeWidth + p.rimWidth * 2
  const frameWidth = Math.max(p.frameWidth, minFrame)

  const front = buildFront(p, frameWidth)
  const temples = buildTemples(p, frameWidth)
  const pads = buildNosePads(p)

  return union(front, pads, temples)
}

const buildFront = (p, frameWidth) => {
  const lensRadius = Math.min(p.lensWidth, p.lensHeight) / 2
  const outerR = lensRadius + p.rimWidth
  const rim2d = subtract(
    circle({ radius: outerR, segments: 72 }),
    circle({ radius: lensRadius, segments: 72 })
  )
  const rim3d = extrudeLinear({ height: p.frameThickness }, rim2d)

  const eyeHalfGap = p.pupilDistance / 2
  const leftRim = translateX(-eyeHalfGap, rim3d)
  const rightRim = translateX(eyeHalfGap, rim3d)

  // Hinge stubs that bridge from rim edge to hinge position (so temples attach cleanly)
  const outerEdge = eyeHalfGap + outerR
  const hingeX = Math.max(frameWidth / 2, outerEdge)
  const stubWidth = Math.max(0, hingeX - outerEdge)
  const makeStub = (side) => {
    if (stubWidth <= 0) return null
    return translate([side * (outerEdge + stubWidth / 2), 0, p.frameThickness / 2],
      roundedCuboid({
        size: [stubWidth, p.rimWidth * 1.5, p.frameThickness],
        roundRadius: Math.min(p.rimWidth, p.frameThickness) * 0.35
      })
    )
  }
  const leftStub = makeStub(-1)
  const rightStub = makeStub(1)

  // Thin round bridge connecting otherwise independent rims
  const bridge = roundedCuboid({
    size: [p.bridgeWidth, p.rimWidth * 1.8, p.frameThickness],
    // must be strictly smaller than half of every dimension to avoid runtime error
    roundRadius: Math.min(p.rimWidth, p.frameThickness) * 0.45,
    center: [0, 0, p.frameThickness / 2]
  })

  const frameColor = hslToRgb(30 / 360, 0.45, 0.35) // warm matte brown
  return colorize(frameColor, union(
    leftRim,
    rightRim,
    bridge,
    leftStub || [],
    rightStub || []
  ))
}

const buildTemples = (p, frameWidth) => {
  const hingeZ = p.frameThickness / 2
  const hingeY = 0
  const lensRadius = Math.min(p.lensWidth, p.lensHeight) / 2
  const outerR = lensRadius + p.rimWidth
  const outerEdge = p.pupilDistance / 2 + outerR
  const halfWidth = Math.max(frameWidth / 2, outerEdge)

  const makeSide = (side) => {
    const barLength = p.templeLength - p.templeDrop
    const r = p.templeThickness / 2
    const joinEps = Math.max(0.4, r * 0.4) // tiny overlap to guarantee fused parts and robustness

    const bar = cylinder({
      radius: r,
      height: barLength + joinEps,
      center: [0, 0, -(barLength + joinEps) / 2],
      segments: 64
    })

    const hookMainLen = p.templeDrop * 0.65
    const hookTipLen = p.templeDrop - hookMainLen

    const mainAngle = degToRad(-p.templeBendAngle)
    const tipAngle = degToRad(-(p.templeBendAngle + 25))

    const hookMain = rotateX(mainAngle,
      cylinder({
        radius: r,
        height: hookMainLen,
        center: [0, 0, -hookMainLen / 2],
        segments: 48
      })
    )

    // Position the tip at the end of the first bend (account for rotated end position)
    const mainEnd = [
      0,
      -hookMainLen * Math.sin(mainAngle),
      -hookMainLen * Math.cos(mainAngle)
    ]
    const v1Len = Math.sqrt(mainEnd[1] ** 2 + mainEnd[2] ** 2) || 1
    const v1Unit = [0, mainEnd[1] / v1Len, mainEnd[2] / v1Len]
    const mainEndWithOverlap = [
      mainEnd[0] + v1Unit[0] * joinEps,
      mainEnd[1] + v1Unit[1] * joinEps,
      mainEnd[2] + v1Unit[2] * joinEps
    ]

    const hookTip = translate(mainEndWithOverlap,
      rotateX(tipAngle,
        cylinder({
          radius: r,
          height: hookTipLen + joinEps,
          center: [0, 0, -(hookTipLen + joinEps) / 2],
          segments: 48
        })
      )
    )

    // small junction bead to ensure watertight union between bends
    const junction = translate(mainEndWithOverlap, sphere({ radius: r * 1.02, segments: 32 }))

    let temple = union(
      bar,
      translate([0, 0, -barLength + joinEps / 2], union(hookMain, hookTip, junction))
    )

    temple = rotateY(degToRad(side * p.templeTilt), temple)
    temple = translate([side * halfWidth, hingeY, hingeZ], temple)

    const templeColor = hslToRgb(205 / 360, 0.35, 0.35) // slate blue
    return colorize(templeColor, temple)
  }

  return union(makeSide(1), makeSide(-1))
}

const buildNosePads = (p) => {
  const pad = roundedCuboid({
    size: [p.nosePadWidth, p.nosePadHeight, p.nosePadDepth],
    roundRadius: Math.min(p.nosePadWidth, p.nosePadHeight, p.nosePadDepth || Infinity) * 0.15,
    center: [0, 0, -p.nosePadDepth / 2]
  })

  const verticalOffset = 0 // center aligned with lens mid-height
  const horizontalOffset = p.bridgeWidth / 2
  const padLeft = translate([-horizontalOffset, verticalOffset, 0], pad)
  const padRight = translate([horizontalOffset, verticalOffset, 0], pad)

  const padColor = hslToRgb(0, 0, 0.8) // light translucent
  return colorize(padColor, union(padLeft, padRight))
}

module.exports = { main, getParameterDefinitions }
