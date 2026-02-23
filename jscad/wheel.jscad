const jscad = require('@jscad/modeling')
const { colorize, hslToRgb } = jscad.colors
const { translate, translateX, translateY, translateZ, rotateX, rotateY, rotateZ } = jscad.transforms
const { union, subtract } = jscad.booleans
const { roundedRectangle, cuboid, roundedCuboid } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { degToRad } = jscad.utils

function main () {
  // Minimal initial wheel placeholder: a simple hollow disk using cylinders
  // Outer rim as a cylinder
  const rimOuterRadius = 60
  const rimHeight = 6
  const rimOuter = jscad.primitives.cylinder({ height: rimHeight, radius: rimOuterRadius, segments: 64 })
  // Inner hole to create hollow rim
  const rimHoleRadius = 40
  const rimHole = jscad.primitives.cylinder({ height: rimHeight + 2, radius: rimHoleRadius, segments: 64 })
  const rim = subtract(rimOuter, rimHole)
  // Simple hub at center
  const hubRadius = 6
  const hubHeight = 8
  const hub = jscad.primitives.cylinder({ height: hubHeight, radius: hubRadius, segments: 32 })

  // Assemble a few simple spokes (not full wheel, just a stylized approximation)
  const spokeCount = 12
  const spokeLength = rimOuterRadius - hubRadius - 6
  const spokeThickness = 1.8
  const spokeDepth = 1.6
  const spoke = jscad.primitives.cuboid({ size: [spokeLength, spokeDepth, spokeThickness] })
  const spokes = []
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2
    const s = jscad.transforms.rotateZ(angle, jscad.transforms.translate([hubRadius, 0, 0], spoke))
    spokes.push(s)
  }
  const wheel = union(rim, hub, ...spokes)
  return wheel
}

module.exports = { main }