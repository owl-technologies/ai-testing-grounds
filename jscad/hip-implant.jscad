const jscad = require('@jscad/modeling')
const { colorize, hslToRgb, colorNameToRgb } = jscad.colors
const { translate, rotateY, rotateX, rotateZ, translateX, translateZ} = jscad.transforms
const { union, intersect, difference, subtract } = jscad.booleans
const { hull, hullChain } = jscad.hulls
const { cylinder, cylinderElliptic, roundedCylinder, sphere, arc, polygon, line, cube, cuboid, torus, roundedCuboid } = jscad.primitives
const { degToRad, radToDeg } = jscad.utils

// Declare a function named "getParameterDefinitions". It will return an array of parameter definitions.
// The parameter values are passed into the main method as an object.
const getParameterDefinitions = () => {
  return [

    { name: 'group3', type: 'group', caption: 'Group 1: Top' },
    { name: 's3l4', type: 'number', initial: 70.0, min: 1.0, max: 199.0, step: 1, caption: 'Head horizontal distance from femur:' },
    { name: 's3angle', type: 'number', initial: 55.0, min: 0, max: 90.0, step: 1, caption: 'Neck shaft angle in degrees:' },
    { name: 's3rh', type: 'number', initial: 20.0, min: 1.0, max: 70.0, step: 1, caption: 'Head Radius:' },
    { name: 's3rn', type: 'number', initial: 8.0, min: 1.0, max: 60.0, step: 1, caption: 'Neck Radius:' },
    
    { name: 'group2', type: 'group', caption: 'Group 2: Middle' },
    { name: 's2l2', type: 'number', initial: 50.0, min: 0, max: 200.0, step: 1, caption: 'L2 - mid segment lower part:' },
    { name: 's2l3', type: 'number', initial: 50.0, min: 0, max: 200.0, step: 1, caption: 'L3 - mid segment top part:' },
    { name: 'R', type: 'number', initial: 80.0, min: 20, max: 200.0, step: 1, caption: 'R - Radius of medial curvature:' },

    { name: 'group1', type: 'group', caption: 'Group 3: Bottom' },
    { name: 's1r1', type: 'number', initial: 10, min: 0, max: 200.0, step: 1, caption: 'R1 - bottom radius in trabaculae:' },
    { name: 's1r2', type: 'number', initial: 15, min: 0, max: 200.0, step: 1, caption: 'R2 lower segment radius in femur:' },
    { name: 's1l1', type: 'number', initial: 70.0, min: 0, max: 200.0, step: 1, caption: 'L1 - lower segment length :' },
  ]
}

