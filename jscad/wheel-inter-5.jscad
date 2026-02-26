// simple bicycle wheel model for JSCAD
const { cylinder, cuboid } = require('@jscad/modeling').primitives
const { subtract, union } = require('@jscad/modeling').booleans
const { translate, rotateY, rotateZ } = require('@jscad/modeling').transforms

function makeRim(rOuter, rInner, width) {
  const outer = cylinder({ height: width, radius: rOuter, segments: 128 })
  const inner = cylinder({ height: width + 2, radius: rInner, segments: 128 })
  // align centers on Z (default)
  return subtract(outer, inner)
}

function makeTire(rimOuter, tireThickness, tireWidth) {
  const outer = cylinder({ height: tireWidth, radius: rimOuter + tireThickness, segments: 128 })
  const inner = cylinder({ height: tireWidth + 2, radius: rimOuter - 2, segments: 128 })
  return subtract(outer, inner)
}

function makeHub(hubRadius, hubLength) {
  return cylinder({ height: hubLength, radius: hubRadius, segments: 64 })
}

function makeSpokes(count, spokeRadius, spokeLength, hubRadius, hubLength) {
  // create two spoke flanges (left/right) offset along the hub axis (Z)
  const spokes = []
  const flangeOffset = Math.max(2, hubLength / 2 - 4) // distance from center to flange face
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    // create a thin cylinder along X, so rotateY to align its axis
    const spoke = cylinder({ height: spokeLength, radius: spokeRadius, segments: 24 })
    const offset = hubRadius + spokeLength / 2 + 2

    // right flange spoke
    const placedR = rotateZ(angle, translate([offset, 0, flangeOffset], rotateY(Math.PI / 2, spoke)))
    spokes.push(placedR)

    // left flange spoke (staggered a bit in angle to emulate lacing)
    const placedL = rotateZ(angle + (Math.PI / count), translate([offset, 0, -flangeOffset], rotateY(Math.PI / 2, spoke)))
    spokes.push(placedL)
  }
  return union(...spokes)
}

const main = () => {
  const rimOuter = 200
  const rimInner = 188
  const rimWidth = 18

  const tireThickness = 16
  const tireWidth = 26

  const hubRadius = 18
  const hubLength = 36

  const spokeCount = 32
  const spokeRadius = 1.2
  const rimDrillRadius = (rimInner + rimOuter) / 2
  const spokeLength = rimDrillRadius - hubRadius - 6

  const rim = makeRim(rimOuter, rimInner, rimWidth)
  const tire = translate([0, 0, 0], makeTire(rimOuter, tireThickness, tireWidth))
  const hub = translate([0, 0, 0], makeHub(hubRadius, hubLength))
  const spokes = makeSpokes(spokeCount, spokeRadius, spokeLength, hubRadius, hubLength)

  // assemble: hub centered, rim and tire centered
  return union(rim, tire, hub, spokes)
}

module.exports = { main }
