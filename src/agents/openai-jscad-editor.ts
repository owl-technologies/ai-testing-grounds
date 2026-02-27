import { Agent, run, tool, type AgentInputItem } from '@openai/agents';
import { assert, colors } from 'kiss-framework';
import { z } from 'zod';

import { executeAgentTool, getAgentToolSchemas } from '../tools/tool-index';
import { formContent, SingleAgentStepOptions, SingleAgentStepResult, SYSTEM_PROMPT } from '../config';
import { log as baseLog } from '../logger';

const DEFAULT_MODEL = 
// 'gpt-5-mini';
//'gpt-5.1-codex-mini';
'gpt-5.3-codex';
const LOG_AGENT = `openai.${DEFAULT_MODEL}`;
const log = (...args: any[]) => baseLog(LOG_AGENT, ...args);

type ToolState = {
  toolOutput?: string;
  toolError?: string;
  toolImages?: string[];
};

export class OpenAiJSCADEditor {
  async runAgent(input: SingleAgentStepOptions): Promise<SingleAgentStepResult> {
    let toolState: ToolState = {};
    const toolSchemas = getAgentToolSchemas();
    const tools = toolSchemas.map((descriptor) => {
      const toolName = descriptor.function.name!;
      const parametersDef = descriptor.function.parameters;
      const required = new Set(parametersDef?.required || []);
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [name, definition] of Object.entries(parametersDef?.properties || {})) {
        let schema: z.ZodTypeAny;
        switch (definition.type) {
          case 'string':
            schema = z.string();
            break;
          case 'boolean':
            schema = z.boolean();
            break;
          case 'number':
            schema = z.number();
            break;
          default:
            schema = z.unknown();
            break;
        }
        if (definition.description) {
          schema = schema.describe(definition.description);
        }
        shape[name] = required.has(name) ? schema : schema.optional();
      }
      const parametersSchema = z.object(shape);

      return tool({
        name: toolName,
        description: descriptor.function.description!,
        parameters: parametersSchema,
        strict: true,
        execute: async (toolInput) => {
          if (!toolInput || typeof toolInput !== 'object') {
            const message = 'Tool arguments must be an object.';
            const output = JSON.stringify({ ok: false, error: message });
            toolState.toolError = message;
            toolState.toolOutput = output;
            console.debug('OpenAI tool call error:', colors.red(message));
            await log('tool.error', message);
            return output;
          }
          try {
            console.debug(
              `OpenAI tool call: ${colors.blue(toolName)} args: ${colors.yellow(JSON.stringify(toolInput, null, 2))}`
            );
            await log('tool.call', { name: toolName, args: toolInput });
            const output = await executeAgentTool(toolName, toolInput as Record<string, unknown>);
            toolState.toolOutput = output.response;
            toolState.toolImages = output.images;
            await log('tool.response', output);
            if (output.images && output.images.length > 0) {
              const items: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [];
              if (output.response) {
                items.push({ type: 'text', text: output.response });
              }
              for (const image of output.images) {
                items.push({ type: 'image', image });
              }
              return items;
            }
            return output.response;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const output = JSON.stringify({ ok: false, error: message });
            toolState.toolError = message;
            toolState.toolOutput = output;
            console.debug('OpenAI tool execution error:', colors.red(message));
            await log('tool.error', message);
            return output;
          }
        },
      });
    });

    const agent = new Agent({
      name: 'JSCAD agent',
      instructions: SYSTEM_PROMPT,
      tools,
      model: DEFAULT_MODEL,
    });

    const agentUser = formContent({
      goal: input.goal,
      contextLine: input.context ? input.context : '',
      outputPath: input.outputPath,
      iteration: input.iteration,
      maxIterations: input.maxIterations,
      currentCode: input.currentCode,
    });

    console.debug(`Sending to OpenAI Agents.
      model: ${DEFAULT_MODEL},
      message-goal: ${input.goal},
      message-roles: ${colors.green('system, user')},
      tool-names: ${colors.green(toolSchemas.map((t) => t.function.name).join(', '))},
      `);

    let runInput: string | AgentInputItem[] = agentUser;
    // const inlineImageBase64 = input.renderPngBase64;
    // if (inlineImageBase64 && inlineImageBase64.trim()) {
    //   let imageData = inlineImageBase64.trim();
    //   const base64Marker = 'base64,';
    //   if (imageData.startsWith('data:') && imageData.includes(base64Marker)) {
    //     imageData = imageData.slice(imageData.indexOf(base64Marker) + base64Marker.length);
    //   }
    //   if (!imageData.startsWith('data:')) {
    //     imageData = `data:image/png;base64,${imageData}`;
    //   }
    //   console.debug(`OpenAI input image attached (${Math.round(imageData.length / 1024)} KB).`);
    //   runInput = [
    //     {
    //       role: 'user',
    //       content: [
    //         { type: 'input_text', text: agentUser },
    //         { type: 'input_image', image: imageData },
    //       ],
    //     },
    //   ];
    // }

    await log('openai.run request', { model: DEFAULT_MODEL, input: runInput, tools: toolSchemas });
    const result = await run(agent, runInput);
    await log('openai.run response', result);

    const finalOutput = result.finalOutput;
    // console.debug('OpenAI finalOutput:', colors.yellow(JSON.stringify(finalOutput, null, 2)));
    // if (typeof finalOutput === 'string') {
    //   const prettyOutput = finalOutput.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    //   console.debug('OpenAI finalOutput (pretty):', colors.yellow(prettyOutput));
    // }

    const raw = (() => {
      if (typeof result.finalOutput === 'string') {
        return result.finalOutput.trim();
      }
      if (result.finalOutput === null || result.finalOutput === undefined) {
        return '';
      }
      try {
        return JSON.stringify(result.finalOutput);
      } catch {
        return String(result.finalOutput);
      }
    })();

    let parsed: { jscad?: string; done?: boolean; evaluation?: string; notes?: string } | undefined;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const candidate = JSON.parse(raw.slice(start, end + 1));
        if (typeof candidate === 'object' && candidate) {
          parsed = candidate;
        }
      } catch {
        // intentionally ignore malformed JSON
      }
    }
    
    const notes = parsed?.notes?.trim() || '';

    return {
      done: parsed?.done ?? false,
      evaluation: parsed?.evaluation?.trim() || '',
      notes,
      raw,
      toolOutput: toolState.toolOutput,
      toolError: toolState.toolError,
    };
  }
}
