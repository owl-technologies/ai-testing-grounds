/// <reference path="./types/jscad-json-serializer.d.ts" />
import fs from 'fs';
import { colors } from 'kiss-framework';
import path from 'path';
import { AiAgentService } from './ai-agent';
import { OpenAiAgentService } from './openai-agent';
import { DEFAULT_ANALYST_MODEL, JSCAD_HEADER } from './ai-agent.config';

const samplesDirectory = path.resolve(__dirname, '../jscad');

const usageText = `Usage: npm run cli -- [options]

Options:
  --goal <text>               (required) prompt describing the desired artifact
  --jscad <path>              path to a JSCAD file to fork (overrides --sample)
  --file <path>               path to a JSCAD file to edit directly (overrides --jscad)
  --sample <name>             choose one of the bundled samples from the jscad/ folder
  --context <text>            extra context to pass to the agent
  --host <url>                override the Ollama host
  --model <name>              analyst model name (defaults to ${DEFAULT_ANALYST_MODEL})
  --validator-model <name>    validator / vision model name (ignored by the single agent)
  --memory-model <name>       memory model name (ignored by the single agent)
  --render <path|data>        PNG file path or data URI to include in the prompt
  --max-iterations <n>        how many loop cycles to run (default 3)
  --openai                   use the OpenAI agents runner instead of Ollama
  --list-samples             print available sample files and exit
  --help                     show this message
`;

type ParsedArgs = {
  parsed: Record<string, string>;
  positionals: string[];
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: Record<string, string> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const withoutPrefix = token.slice(2);
    const equalIndex = withoutPrefix.indexOf('=');
    let key: string;
    let value: string | undefined;
    if (equalIndex >= 0) {
      key = withoutPrefix.slice(0, equalIndex);
      value = withoutPrefix.slice(equalIndex + 1);
    } else {
      key = withoutPrefix;
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        value = next;
        i += 1;
      } else {
        value = 'true';
      }
    }
    parsed[key] = value;
  }
  return { parsed, positionals };
}

function mergeNpmConfig(parsed: Record<string, string>, positionals: string[]) {
  const booleanKeys = new Set(['list-samples', 'help', 'openai']);
  const keys = [
    'goal',
    'file',
    'jscad',
    'sample',
    'context',
    'host',
    'model',
    'validator-model',
    'memory-model',
    'render',
    'max-iterations',
    'list-samples',
    'help',
    'openai',
  ];
  const remainingPositionals = [...positionals];
  for (const key of keys) {
    if (parsed[key] !== undefined) {
      continue;
    }
    const envKey = `npm_config_${key.replace(/-/g, '_')}`;
    const envValue = process.env[envKey];
    if (envValue !== undefined) {
      if (envValue === 'true' && !booleanKeys.has(key) && remainingPositionals.length > 0) {
        parsed[key] = remainingPositionals.shift() ?? envValue;
      } else {
        parsed[key] = envValue === '' ? 'true' : envValue;
      }
    }
  }
  return { parsed, positionals: remainingPositionals };
}

function ensureLocalStorage() {
  if (globalThis.localStorage) {
    return;
  }
  class MemoryStorage implements Storage {
    private store = new Map<string, string>();
    get length() {
      return this.store.size;
    }
    clear() {
      this.store.clear();
    }
    getItem(key: string) {
      return this.store.get(key) ?? null;
    }
    key(index: number) {
      const keys = Array.from(this.store.keys());
      return keys[index] ?? null;
    }
    removeItem(key: string) {
      this.store.delete(key);
    }
    setItem(key: string, value: string) {
      this.store.set(key, value);
    }
  }
  globalThis.localStorage = new MemoryStorage();
}

function listSamples() {
  if (!fs.existsSync(samplesDirectory)) {
    console.log('No samples directory found.');
    return;
  }
  const samples = fs
    .readdirSync(samplesDirectory)
    .filter((entry) => entry.endsWith('.jscad'));
  if (samples.length === 0) {
    console.log('No sample JSCAD files shipped.');
    return;
  }
  console.log('Available sample files:');
  for (const sample of samples) {
    console.log(`  - ${sample}`);
  }
}

