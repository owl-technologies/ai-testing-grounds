import { colors } from 'kiss-framework';
import { Ollama } from 'ollama';
import {
  formContent,
  OLLAMA_HOST,
  SingleAgentStepOptions,
  SingleAgentStepResult,
  SYSTEM_PROMPT,
  ToolCall,
} from '../config';
import { executeAgentTool, getAgentToolSchemas, isAgentTool } from '../tools';

type OllamaChatMessage = {
  role?: string;
  content?: string;
  tool_calls?: ToolCall[];
};

const DEFAULT_MODEL = 'adelnazmy2002/Qwen3-VL-4B-Instruct:Q4_K_M'
// 'adelnazmy2002/Qwen3-VL-8B-Instruct'
// 'qwen3-vl:8b'
// 'mistral:latest'; 
// 'qwen2.5-coder:latest';

export class JscadEditorAgent {

  async runAgent(input: SingleAgentStepOptions): Promise<SingleAgentStepResult> {
    const model = DEFAULT_MODEL;
    const contextLine = input.context ? input.context : '';
    const userContent = formContent({
      goal: input.goal,
      contextLine,
      outputPath: input.outputPath,
      iteration: input.iteration,
      maxIterations: input.maxIterations,
      currentCode: input.currentCode,
    });
    const ollama = new Ollama({ host: OLLAMA_HOST });
    const tools = getAgentToolSchemas();
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ];
    console.debug(`Sending to ollama. 
      model: ${model},
      message-goal: ${input.goal},
      message-roles: ${colors.green(messages.map((m) => m.role).join(', '))},
      tool-names: ${colors.green(tools.map((t) => t.function.name).join(', '))},
      `);
    const response = await ollama.chat({
      model,
      messages,
      tools,
      stream: false,
      keep_alive: -1,
    });

    const firstMessage = response.message as OllamaChatMessage | undefined;
    const { content, ...rest } = firstMessage || {};
    console.debug('response.message from Ollama:', colors.yellow(JSON.stringify(firstMessage, null, 2)));
    const prettyContent = firstMessage?.content
      ? firstMessage.content.replace(/\\n/g, '\n').replace(/\\"/g, '"')
      : undefined;
    if (prettyContent) {
      console.debug('response.message.content (pretty):', colors.yellow(prettyContent));
    }
    let toolOutput: string | undefined;
    let toolError: string | undefined;

    const toolCalls = this.extractToolCallsFromMessage(firstMessage);

    console.debug('Extracted tool calls:', toolCalls?.length? colors.blue(JSON.stringify(toolCalls, null, 2)): colors.red('None'));
    const toolCall = toolCalls?.[0];
    if (toolCall) {
      const normalized = this.normalizeToolCall(toolCall);
      if (normalized.toolError) {
        toolError = normalized.toolError;
      } else if (normalized.toolName) {
        toolOutput = await executeAgentTool(
          normalized.toolName,
          normalized.args || {}
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
      console.debug(`Sending to ollama. Tool output: ${colors.cyan(toolOutput)}`);
      const followUp = await ollama.chat({
        model,
        messages,
        tools,
        stream: false,
        keep_alive: -1,
      });
      const followUpMessage = followUp.message as OllamaChatMessage | undefined;
      const { content: followUpContent } = followUpMessage || {};
      console.debug('followUp.message from Ollama:', colors.yellow(JSON.stringify(followUpMessage, null, 2)));
      const prettyFollowUp = followUpContent
        ? followUpContent.replace(/\\n/g, '\n').replace(/\\"/g, '"')
        : undefined;
      if (prettyFollowUp) {
        console.debug('followUp.message.content (pretty):', colors.yellow(prettyFollowUp));
      }
      raw = followUp.message?.content?.trim() || '';
      parsed = this.extractAgentJson(raw);
    }

    const jscad = parsed?.jscad?.trim() || '';
    const baseNotes = parsed?.notes?.trim() || '';
    const notes = baseNotes;
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

  private extractToolCallsFromMessage(message: OllamaChatMessage | undefined): ToolCall[] | undefined {
    if (message?.tool_calls && message.tool_calls.length) {
      return message.tool_calls;
    }
    const text = message?.content;
    if (!text) {
      return undefined;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(trimmed);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const calls: ToolCall[] = [];
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        const candidate = entry as { name?: unknown; arguments?: unknown };
        const { name } = candidate;
        if (typeof name !== 'string') {
          continue;
        }
        const args = candidate.arguments;
        const normalizedArgs = args && typeof args === 'object' ? (args as Record<string, unknown>) : {};
        calls.push({ function: { name, arguments: normalizedArgs } });
      }
      return calls.length ? calls : undefined;
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

}
