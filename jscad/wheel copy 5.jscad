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

function makeHub(hubRadius, hubLength, flangeOffset) {
  const hub = cylinder({ height: hubLength, radius: hubRadius, segments: 64 })
  // simple flanges on either side of the hub
  const flangeThickness = 4
  const flangeRadius = Math.max(hubRadius * 1.8, hubRadius + 8)
  const flange = cylinder({ height: flangeThickness, radius: flangeRadius, segments: 64 })
  const placedR = translate([0, 0, flangeOffset - flangeThickness / 2], flange)
  const placedL = translate([0, 0, -flangeOffset + flangeThickness / 2], flange)
  return union(hub, placedR, placedL)
}

function makeSpokes(count, spokeRadius, spokeLength, hubRadius, hubLength, rimDrillRadius, flangeOffset) {
  // create two spoke flanges (left/right) offset along the hub axis (Z)
  const spokes = []
  const nipples = []
  const heads = []
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    // create a thin cylinder along X, so rotateY to align its axis
    const spoke = cylinder({ height: spokeLength, radius: spokeRadius, segments: 24 })
    // position spoke center so outer end aligns exactly with rimDrillRadius
    const offset = rimDrillRadius - spokeLength / 2

    // right flange spoke
    const placedR = rotateZ(angle, translate([offset, 0, flangeOffset], rotateY(Math.PI / 2, spoke)))
    spokes.push(placedR)

    // left flange spoke (staggered a bit in angle to emulate lacing)
    const placedL = rotateZ(angle + (Math.PI / count), translate([offset, 0, -flangeOffset], rotateY(Math.PI / 2, spoke)))
    spokes.push(placedL)

    // add a small nipple at the outer rim end to give radial protrusion
    const nippleRadius = 1.8
    const nippleHeight = 3
    const nipple = rotateY(Math.PI / 2, cylinder({ height: nippleHeight, radius: nippleRadius, segments: 16 }))
    // place nipple slightly recessed into the rim drill hole (recess by a quarter of nipple height)
    const nipplePlacedR = rotateZ(angle, translate([rimDrillRadius - nippleHeight / 4, 0, 0], nipple))
    nipples.push(nipplePlacedR)

    // add small spoke head near each flange (inside, at the hub side)
    const headRadius = 1.6
    const headHeight = 1.6
    const head = rotateY(Math.PI / 2, cylinder({ height: headHeight, radius: headRadius, segments: 12 }))
    // place head so its outside face sits at the hubRadius (where the spoke meets the hub)
    const headPlacedR = rotateZ(angle, translate([hubRadius - headHeight / 2, 0, flangeOffset], head))
    const headPlacedL = rotateZ(angle + (Math.PI / count), translate([hubRadius - headHeight / 2, 0, -flangeOffset], head))
    heads.push(headPlacedR)
    heads.push(headPlacedL)
  }
  return union(...spokes, ...nipples, ...heads)
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
  // set spoke length to reach the rim drill radius (remove the 2 mm gap)
  const spokeLength = rimDrillRadius - hubRadius

  const rim = makeRim(rimOuter, rimInner, rimWidth)
  const tire = translate([0, 0, 0], makeTire(rimOuter, tireThickness, tireWidth))
  // compute flange offset and pass to both hub and spokes so they align
  const flangeOffset = Math.max(2, hubLength / 2 - 4) + 3
  const hub = translate([0, 0, 0], makeHub(hubRadius, hubLength, flangeOffset))
  const spokes = makeSpokes(spokeCount, spokeRadius, spokeLength, hubRadius, hubLength, rimDrillRadius, flangeOffset)

  // assemble: hub centered, rim and tire centered
  return union(rim, tire, hub, spokes)
}

module.exports = { main }
