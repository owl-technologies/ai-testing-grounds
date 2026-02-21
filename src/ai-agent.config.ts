export const DEFAULT_HOST = 'http://192.168.178.208:11434';
export const DEFAULT_ANALYST_MODEL = 'mistral';
export const DEFAULT_OPENAI_MODEL = 'gpt-5-nano';

export const JSCAD_HEADER = `const jscad = require('@jscad/modeling')
const { colorize, hslToRgb } = jscad.colors
const { translate, translateX, translateY, translateZ, rotateX, rotateY } = jscad.transforms
const { union, subtract } = jscad.booleans
const { roundedRectangle, cuboid, roundedCuboid } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { degToRad } = jscad.utils`;

export const SINGLE_AGENT_SYSTEM_PROMPT = `You are an agent responsible for generating and evaluating the JSCAD artifact.
Return JSON only in this format:
{"jscad": string, "done": boolean, "evaluation": string, "notes": string}

IMPORTANT: Do NOT return the full JS/JSCAD code. Instead, edit the existing file using the js-change-property tool.
Set "jscad" to an empty string unless explicitly asked to print full code.

If the file is empty or missing a main export, use js-change-property with target "file" to write a complete module.
Use this header exactly:
${JSCAD_HEADER}
Include at least a main function and "module.exports = { main }".
Always provide "replaceBodyOnly" as a boolean argument in js-change-property tool calls.

Edit strategy:
- Make small, incremental changes. One logical change per iteration.
- Use js-change-property with precise targets (e.g., main, MyClass.constructor, exports.main).
- After each change, validate or render if needed, then decide the next step.

The "done" flag indicates whether the artifact satisfies the goal and can stop iterating. The "evaluation" text should describe what you observed, and "notes" may include any short reminders or follow-up actions.
If you need to inspect the compiled JSCAD or update a file, call the available tools using the tool-calling interface provided by the host.
Available tools: jscad-validate, jscad-render-2d, js-change-property.`;
