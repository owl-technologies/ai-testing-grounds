const jscad = require('@jscad/modeling')
const { colorize, hslToRgb } = jscad.colors
const { translate, translateX, translateY, translateZ, rotateX, rotateY } = jscad.transforms
const { union, subtract } = jscad.booleans
const { roundedRectangle, cuboid, roundedCuboid } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { degToRad } = jscad.utils

function main() {
  // Basic wheel parameters
  const outerRadius = 8
  const innerRadius = 6
  const wheelThickness = 1
  const hubDiameter = 0.6

  // Tire around the rim
  const tireOuterRadius = outerRadius + 0.75
  const tireCross = subtract(
    roundedRectangle({ size: [tireOuterRadius * 2, tireOuterRadius * 2], roundRadius: tireOuterRadius }),
    roundedRectangle({ size: [outerRadius * 2, outerRadius * 2], roundRadius: outerRadius })
  )
  const tire = extrudeLinear({ height: wheelThickness }, tireCross)

  // Rim as an annulus extruded along Z to create a hollow wheel
  const outerCircle = roundedRectangle({ size: [outerRadius * 2, outerRadius * 2], roundRadius: outerRadius })
  const innerCircle = roundedRectangle({ size: [innerRadius * 2, innerRadius * 2], roundRadius: innerRadius })
  const rimCross = subtract(outerCircle, innerCircle)
  const rim = extrudeLinear({ height: wheelThickness }, rimCross)

  // Hub at the wheel center
  const hub = cuboid({ size: [hubDiameter, hubDiameter, wheelThickness] })
  const hubPlaced = translate([-hubDiameter/2, -hubDiameter/2, wheelThickness / 2], hub)

  // Assemble wheel (rim + hub + tire)
  const wheel = union(rim, hubPlaced, tire)
  return wheel
}

module.exports = { main }