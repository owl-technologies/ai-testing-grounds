const { primitives, booleans, transforms } = require('@jscad/modeling')
const { cylinder } = primitives
const { subtract, union } = booleans
const { rotateX, rotateY, rotateZ, translate } = transforms

// Simple realistic bicycle wheel approximation: rim, hub, and radial spokes
const main = () => {
  // parameters (mm)
  const rimOuterRadius = 340 / 2 // ~700c wheel outer diameter ~ 700mm
  const rimInnerRadius = rimOuterRadius - 20
  const rimWidth = 20
  const rimWallThickness = 4

  const hubRadius = 18
  const hubWidth = 40

  const spokeRadius = 0.9
  const spokeCount = 32

  // Rim: a thin cylindrical ring (approximated by subtracting inner cylinder)
  const outerCyl = cylinder({ height: rimWidth, radius: rimOuterRadius, segments: 128 })
  const innerCyl = translate([0, 0, -1], cylinder({ height: rimWidth + 2, radius: rimInnerRadius, segments: 128 }))
  const rim = subtract(outerCyl, innerCyl)

  // Hub body
  const hub = cylinder({ height: hubWidth, radius: hubRadius, segments: 64 })

  // Hub flanges (slightly larger discs where spokes attach)
  const flangeThickness = 4
  const flangeRadius = hubRadius + 12
  const leftFlange = translate([0, 0, -hubWidth / 2 - flangeThickness / 2], cylinder({ height: flangeThickness, radius: flangeRadius, segments: 64 }))
  const rightFlange = translate([0, 0, hubWidth / 2 + flangeThickness / 2], cylinder({ height: flangeThickness, radius: flangeRadius, segments: 64 }))

  // Spokes: create two radial spoke sets (left and right) translated to flange planes
  const spokeLength = rimInnerRadius - flangeRadius + 0.5
  const leftSpokes = []
  const rightSpokes = []
  for (let i = 0; i < spokeCount; i++) {
    const angle = (2 * Math.PI * i) / spokeCount
    // create a spoke oriented along X, then rotate around Z
    let sL = cylinder({ height: spokeLength, radius: spokeRadius, segments: 24 })
    let sR = cylinder({ height: spokeLength, radius: spokeRadius, segments: 24 })
    sL = rotateY(Math.PI / 2, sL) // align along X axis
    sR = rotateY(Math.PI / 2, sR)
    // move so one end is near flangeRadius and the other near rim inner radius
    // keep same X translation but place each set at the flange midplanes
    sL = translate([flangeRadius + spokeLength / 2, 0, -hubWidth / 2 - flangeThickness / 2], sL)
    sR = translate([flangeRadius + spokeLength / 2, 0, hubWidth / 2 + flangeThickness / 2], sR)
    sL = rotateZ(angle, sL)
    sR = rotateZ(angle, sR)
    leftSpokes.push(sL)
    rightSpokes.push(sR)
  }

  const wheel = union(rim, hub, leftFlange, rightFlange, ...leftSpokes, ...rightSpokes)

  // center the wheel so hub center is at origin and rim sits symmetrically
  return wheel
}

module.exports = { main }

