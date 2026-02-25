const jscad = require('@jscad/modeling')
const { primitives, transforms, colors, booleans } = jscad
const { colorize } = colors
const { union, subtract } = booleans

function main () {
  // Minimal initial wheel placeholder: a simple hollow disk using cylinders
  // Outer rim as a cylinder
  const rimOuterRadius = 60
  // slightly taller rim for better tire fit and visible spoke holes
  const rimHeight = 8
  const rimOuter = primitives.cylinder({ height: rimHeight, radius: rimOuterRadius, segments: 64 })
  // Inner cavity to create a more realistic U-shaped rim profile (doesn't cut all the way through)
  const rimHoleRadius = 40
  // make the inner cavity slightly shorter than the rim height so the top and bottom bead seats remain thicker
  const rimCavity = primitives.cylinder({ height: Math.max(1, rimHeight - 4), radius: rimHoleRadius, segments: 64 })
  let rim = subtract(rimOuter, rimCavity)

  // Create spoke holes in the rim so spokes appear to connect realistically
  // increase spoke count slightly for a denser, more realistic wheel
  const spokeCount = 36
  const spokeRadius = 0.9
  const rimSpokeHoleRadius = spokeRadius * 1.4
  const rimSpokeHoleLength = rimHeight + 4
  const rimSpokeHoles = []
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2
    let hole = primitives.cylinder({ height: rimSpokeHoleLength, radius: rimSpokeHoleRadius, segments: 24 })
    // align hole along radial direction (X axis) and place through the rim wall (use midpoint between inner and outer radii)
    hole = transforms.rotateY(-Math.PI / 2, hole)
    const holeX = (rimHoleRadius + rimOuterRadius) / 2
    hole = transforms.translate([holeX, 0, 0], hole)
    hole = transforms.rotateZ(angle, hole)
    rimSpokeHoles.push(hole)
  }
  // Subtract the spoke holes from the rim
  rim = subtract(rim, ...rimSpokeHoles)

  // Add small countersink holes for nipples at the inner rim surface so nipples look seated
  const rimNippleHoleRadius = 0.9
  const rimNippleHoleLength = rimHeight + 4
  const rimNippleHoles = []
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2
    let hole = primitives.cylinder({ height: rimNippleHoleLength, radius: rimNippleHoleRadius, segments: 24 })
    hole = transforms.rotateY(-Math.PI / 2, hole)
    const nippleX = rimHoleRadius - 0.8
    hole = transforms.translate([nippleX, 0, 0], hole)
    hole = transforms.rotateZ(angle, hole)
    // small Z offset to match spoke crossing (so nipple holes align with spoke nipples)
    const crossZ = (i % 2 === 0) ? 0.6 : -0.6
    hole = transforms.translate([0, 0, crossZ], hole)
    rimNippleHoles.push(hole)
  }
  rim = subtract(rim, ...rimNippleHoles)

  // Add bead seats to the rim edges for better tire fit and realism
  // small raised lips near the rim edges where the tire would seat
  const beadSeatWidth = 1.2
  const beadSeatRadius = rimOuterRadius - 1.2
  const beadLeft = primitives.cylinder({ height: beadSeatWidth, radius: beadSeatRadius, segments: 64 })
  const beadRight = primitives.cylinder({ height: beadSeatWidth, radius: beadSeatRadius, segments: 64 })
  const beadLeftPlaced = transforms.translate([0, 0, -rimHeight / 2 + beadSeatWidth / 2], beadLeft)
  const beadRightPlaced = transforms.translate([0, 0, rimHeight / 2 - beadSeatWidth / 2], beadRight)
  rim = union(rim, beadLeftPlaced, beadRightPlaced)

  // Simple hollow hub at center
  const hubRadius = 6
  const hubHeight = 8
  // Create hollow hub by subtracting a bore from the outer hub
  const hubOuter = primitives.cylinder({ height: hubHeight, radius: hubRadius, segments: 32 })
  const hubBoreRadius = 2
  const hubBore = primitives.cylinder({ height: hubHeight + 2, radius: hubBoreRadius, segments: 32 })
  const hub = subtract(hubOuter, hubBore)

  // Add hub flanges for visual realism
  const flangeRadius = hubRadius + 2
  const flangeHeight = 1.5
  const flangeLeft = primitives.cylinder({ height: flangeHeight, radius: flangeRadius, segments: 32 })
  const flangeRight = primitives.cylinder({ height: flangeHeight, radius: flangeRadius, segments: 32 })
  const hubFlangeLeft = transforms.translate([0, 0, -hubHeight / 2], flangeLeft)
  const hubFlangeRight = transforms.translate([0, 0, hubHeight / 2], flangeRight)
  let hubWithFlanges = union(hub, hubFlangeLeft, hubFlangeRight)

  // Create holes in the flanges to accept spokes (improves visual realism)
  const flangeHoleRadius = rimSpokeHoleRadius * 0.9
  const flangeHoleLength = flangeHeight + 4
  const flangeHoles = []
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2
    let hole = primitives.cylinder({ height: flangeHoleLength, radius: flangeHoleRadius, segments: 24 })
    hole = transforms.rotateY(-Math.PI / 2, hole)
    // place holes near the flange circle slightly outside the hub radius
    const holeX = hubRadius + 1.2
    hole = transforms.translate([holeX, 0, 0], hole)
    hole = transforms.rotateZ(angle, hole)
    // move hole to the appropriate flange (alternate left/right)
    const flangeZPos = (i % 2 === 0) ? -hubHeight / 2 : hubHeight / 2
    hole = transforms.translate([0, 0, flangeZPos], hole)
    flangeHoles.push(hole)
  }
  hubWithFlanges = subtract(hubWithFlanges, ...flangeHoles)

  // Add a simple axle through the hub for realism
  const axleRadius = 1.6
  const axleLength = hubHeight + 30
  // Axle is aligned with the wheel axis (Z), longer than the hub so it protrudes
  const axle = primitives.cylinder({ height: axleLength, radius: axleRadius, segments: 32 })
  // add a hollow bore through the axle for a skewer/quick-release
  const axleBoreRadius = 0.8
  const axleBore = primitives.cylinder({ height: axleLength + 4, radius: axleBoreRadius, segments: 24 })
  const axleHollow = subtract(axle, axleBore)
  const axlePlaced = transforms.translate([0, 0, 0], axleHollow)
  const axleColored = colorize([0.2, 0.2, 0.25], axlePlaced)

  // add nuts at both ends of the axle (hex look using 6-segment cylinders)
  const nutRadius = axleRadius * 1.6
  const nutThickness = 2.5
  const nut = primitives.cylinder({ height: nutThickness, radius: nutRadius, segments: 6 })
  const nutLeft = transforms.translate([0, 0, -axleLength / 2 - nutThickness / 2 + 1], nut)
  const nutRight = transforms.translate([0, 0, axleLength / 2 + nutThickness / 2 - 1], nut)
  const nutColored = colorize([0.15, 0.15, 0.18], union(nutLeft, nutRight))

  // Assemble spokes with a tapered profile (thicker near the hub, thinner towards the rim)
  // Use the rim hole radius to determine spoke length so spokes meet the inner rim surface
  const spokeLength = rimHoleRadius - hubRadius - 1
  const spokes = []
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2

    // compute tilt so the inner end reaches the flange Z position (alternate left/right flange)
    const flangeZ = (i % 2 === 0) ? -hubHeight / 2 : hubHeight / 2
    let tiltArg = (-2 * flangeZ) / spokeLength
    if (tiltArg > 0.9) tiltArg = 0.9
    if (tiltArg < -0.9) tiltArg = -0.9
    const tilt = Math.asin(tiltArg)

    // create tapered spoke by composing two overlapping cylinders: inner thicker segment + outer thinner segment
    const innerSegmentRatio = 0.35
    const innerLength = spokeLength * innerSegmentRatio
    const outerLength = spokeLength - innerLength
    const innerRadius = spokeRadius * 1.6
    const outerRadius = spokeRadius

    // Introduce a small angular offset for the inner spoke segment to mimic real lacing (left/right flange offset)
    const innerAngleOffset = (i % 2 === 0) ? 0.04 : -0.04

    // inner (near-hub) segment
    let innerRod = primitives.cylinder({ height: innerLength, radius: innerRadius, segments: 24 })
    innerRod = transforms.rotateY(-Math.PI / 2 + tilt, innerRod)
    const innerCenterX = hubRadius + innerLength / 2
    innerRod = transforms.translate([innerCenterX, 0, 0], innerRod)
    innerRod = transforms.rotateZ(angle + innerAngleOffset, innerRod)

    // outer (towards rim) segment - keep aligned with the rim radial direction
    let outerRod = primitives.cylinder({ height: outerLength, radius: outerRadius, segments: 24 })
    outerRod = transforms.rotateY(-Math.PI / 2 + tilt, outerRod)
    const outerCenterX = hubRadius + innerLength + outerLength / 2
    outerRod = transforms.translate([outerCenterX, 0, 0], outerRod)
    outerRod = transforms.rotateZ(angle, outerRod)

    // small Z offset to simulate over/under lacing for visual realism
    const crossZ = (i % 2 === 0) ? 0.6 : -0.6
    outerRod = transforms.translate([0, 0, crossZ], outerRod)

    // combine tapered segments
    const spoke = union(innerRod, outerRod)
    spokes.push(spoke)

    // Add a small spherical cap at the rim end for nicer joins
    const capRadius = outerRadius * 1.6
    const outerCap = primitives.sphere({ radius: capRadius, segments: 24 })
    let outerPlaced = transforms.rotateY(tilt, outerCap)
    const outerCapX = rimHoleRadius - 1
    outerPlaced = transforms.translate([outerCapX, 0, 0], outerPlaced)
    outerPlaced = transforms.rotateZ(angle, outerPlaced)
    // apply same cross Z offset to the cap so it aligns with the spoke end
    outerPlaced = transforms.translate([0, 0, crossZ], outerPlaced)
    spokes.push(outerPlaced)

    // Add a small nipple at the rim inner surface where the spoke would attach
    const nippleRadius = outerRadius * 1.4
    const nippleLength = 1.6
    let nipple = primitives.cylinder({ height: nippleLength, radius: nippleRadius, segments: 24 })
    // orient radial along X so it sits into the rim wall
    nipple = transforms.rotateY(-Math.PI / 2, nipple)
    const nippleX = rimHoleRadius - 0.8
    nipple = transforms.translate([nippleX, 0, 0], nipple)
    nipple = transforms.rotateZ(angle, nipple)
    // apply same cross offset so nipple follows the spoke end
    nipple = transforms.translate([0, 0, crossZ], nipple)
    spokes.push(nipple)
  }

  // Optional tire around the rim for visual heft
  const tireThickness = 6
  const tireOuterRadius = rimOuterRadius + tireThickness
  const tireOuter = primitives.cylinder({ height: rimHeight, radius: tireOuterRadius, segments: 64 })
  const tireInner = primitives.cylinder({ height: rimHeight, radius: rimOuterRadius, segments: 64 })
  const tireRing = subtract(tireOuter, tireInner)

  const rimColored = colorize([0.7, 0.7, 0.75], rim)
  const hubColored = colorize([0.25, 0.25, 0.25], hubWithFlanges)
  const tireColored = colorize([0, 0, 0], tireRing)
  // combine all spoke pieces into one object and colorize as a single part to improve rendering and avoid per-spoke overhead
  const spokesUnion = union(...spokes)
  const spokesColored = colorize([0.7, 0.7, 0.75], spokesUnion)

  // Brake rotor (simple, stylized) added near the hub
  const rotorThickness = 2
  const rotorRadius = hubRadius + 12
  let rotorOuter = primitives.cylinder({ height: rotorThickness, radius: rotorRadius, segments: 64 })
  const rotorInner = primitives.cylinder({ height: rotorThickness, radius: hubRadius - 1, segments: 32 })
  let rotor = subtract(rotorOuter, rotorInner)
  // Add bolt holes on the rotor circumference
  const boltCount = 6
  const boltRadius = 0.9
  const boltDistance = rotorRadius - 2
  for (let i = 0; i < boltCount; i++) {
    const a = (i / boltCount) * Math.PI * 2
    const x = Math.cos(a) * boltDistance
    const y = Math.sin(a) * boltDistance
    const bolt = primitives.cylinder({ height: rotorThickness + 2, radius: boltRadius, segments: 32 })
    rotor = subtract(rotor, transforms.translate([x, y, 0], bolt))
  }
  const rotorColored = colorize([0.8, 0.8, 0.85], rotor)

  // Valve stem on rim (added for visual realism)
  const valveRadius = 1
  const valveLength = 14
  let valve = primitives.cylinder({ height: valveLength, radius: valveRadius, segments: 32 })
  valve = transforms.rotateY(-Math.PI / 2, valve) // orient along +X
  const valvePositionX = rimOuterRadius + valveLength / 2 - 1
  let valvePlaced = transforms.translate([valvePositionX, 0, 0], valve)
  const valveColored = colorize([0.8, 0.8, 0.8], valvePlaced)

  const wheel = union(rimColored, hubColored, axleColored, nutColored, tireColored, rotorColored, spokesColored, valveColored)
  return wheel
}

module.exports = { main }
