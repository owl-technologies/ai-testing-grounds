---
globs: "**/*.jscad"
description: Apply this rule when creating or modifying JSCAD files to ensure
  consistency, modularity, and reusability in parametric designs.
alwaysApply: true
---

Use a modular and parametric approach for JSCAD designs, inspired by the hip-implant.jscad structure. Ensure the following:
1. Define parameters using `getParameterDefinitions` for user customization.
2. Use helper functions for each component (e.g., `createRim`, `createHub`).
3. Use `union` to combine components into a final model.
4. Include comments to explain complex logic.
5. Use consistent naming conventions for variables and functions.
6. Ensure all functions are reusable and modular.

hip-implant.jscad: 
const jscad = require('@jscad/modeling')
const { colorize, hslToRgb } = jscad.colors
const { translate, translateX, translateY, translateZ, rotateX, rotateY } = jscad.transforms
const { union, subtract } = jscad.booleans
const { roundedRectangle, cuboid, roundedCuboid } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { degToRad } = jscad.utils

// Parametric everyday glasses with configurable fit (lens separation and temple reach to ears).
const getParameterDefinitions = () => [
  { name: 'frameWidth', type: 'number', initial: 140, min: 120, max: 170, step: 1, caption: 'Frame width (hinge to hinge, mm)' },
  { name: 'lensWidth', type: 'number', initial: 52, min: 40, max: 65, step: 1, caption: 'Lens width (mm)' },
  { name: 'lensHeight', type: 'number', initial: 42, min: 30, max: 60, step: 1, caption: 'Lens height (mm)' },
  { name: 'pupilDistance', type: 'number', initial: 62, min: 55, max: 75, step: 0.5, caption: 'Lens center distance (interpupillary, mm)' },
  { name: 'bridgeWidth', type: 'number', initial: 18, min: 12, max: 26, step: 0.5, caption: 'Bridge width (mm)' },
  { name: 'rimWidth', type: 'number', initial: 5, min: 2, max: 10, step: 0.5, caption: 'Rim width (mm)' },
  { name: 'frameThickness', type: 'number', initial: 4, min: 2, max: 8, step: 0.5, caption: 'Front thickness (mm)' },
  { name: 'lensRadius', type: 'number', initial: 6, min: 2, max: 12, step: 0.5, caption: 'Lens corner radius (mm)' },

  { name: 'templeLength', type: 'number', initial: 145, min: 120, max: 170, step: 1, caption: 'Temple length to ear (mm)' },
  { name: 'templeThickness', type: 'number', initial: 4, min: 3, max: 8, step: 0.5, caption: 'Temple thickness (mm)' },
  { name: 'templeHeight', type: 'number', initial: 10, min: 6, max: 14, step: 0.5, caption: 'Temple height (mm)' },
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
  const totalHeight = p.lensHeight + p.rimWidth * 2

  // Base plate
  const plate2d = roundedRectangle({
    size: [frameWidth, totalHeight],
    roundRadius: Math.min(p.rimWidth * 0.8, totalHeight / 4)
  })
  let front = extrudeLinear({ height: p.frameThickness }, plate2d)

  // Lens cutouts
  const lensShape = roundedRectangle({
    size: [p.lensWidth, p.lensHeight],
    roundRadius: Math.min(p.lensRadius, Math.min(p.lensWidth, p.lensHeight) / 2 - 1)
  })
  const eyeHalfGap = p.pupilDistance / 2
  const leftLens = translateX(-eyeHalfGap, lensShape)
  const rightLens = translateX(eyeHalfGap, lensShape)
  const lensCuts = extrudeLinear({ height: p.frameThickness + 0.1 }, [leftLens, rightLens]) // small extra to ensure clean boolean
  front = subtract(front, lensCuts)

  // Bridge relief (gentle inward curve)
  const bridgeRelief = roundedRectangle({
    size: [p.bridgeWidth, p.lensHeight],
    roundRadius: p.lensRadius * 0.6
  })
  const bridgeCut = translateZ(p.frameThickness * 0.25,
    extrudeLinear({ height: p.frameThickness * 0.9 }, bridgeRelief)
  )
  front = subtract(front, bridgeCut)

  // Color for quick visual separation
  const frameColor = hslToRgb(30 / 360, 0.45, 0.35) // warm matte brown
  return colorize(frameColor, front)
}

const buildTemples = (p, frameWidth) => {
  const hingeZ = p.frameThickness / 2
  const hingeY = 0
  const halfWidth = frameWidth / 2 - p.rimWidth / 2

  const makeSide = (side) => {
    const barLength = p.templeLength - p.templeDrop
    const bar = cuboid({
      size: [p.templeThickness, p.templeHeight, barLength],
      center: [0, 0, -barLength / 2]
    })

    const hook = rotateX(degToRad(-p.templeBendAngle),
      cuboid({
        size: [p.templeThickness, p.templeHeight, p.templeDrop],
        center: [0, 0, -p.templeDrop / 2]
      })
    )
    let temple = union(
      bar,
      translate([0, 0, -barLength], hook)
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
    roundRadius: Math.min(p.nosePadWidth, p.nosePadHeight) * 0.15,
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