// G. Saravana-Kumar et all, "Patient specific parametric geo- metric modelling of cementless hip prosthesis"
const main = (params) => {
  
  // Create color using: hue, saturation, lightness, transparency.
  let transpBlue  =  hslToRgb(240/360, 1, 0.5, 0.7) // To go from RGB use https://www.rapidtables.com/convert/color/rgb-to-hsl.html
  let transpRed  =  hslToRgb(0, 1, 0.5, 0.5) // To go from RGB use https://www.rapidtables.com/convert/color/rgb-to-hsl.html
  // ------------------------ Segment 1 (see Figure 4) Between section 1 and 2
  let segment1  = cylinderElliptic({
    center: [0,0,-params.s1l1+(params.s1l1/2)-params.s2l2],
    height: params.s1l1, 
    startRadius: [params.s1r1, params.s1r1], 
    endRadius: [params.s1r2, params.s1r2],
    segments: 60
  }) 

  // ------------------------ Segment 2 (see Figure 4) Between section 2 and 3
  let s2height = params.s2l2+params.s2l3
  let s2depth = params.s1r2*2
  let s2width = 100
  let segment2 = cuboid({
    size: [s2width, s2depth, s2height], 
    center:[s2width/2-params.s1r2,0,-s2height/2+params.s2l3]
  })

  // ------------------------ Segment 3 (see Figure 4) Above section 3
  let neckLength = params.s3l4/Math.sin(degToRad(params.s3angle)) //distance from point O to point C, see figure 4
  let headHeight = Math.sqrt(neckLength**2-params.s3l4**2) // y-axis height over point O, see figure 4
  let head = colorize(transpBlue,sphere({radius: params.s3rh, center: [params.s3l4,0,headHeight],segments: 40}))
  let neck = roundedCylinder({
    radius: params.s3rn, 
    height: neckLength, 
    roundRadius:params.s3rn -0.1 
  })
  neck = rotateY(degToRad(params.s3angle), neck)
  neck = translate([params.s3l4/2, 0, headHeight/2], neck)
  let segment3 = [neck, head]

  // ------------------------ Bevel with radius
  let cut1 = cylinder({radius: params.R+params.s1r2, height:params.s1r2*2})
  let tor = torus({ innerRadius: params.s1r2, outerRadius: params.R+params.s1r2, innerSegments: 40, outerSegments: 60 })
  cut1 = subtract(cut1, tor)
  cut1 = rotateX(degToRad(90),cut1)
  cut1 = colorize(transpRed,cut1)
  let beta = degToRad(180-90-params.s3angle)// top bevel intersection point, is neck mid offset by section 2 radius in the direction perpendicular to the neck
  let p1off = [params.s1r2*Math.cos(beta), params.s1r2*Math.sin(beta) ]
  let p1 = [params.s3l4/2+p1off[0], headHeight/2-p1off[1]] // medial curvature by fitting the torus edge through points p1 and p2
  let pointP1 = cuboid({ size: [1, 100, 1], center:[p1[0], 0,p1[1]]})
  let p2 = [params.s1r2, -params.s2l2]
  let pointP2 = cuboid({ size: [1, 100, 1], center:[p2[0], 0, p2[1]]})
  let [cx, cy] = medialCurvCenter(p1,p2,params.R)
  cut1 = translate([cx,0,cy],cut1)
  segment2 = subtract(segment2, cut1)

  // ------------------------ Straight bevel
  let offset = 40
  let sBevel = cuboid({
    size: [params.s1r2+offset, s2depth, s2height*3], 
    center:[-params.s1r2/2-(offset/2),0,0]
  })
  let cyl = cylinder({
    radius: params.s1r2, 
    height: s2height*3, 
    center: [0,0,0],
    segments: 60
  })
  sBevel = subtract(sBevel, cyl)

  // ------------------------ Bevel left side of segment2. Top must intersect femoral axis
  let alpha = Math.atan((params.s2l2+params.s2l3)/params.s1r2)
  //console.log('alpha:' + radToDeg(alpha));
  let cut2 = rotateY(degToRad(90)-alpha,sBevel)
  cut2 = translate([0,0,-params.s2l2], cut2)
  segment2 = subtract(segment2,cut2)

  // ------------------------ Bevel top side of segment2
  let cut3 = rotateY(degToRad(90),sBevel)
  cut3 = translate([0,0,params.s2l3-params.s1r2], cut3)
  segment2 = subtract(segment2,cut3)

  // ------------------------ Bevel right side of segment2
  let cut4 = rotateY(degToRad(90+params.s3angle),sBevel)
  cut4 = translate([params.s3l4/2+offset-params.s1r2,0,0], cut4)
  segment2 = subtract(segment2,cut4)

  // ------------------------ Build implant
  let implant = union(segment1, segment2, segment3) // the end assembly 
  let cuts = colorize(transpRed,[pointP1, pointP2, cut1])

  // ------------------------ Move and position
  implant =rotateZ(degToRad(90),rotateX(degToRad(90),implant))
  return [implant]
}

/**
 * Calculates the center for medial curvature, see section 3.2, Femoral feature extraction
 * G. Saravana-Kumar et all, "Patient specific parametric geo- metric modelling of cementless hip prosthesis"
 * 
 * @param a - section 3 lowest point as xy vector (see figure 4)
 * @param b - section 2 right end as xy vector (see figure 4)
 * @param r - desired medial curve radius, must be big enough to reach a and b (see figure 3)
 * 
 * @returns [cx, cy] - center of medial curvature
 */
const medialCurvCenter = (a,b,r) => {
  let mV = a.map((e,i)=>(e-b[i])/2+b[i])
  let dV = a.map((e,i)=>e-mV[i])
  let d = Math.sqrt(dV[0]**2+dV[1]**2)
  let h = Math.sqrt((r**2 - d**2))
  let alpha = -Math.atan( (a[0]-b[0]) / (a[1]-b[1]) )
  let cx = h*Math.cos(alpha)+mV[0]
  let cy = h*Math.sin(alpha)+mV[1]
  return [cx, cy]
}

// You must also export the getParameterDefinitions method.
module.exports = { main, getParameterDefinitions }
