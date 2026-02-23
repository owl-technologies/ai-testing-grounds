// Hub at the wheel center
const hubDiameter = 10;
const wheelThickness = 5;
const hubHeight = 2;
const hub = roundedCuboid({ size: [hubDiameter, hubDiameter, wheelThickness + hubHeight], roundRadius: hubDiameter / 2 });
const hubPlaced = translate([ -hubDiameter / 2, -hubDiameter / 2, wheelThickness ], hub);

// Rim
const rimRadius = 15;
const rimHeight = 3;
const rim = extrudeLinear({ height: rimHeight }, roundedRectangle({ size: [rimRadius * 2, rimRadius * 2], roundRadius: rimRadius }));

// Tire
const tireThickness = 1;
const spokeCount = 30;
const spokeAngle = 360 / spokesCount;
const tireRadius = rimRadius + spokeCount * (spokeLength + tireThickness);
const tire = cylinder({ height: hubHeight, insideRadius: rimRadius, outsideRadius: tireRadius });

// Spoke
const spokeLength = 5;
const spokeWidth = 1;
const spokeAngle = 360 / spokesCount;
const spokeStart = -(spokeCount / 2) * spokeAngle;

const spoke = cylinder({ height: spokeLength, insideRadius: rimRadius, outsideRadius: rimRadius + spokeWidth });
const spokeRotated = rotateY(degToRad(spokeStart))(spoke);

// Assemble wheel (rim + hub + tire + spokes)
const wheel = union(union(rim, hubPlaced), tire);
for (let i = 0; i < spokeCount; i++) {
  wheel = union(wheel, spokeRotated);
  wheel = translate([rimRadius * Math.cos(degToRad(i * spokeAngle)), rimRadius * Math.sin(degToRad(i * spokeAngle), 0], spokeRotated);
}
return wheel;

module.exports = { main }