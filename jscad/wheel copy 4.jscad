const { primitives, transforms, booleans } = require('@jscad/modeling')
const { torus, cylinder } = primitives
const { translate, rotateX, rotateZ } = transforms
const { union, subtract } = booleans

// A simple, parametric bicycle wheel: rim (torus), hub (cylinder) and radial spokes
const rimRadius = 100
const rimTube = 6
const hubRadius = 12
const hubWidth = rimTube * 2 + 4
const axleRadius = 4
const numSpokes = 32
// increased spoke radius for more realistic appearance (was 0.8)
const spokeRadius = 1.3

const createRim = () => {
  return torus({ radius: rimRadius, tubeRadius: rimTube, segments: 128 })
}

const createHub = () => {
  return cylinder({ height: hubWidth, radius: hubRadius, segments: 64 })
}

const createSpokes = () => {
  const spokes = []
  // spokes are thin cylinders laid out radially in the wheel plane
  // shorten spokes so they terminate at the inner rim surface
  // reduced the extra offset slightly so spoke ends are closer to flush with hub/rim
  const spokeLength = rimRadius - rimTube - hubRadius + 0.3
  for (let i = 0; i < numSpokes; i++) {
    const angle = (i / numSpokes) * Math.PI * 2
    // create a rod along X (cylinder axis along Z by default, rotateX to align to X)
    let rod = cylinder({ height: spokeLength, radius: spokeRadius, segments: 16 })
    rod = rotateX(Math.PI / 2, rod)
    // push the rod outward so it spans from near the hub to near the rim
    // nudge the spoke slightly inward so the ends sit flush with the rim/hub
    rod = translate([hubRadius + spokeLength / 2 - 0.5, 0, 0], rod)
    // rotate into the correct radial position
    rod = rotateZ(angle, rod)
    spokes.push(rod)
  }
  return union(...spokes)
}

function main() {
  const rim = createRim()
  const hub = createHub()
  const spokes = createSpokes()

  // combine parts and subtract axle hole
  const wheel = union(rim, hub, spokes)
  const axleHole = cylinder({ height: hubWidth + 4, radius: axleRadius, segments: 32 })
  const wheelWithHole = subtract(wheel, axleHole)

  return wheelWithHole
}

module.exports = { main }
