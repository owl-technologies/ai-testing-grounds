const jscad = require('@jscad/modeling')
const { colorize, hslToRgb } = jscad.colors
const { translate, translateX, translateY, translateZ, rotateX, rotateY } = jscad.transforms
const { union, subtract } = jscad.booleans
const { roundedRectangle, cuboid, roundedCuboid } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { degToRad } = jscad.utils

// Hub at the wheel center
  const hub = roundedCuboid({ size: [hubDiameter, hubDiameter, wheelThickness], roundRadius: hubDiameter * 0.4 });
  const hubPlaced = translate([-hubDiameter/2, -hubDiameter/2, wheelThickness / 2], hub);

  // Assemble wheel (rim + hub + tire)
  const wheel = union(rim, hubPlaced, tire);
  return wheel;

module.exports = { main }