import { Ollama } from 'ollama';
import {
  DEFAULT_ANALYST_MODEL,
  DEFAULT_HOST,
  SINGLE_AGENT_SYSTEM_PROMPT,
} from './ai-agent.config';
import { writeRenderOutput } from './tools/ai-agent/jscad-render-2d';
import { compileJscad } from './tools/ai-agent/jscad-validate';
import { executeAgentTool, getAgentToolSchemas, isAgentTool } from './tools/ai-agent/registry';
import type { ToolExecutionContext } from './tools/ai-agent/types';

export type SingleAgentStepOptions = {
  goal: string;
  context?: string;
  renderPngBase64?: string;
  model?: string;
  host?: string;
  outputPath: string;
  currentCode: string;
  iteration: number;
  maxIterations: number;
  allowFullCode?: boolean;
};

type ToolCall = {
  function?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
};

export type SingleAgentStepResult = {
  jscad: string;
  done: boolean;
  evaluation: string;
  notes: string;
  raw: string;
  toolOutput?: string;
  toolError?: string;
};

const GOAL_PREFIX = 'Goal: ';
const CONTEXT_PREFIX = 'Context: ';

export class AiAgentService {
  private lastOutputPath = '';

  async runAgent(input: SingleAgentStepOptions): Promise<SingleAgentStepResult> {
    this.lastOutputPath = input.outputPath;
    const host = input.host || DEFAULT_HOST;
    const model = input.model || DEFAULT_ANALYST_MODEL;
    const contextLine = input.context ? `${CONTEXT_PREFIX}${input.context}\n` : '';
    const renderLine = input.renderPngBase64 ? 'Render image supplied for visual reference.' : 'No render provided.';
    const agentUser = `${GOAL_PREFIX}${input.goal}
${contextLine}Editing file: ${input.outputPath}
Iteration: ${input.iteration}/${input.maxIterations}
${renderLine}
Current code:
${input.currentCode}`;
    const ollama = new Ollama({ host });
    const tools = getAgentToolSchemas();
    const messages = [
      { role: 'system', content: SINGLE_AGENT_SYSTEM_PROMPT },
      { role: 'user', content: agentUser, images: this.normalizeRenderImage(input.renderPngBase64) },
    ];
    const response = await ollama.chat({
      model,
      messages,
      tools,
      stream: false,
      keep_alive: -1,
    });

    const firstMessage = response.message;
    let toolOutput: string | undefined;
    let toolError: string | undefined;

    if (firstMessage?.tool_calls?.length) {
      const toolCall = firstMessage.tool_calls[0] as ToolCall;
      const normalized = this.normalizeToolCall(toolCall);
      if (normalized.toolError) {
        toolError = normalized.toolError;
      } else if (normalized.toolName) {
        toolOutput = await executeAgentTool(
          normalized.toolName,
          normalized.args || {},
          this.getToolExecutionContext()
        );
        messages.push(firstMessage as { role: string; content: string; tool_calls?: ToolCall[] });
        messages.push({
          role: 'tool',
          tool_name: normalized.toolName,
          content: toolOutput,
        } as { role: string; content: string; tool_name: string });
      }
    }

    let raw = firstMessage?.content?.trim() || '';
    let parsed = this.extractAgentJson(raw);

    if (toolOutput) {
      const followUp = await ollama.chat({
        model,
        messages,
        tools,
        stream: false,
        keep_alive: -1,
      });
      raw = followUp.message?.content?.trim() || '';
      parsed = this.extractAgentJson(raw);
    }

    const parsedJscad = parsed?.jscad?.trim() || '';
    const allowFullCode = input.allowFullCode === true;
    const jscad = allowFullCode && parsedJscad ? parsedJscad : input.currentCode;
    const baseNotes = parsed?.notes?.trim() || '';
    const notes = !allowFullCode && parsedJscad
      ? [baseNotes, 'Inline JSCAD ignored; use js-change-property tool.'].filter(Boolean).join(' ')
      : baseNotes;
    return {
      jscad,
      done: parsed?.done ?? false,
      evaluation: parsed?.evaluation?.trim() || '',
      notes,
      raw,
      toolOutput,
      toolError,
    };
  }

  private normalizeRenderImage(render?: string): string[] | undefined {
    if (!render) {
      return undefined;
    }
    const base64 = render.startsWith('data:') ? render.split(',')[1] || '' : render;
    return base64 ? [base64] : undefined;
  }

  private extractAgentJson(raw: string): { jscad?: string; done?: boolean; evaluation?: string; notes?: string } | undefined {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      return typeof parsed === 'object' && parsed ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private normalizeToolCall(toolCall: ToolCall | null | undefined): { toolName?: string; args?: Record<string, unknown>; toolError?: string } {
    const toolName = toolCall?.function?.name;
    if (!toolName) {
      return { toolError: 'Tool call missing function name.' };
    }
    if (!isAgentTool(toolName)) {
      return { toolError: `Unknown tool call: ${toolName}` };
    }
    const rawArgs = toolCall?.function?.arguments;
    if (rawArgs && typeof rawArgs !== 'object') {
      return { toolError: 'Tool arguments must be an object.' };
    }
    const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>;
    return { toolName, args };
  }

  private getToolExecutionContext(): ToolExecutionContext {
    return {
      compileJscad: (source: string) => compileJscad(source),
      writeRenderOutput: (writeFile: (outputPath: string) => void) => writeRenderOutput(writeFile, this.lastOutputPath),
    };
  }


}