async function resolveRenderInput(value?: string) {
  if (!value) {
    return undefined;
  }
  if (value.startsWith('data:')) {
    return value;
  }
  if (fs.existsSync(value)) {
    const buffer = await fs.promises.readFile(value);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }
  return value;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const args = mergeNpmConfig(parsed.parsed, parsed.positionals).parsed;
  if (args.help) {
    process.stdout.write(usageText);
    return;
  }
  if (args['list-samples']) {
    listSamples();
    return;
  }

  const goal = args.goal;
  if (!goal) {
    console.error('Missing --goal value.');
    process.stdout.write(usageText);
    process.exitCode = 1;
    return;
  }

  const fileOverride = args.file ? path.resolve(args.file) : undefined;
  const jscadOverride = args.jscad ? path.resolve(args.jscad) : undefined;
  let seedSourcePath: string | undefined = fileOverride ?? jscadOverride;
  if (!seedSourcePath && args.sample) {
    seedSourcePath = path.resolve(samplesDirectory, args.sample);
  }
  const editingInPlace = Boolean(fileOverride);
  if (!seedSourcePath) {
    console.error('Provide --jscad <path>, --file <path>, or --sample <name>.');
    process.stdout.write(usageText);
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(seedSourcePath)) {
    console.error(`JSCAD file not found: ${seedSourcePath}`);
    process.exitCode = 1;
    return;
  }

  const seedCode = fs.readFileSync(seedSourcePath, 'utf-8');
  if (!seedCode.includes("const jscad = require('@jscad/modeling')")) {
    console.warn(colors.yellow(
      'Seed file does not contain the required JSCAD header from hip-implant.jscad. Expected header (excerpt):'
    ));
    console.warn(colors.gray(JSCAD_HEADER.split('\n').slice(0, 3).join('\n')));
  }

  const outputPath = editingInPlace
    ? seedSourcePath
    : path.join(
        path.dirname(seedSourcePath),
        `${path.basename(seedSourcePath, path.extname(seedSourcePath))}.output.jscad`
      );
  if (!editingInPlace) {
    fs.writeFileSync(outputPath, seedCode, 'utf-8');
  }

  ensureLocalStorage();
  const renderPngBase64 = await resolveRenderInput(args.render);
  const useOpenAi = args.openai === 'true';
  const service = useOpenAi ? new OpenAiAgentService() : new AiAgentService();
  const parsedMax = Number(args['max-iterations'] ?? '');
  const maxIterations = Number.isFinite(parsedMax) && parsedMax > 0 ? Math.floor(parsedMax) : 3;
  console.log(colors.blue('Goal:'), goal);
  console.log(colors.blue('Seed file:'), seedSourcePath);
  console.log(colors.blue('Output file:'), outputPath);
  console.log(colors.cyan(editingInPlace ? 'Editing file in place.' : 'Duplicating to .output.jscad so seed stays untouched.'));
  let currentCode = seedCode;
  const baseContext = args.context ?? '';
  let toolFeedback = '';

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const combinedContext = [baseContext, toolFeedback].filter(Boolean).join('\n');
    const step = await service.runAgent({
      goal,
      context: combinedContext,
      renderPngBase64,
      host: args.host,
      model: args.model,
      outputPath,
      currentCode,
      iteration,
      maxIterations,
    });

    let toolWroteFile = false;
    if (step.toolOutput) {
      try {
        const parsedTool = JSON.parse(step.toolOutput) as { ok?: boolean; path?: string };
        toolWroteFile = parsedTool?.ok === true && typeof parsedTool.path === 'string';
      } catch {
        toolWroteFile = false;
      }
    }
    if (toolWroteFile) {
      currentCode = fs.readFileSync(outputPath, 'utf-8');
    } else {
      currentCode = step.jscad || currentCode;
      fs.writeFileSync(outputPath, currentCode, 'utf-8');
    }

    console.log(`\n${colors.yellow('Iteration')} ${iteration}`);
    console.log(colors.yellow('Evaluation:'), step.evaluation || colors.gray('(none)'));
    console.log(colors.yellow('Notes:'), step.notes || colors.gray('(none)'));
    console.log(colors.yellow('Raw response:'), step.raw);
    if (step.toolError) {
      console.log(colors.red('Tool schema error:'), step.toolError);
    }
    if (step.toolOutput) {
      console.log(colors.magenta('Tool output:'));
      console.log(colors.magenta(step.toolOutput));
    }

    if (step.done) {
      console.log('Agent indicated completion.');
      break;
    }

    if (step.toolOutput) {
      toolFeedback = `Tool jscad-compile output:\n${step.toolOutput}`;
    } else {
      toolFeedback = '';
    }
    if (iteration === maxIterations) {
      console.log('Max iterations reached.');
    }
  }

  console.log(`\n${colors.green('Final output:')} ${outputPath}`);
}

main().catch((error) => {
  console.error('CLI failed', error);
  process.exit(1);
});
