const { cuboid, cylinder, roundedCylinder } = require('@jscad/modeling').primitives
const { union, subtract, intersect } = require('@jscad/modeling').booleans
const { translate, rotateZ } = require('@jscad/modeling').transforms

const makeTire = () => {
  const outer = roundedCylinder({ height: 9.8, radius: 22.3, roundRadius: 2.55, segments: 96 })
  const inner = cylinder({ height: 10, radius: 16.2, segments: 96 })
  return subtract(outer, inner)
}

const makeRimBarrel = () => {
  const rimOuter = cylinder({ height: 8.2, radius: 16.1, segments: 96 })
  const rimInner = cylinder({ height: 8.6, radius: 13.1, segments: 96 })
  const beadSeat = subtract(
    cylinder({ height: 8.0, radius: 15.2, segments: 96 }),
    cylinder({ height: 8.2, radius: 14.2, segments: 96 })
  )
  const lipStep = subtract(
    cylinder({ height: 1.2, radius: 15.6, segments: 96 }),
    cylinder({ height: 1.3, radius: 14.5, segments: 96 })
  )
  return union(subtract(rimOuter, rimInner), beadSeat, translate([0, 0, 2.9], lipStep))
}

const makeHub = () => {
  const hub = cylinder({ height: 7.2, radius: 5.2, segments: 64 })
  const centerBore = cylinder({ height: 10, radius: 2.1, segments: 48 })

  const boltHole = (angle) => {
    const hole = cylinder({ height: 10, radius: 0.65, segments: 32 })
    return rotateZ(angle, translate([3.8, 0, 0], hole))
  }

  const boltHoles = [0, 72, 144, 216, 288].map((d) => boltHole((d * Math.PI) / 180))
  return subtract(hub, centerBore, ...boltHoles)
}

const makeSpokes = () => {
  const oneSpokeOuter = rotateZ(0.045, translate([10.2, 0, 0], cuboid({ size: [7.0, 0.82, 2.25] })))
  const oneSpokeInner = rotateZ(-0.035, translate([6.55, 0, 0], cuboid({ size: [4.0, 1.45, 3.7] })))
  const oneSpokeCap = translate([12.95, 0, 0], cuboid({ size: [1.25, 0.72, 1.65] }))
  const hubBlend = translate([6.15, 0, -0.15], roundedCylinder({ height: 2.6, radius: 1.2, roundRadius: 0.35, segments: 48 }))
  const oneSpoke = union(oneSpokeOuter, translate([0, 0, -0.52], oneSpokeInner), oneSpokeCap, hubBlend)
  const count = 10
  const spokes = []
  for (let i = 0; i < count; i++) {
    spokes.push(rotateZ((i * Math.PI * 2) / count, oneSpoke))
  }
  return union(...spokes)
}

const makeSidewallDetails = () => {
  const base = subtract(
    cylinder({ height: 9.4, radius: 21.9, segments: 96 }),
    cylinder({ height: 9.6, radius: 17.0, segments: 96 })
  )
  const grooveRing = subtract(
    cylinder({ height: 10.2, radius: 20.7, segments: 96 }),
    cylinder({ height: 10.4, radius: 20.1, segments: 96 })
  )
  return intersect(base, grooveRing)
}

const makeTreadDetails = () => {
  const count = 24
  const grooves = []
  for (let i = 0; i < count; i++) {
    const isWide = i % 2 === 0
    const block = translate([20.9, 0, 0], cuboid({ size: [isWide ? 1.7 : 1.1, 1.0, isWide ? 10.8 : 10.4] }))
    grooves.push(rotateZ((i * Math.PI * 2) / count, block))
  }
  const channelRing = subtract(
    cylinder({ height: 1.4, radius: 21.65, segments: 96 }),
    cylinder({ height: 1.6, radius: 20.95, segments: 96 })
  )
  return subtract(cylinder({ height: 10.2, radius: 22.35, segments: 96 }), ...grooves, channelRing)
}

const main = () => {
  const tire = makeTire()
  const treadDetails = makeTreadDetails()
  const sidewallDetails = makeSidewallDetails()
  const rim = makeRimBarrel()
  const hub = makeHub()
  const spokes = makeSpokes()

  return union(intersect(tire, treadDetails), sidewallDetails, rim, hub, spokes)
}

module.exports = { main }