const jscad = require('@jscad/modeling')
const { primitives, transforms, colors, booleans } = jscad
const { colorize } = colors
const { union, subtract } = booleans

function main () {
  // Clean bicycle wheel: rim, hub, spokes, tire, axle
  const rimOuterRadius = 60
  const rimHeight = 8
  const rimOuter = primitives.cylinder({ height: rimHeight, radius: rimOuterRadius, segments: 128 })
  const rimInnerRadius = 56
  const rimCavity = primitives.cylinder({ height: rimHeight + 6, radius: rimInnerRadius, segments: 128 })
  let rim = subtract(rimOuter, rimCavity)

  // bead seats
  const beadSeatWidth = 1.2
  const beadSeatRadius = rimOuterRadius - 1.2
  const beadLeft = primitives.cylinder({ height: beadSeatWidth, radius: beadSeatRadius, segments: 64 })
  const beadRight = primitives.cylinder({ height: beadSeatWidth, radius: beadSeatRadius, segments: 64 })
  rim = union(rim, transforms.translate([0, 0, -rimHeight / 2 + beadSeatWidth / 2], beadLeft), transforms.translate([0, 0, rimHeight / 2 - beadSeatWidth / 2], beadRight))

  // hub and flanges
  const hubRadius = 6
  const hubHeight = 8
  const hubOuter = primitives.cylinder({ height: hubHeight, radius: hubRadius, segments: 64 })
  const hubBore = primitives.cylinder({ height: hubHeight + 2, radius: 2, segments: 64 })
  const hub = subtract(hubOuter, hubBore)
  const flangeRadius = hubRadius + 2
  const flangeHeight = 1.5
  // place flanges slightly off the hub center to simulate left/right flange spacing
  // offset flanges from the wheel midplane so spokes are visible in the render
  const flangeOffsetZ = 4

  // spokes (tapered two-segment spokes for a more realistic look)
  const spokeCount = 36
  // overall spoke dimensions
  // increased spoke radii so spokes read clearly in 2D renders
  const spokeRadiusThin = 1.6
  const spokeRadiusThick = 2.4
  // spokes run from flange to rim (approx)
  // extend spoke length slightly so nipples/spoke ends reach the rim inner face (avoid being recessed)
  const spokeLength = rimInnerRadius - flangeRadius + 3
  const spokes = []
  const nipples = []
  const flangeHoles = []
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2
    // build spoke as two cylinders: inner (thicker) and outer (thinner) to simulate taper
    const innerPortion = 0.38
    const innerLen = spokeLength * innerPortion
    const outerLen = spokeLength - innerLen
    // inner thicker segment
    let innerSeg = primitives.cylinder({ height: innerLen, radius: spokeRadiusThick, segments: 16 })
    innerSeg = transforms.rotateY(-Math.PI / 2, innerSeg)
    // move inner segment slightly inward so it intersects the flange/hub surface
    innerSeg = transforms.translate([hubRadius + innerLen / 2 - 1.2, 0, 0], innerSeg)
    innerSeg = transforms.rotateZ(angle, innerSeg)
    // outer thinner segment
    let outerSeg = primitives.cylinder({ height: outerLen, radius: spokeRadiusThin, segments: 16 })
    outerSeg = transforms.rotateY(-Math.PI / 2, outerSeg)
    outerSeg = transforms.translate([hubRadius + innerLen + outerLen / 2, 0, 0], outerSeg)
    outerSeg = transforms.rotateZ(angle, outerSeg)
    // alternate flange sides and small angle offset to hint at lacing
    const side = (i % 2 === 0) ? 1 : -1
    const angleOffset = (i % 2 === 0) ? 0.06 : -0.06
    innerSeg = transforms.rotateZ(angleOffset, innerSeg)
    outerSeg = transforms.rotateZ(angleOffset, outerSeg)
    innerSeg = transforms.translate([0, 0, side * flangeOffsetZ], innerSeg)
    outerSeg = transforms.translate([0, 0, side * flangeOffsetZ], outerSeg)
    const s = union(innerSeg, outerSeg)
    spokes.push(s)

    // small nipple at the rim end to read as spoke termination (slightly larger so it reads in 2D)
    let n = primitives.cylinder({ height: 1.0, radius: 0.6, segments: 16 })
    n = transforms.rotateY(-Math.PI / 2, n)
    // move nipple outward so it sits at the rim edge and reads more prominently in top-down renders
    n = transforms.translate([hubRadius + spokeLength + 0.8, 0, 0], n)
    n = transforms.rotateZ(angle, n)
    n = transforms.rotateZ(angleOffset, n)
    // keep nipple in the rim plane (no flange side offset)
    nipples.push(n)

    // create a small hole through each flange where the spoke originates
    // smaller flange hole to match reduced spoke/nipple diameter
    // slightly larger flange hole to ensure the spoke cut fully removes material and appears to originate
    let h = primitives.cylinder({ height: flangeHeight + 2, radius: 1.6, segments: 16 })
    h = transforms.translate([hubRadius, 0, 0], h)
    h = transforms.rotateZ(angle, h)
    h = transforms.rotateZ(angleOffset, h)
    h = transforms.translate([0, 0, side * flangeOffsetZ], h)
    flangeHoles.push(h)
  }

  const spokesUnion = union(...spokes, ...nipples)

  // subtract spokes from the rim so spoke holes/readings are visible in 2D renders
  // this cuts the rim where spokes and nipples meet it, preventing the wheel
  // from appearing as a filled disk in top-down snapshots
  rim = subtract(rim, spokesUnion)

  // build hub with flanges and subtract the flange holes so spokes appear to originate from flange
  const flange1 = transforms.translate([0, 0, -flangeOffsetZ], primitives.cylinder({ height: flangeHeight, radius: flangeRadius, segments: 64 }))
  const flange2 = transforms.translate([0, 0, flangeOffsetZ], primitives.cylinder({ height: flangeHeight, radius: flangeRadius, segments: 64 }))
  const hubWithFlanges = subtract(union(hub, flange1, flange2), union(...flangeHoles))

  // tire
  const tireThickness = 6
  // reduce tire height so it doesn't fully cover the flange offsets — exposes spokes in 2D renders
  const tireHeight = 4
  const tireOuter = primitives.cylinder({ height: tireHeight, radius: rimOuterRadius + tireThickness, segments: 128 })
  const tireInner = primitives.cylinder({ height: tireHeight, radius: rimOuterRadius, segments: 128 })
  let tire = subtract(tireOuter, tireInner)

  // subtract spokes from the tire as well so spokes are visible in top-down renders
  tire = subtract(tire, spokesUnion)

  // axle and nuts
  const axleLength = hubHeight + 30
  const axle = primitives.cylinder({ height: axleLength, radius: 1.6, segments: 32 })
  const axleHollow = subtract(axle, primitives.cylinder({ height: axleLength + 4, radius: 0.8, segments: 24 }))
  const nut = union(
    transforms.translate([0, 0, -axleLength / 2 - 1.25], primitives.cylinder({ height: 2.5, radius: 1.6 * 1.6, segments: 6 })),
    transforms.translate([0, 0, axleLength / 2 + 1.25], primitives.cylinder({ height: 2.5, radius: 1.6 * 1.6, segments: 6 }))
  )

  // colors and assembly
  const rimColored = colorize([0.7, 0.7, 0.75], rim)
  const hubColored = colorize([0.2, 0.22, 0.24], hubWithFlanges)
  // create a slightly raised copy of the spokes so they are visible above the rim/tire in top-down renders
  const spokesVisible = transforms.translate([0, 0, 0.8], spokesUnion)
  const spokesColored = colorize([0.93, 0.94, 0.96], spokesVisible)
  const tireColored = colorize([0, 0, 0], tire)
  const axleColored = colorize([0.2, 0.2, 0.25], axleHollow)
  const nutColored = colorize([0.15, 0.15, 0.18], nut)

  return union(rimColored, hubColored, spokesColored, tireColored, axleColored, nutColored)
}

module.exports = { main }