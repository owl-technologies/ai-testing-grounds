const jscad = require('@jscad/modeling')
const { colorize } = jscad.colors
const { union, subtract } = jscad.booleans

function main () {
  // Minimal initial wheel placeholder: a simple hollow disk using cylinders
  // Outer rim as a cylinder
  const rimOuterRadius = 60
  const rimHeight = 6
  const rimOuter = jscad.primitives.cylinder({ height: rimHeight, radius: rimOuterRadius, segments: 64 })
  // Inner hole to create hollow rim
  const rimHoleRadius = 40
  const rimHole = jscad.primitives.cylinder({ height: rimHeight, radius: rimHoleRadius, segments: 64 })
  let rim = subtract(rimOuter, rimHole)

  // Create spoke holes in the rim so spokes appear to connect realistically
  const spokeCount = 32
  const spokeRadius = 0.9
  const rimSpokeHoleRadius = spokeRadius * 1.4
  const rimSpokeHoleLength = rimHeight + 4
  const rimSpokeHoles = []
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2
    let hole = jscad.primitives.cylinder({ height: rimSpokeHoleLength, radius: rimSpokeHoleRadius, segments: 24 })
    // align hole along radial direction (X axis) and place at inner rim surface
    hole = jscad.transforms.rotateY(-Math.PI / 2, hole)
    const holeX = rimHoleRadius - 1
    hole = jscad.transforms.translate([holeX, 0, 0], hole)
    hole = jscad.transforms.rotateZ(angle, hole)
    rimSpokeHoles.push(hole)
  }
  // Subtract the spoke holes from the rim
  rim = subtract(rim, ...rimSpokeHoles)

  // Simple hollow hub at center
  const hubRadius = 6
  const hubHeight = 8
  // Create hollow hub by subtracting a bore from the outer hub
  const hubOuter = jscad.primitives.cylinder({ height: hubHeight, radius: hubRadius, segments: 32 })
  const hubBoreRadius = 2
  const hubBore = jscad.primitives.cylinder({ height: hubHeight + 2, radius: hubBoreRadius, segments: 32 })
  const hub = subtract(hubOuter, hubBore)

  // Add hub flanges for visual realism
  const flangeRadius = hubRadius + 2
  const flangeHeight = 1.5
  const flangeLeft = jscad.primitives.cylinder({ height: flangeHeight, radius: flangeRadius, segments: 32 })
  const flangeRight = jscad.primitives.cylinder({ height: flangeHeight, radius: flangeRadius, segments: 32 })
  const hubFlangeLeft = jscad.transforms.translate([0, 0, -hubHeight / 2], flangeLeft)
  const hubFlangeRight = jscad.transforms.translate([0, 0, hubHeight / 2], flangeRight)
  const hubWithFlanges = union(hub, hubFlangeLeft, hubFlangeRight)

  // Add a simple axle through the hub for realism
  const axleRadius = 1.6
  const axleLength = hubHeight + 30
  // Axle is aligned with the wheel axis (Z), longer than the hub so it protrudes
  const axle = jscad.primitives.cylinder({ height: axleLength, radius: axleRadius, segments: 32 })
  const axlePlaced = jscad.transforms.translate([0, 0, 0], axle)
  const axleColored = colorize([0.2, 0.2, 0.25], axlePlaced)

  // Assemble spokes: switched from cuboids to rounded rods for a smoother look
  // Use the rim hole radius to determine spoke length so spokes meet the inner rim surface
  const spokeLength = rimHoleRadius - hubRadius - 1
  const spokes = []
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2
    // create a rod along X by making a cylinder and rotating it to align with the X axis
    let rod = jscad.primitives.cylinder({ height: spokeLength, radius: spokeRadius, segments: 24 })
    rod = jscad.transforms.rotateY(-Math.PI / 2, rod)
    // position so inner end starts at the hub radius
    const spokeCenterX = hubRadius + spokeLength / 2
    const positionedRod = jscad.transforms.translate([spokeCenterX, 0, 0], rod)
    // compute tilt so the inner end reaches the flange Z position (alternate left/right flange)
    const flangeZ = (i % 2 === 0) ? -hubHeight / 2 : hubHeight / 2
    // tilt based on geometry: inner end (at -spokeLength/2) will have z = -sin(tilt)*spokeLength/2
    let tiltArg = (-2 * flangeZ) / spokeLength
    if (tiltArg > 0.9) tiltArg = 0.9
    if (tiltArg < -0.9) tiltArg = -0.9
    const tilt = Math.asin(tiltArg)
    const tilted = jscad.transforms.rotateY(tilt, positionedRod)
    const s = jscad.transforms.rotateZ(angle, tilted)
    spokes.push(s)

    // Add small end caps (spherical) at both ends of each spoke for nicer joins
    const capRadius = spokeRadius * 1.6
    const innerCap = jscad.primitives.sphere({ radius: capRadius, segments: 24 })
    const outerCap = jscad.primitives.sphere({ radius: capRadius, segments: 24 })
    const innerCapX = hubRadius + 1
    const outerCapX = rimHoleRadius - 1
    // apply same tilt and rotation so caps align with the rod
    let innerPlaced = jscad.transforms.translate([innerCapX, 0, 0], innerCap)
    innerPlaced = jscad.transforms.rotateY(tilt, innerPlaced)
    innerPlaced = jscad.transforms.rotateZ(angle, innerPlaced)
    let outerPlaced = jscad.transforms.translate([outerCapX, 0, 0], outerCap)
    outerPlaced = jscad.transforms.rotateY(tilt, outerPlaced)
    outerPlaced = jscad.transforms.rotateZ(angle, outerPlaced)
    spokes.push(innerPlaced)
    spokes.push(outerPlaced)
  }

  // Optional tire around the rim for visual heft
  const tireThickness = 6
  const tireOuterRadius = rimOuterRadius + tireThickness
  const tireOuter = jscad.primitives.cylinder({ height: rimHeight, radius: tireOuterRadius, segments: 64 })
  const tireInner = jscad.primitives.cylinder({ height: rimHeight, radius: rimOuterRadius, segments: 64 })
  const tireRing = subtract(tireOuter, tireInner)

  const rimColored = colorize([0.7, 0.7, 0.75], rim)
  const hubColored = colorize([0.25, 0.25, 0.25], hubWithFlanges)
  const tireColored = colorize([0, 0, 0], tireRing)
  const spokesColored = spokes.map(s => colorize([0.7, 0.7, 0.75], s))

  // Brake rotor (simple, stylized) added near the hub
  const rotorThickness = 2
  const rotorRadius = hubRadius + 12
  let rotorOuter = jscad.primitives.cylinder({ height: rotorThickness, radius: rotorRadius, segments: 64 })
  const rotorInner = jscad.primitives.cylinder({ height: rotorThickness, radius: hubRadius - 1, segments: 32 })
  let rotor = subtract(rotorOuter, rotorInner)
  // Add bolt holes on the rotor circumference
  const boltCount = 6
  const boltRadius = 0.9
  const boltDistance = rotorRadius - 2
  for (let i = 0; i < boltCount; i++) {
    const a = (i / boltCount) * Math.PI * 2
    const x = Math.cos(a) * boltDistance
    const y = Math.sin(a) * boltDistance
    const bolt = jscad.primitives.cylinder({ height: rotorThickness + 2, radius: boltRadius, segments: 32 })
    rotor = subtract(rotor, jscad.transforms.translate([x, y, 0], bolt))
  }
  const rotorColored = colorize([0.8, 0.8, 0.85], rotor)

  // Valve stem on rim (added for visual realism)
  const valveRadius = 1
  const valveLength = 14
  let valve = jscad.primitives.cylinder({ height: valveLength, radius: valveRadius, segments: 32 })
  valve = jscad.transforms.rotateY(-Math.PI / 2, valve) // orient along +X
  const valvePositionX = rimOuterRadius + valveLength / 2 - 1
  let valvePlaced = jscad.transforms.translate([valvePositionX, 0, 0], valve)
  const valveColored = colorize([0.8, 0.8, 0.8], valvePlaced)

  const wheel = union(rimColored, hubColored, axleColored, tireColored, rotorColored, ...spokesColored, valveColored)
  return wheel
}

module.exports = { main }
