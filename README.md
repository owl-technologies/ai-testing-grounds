# AI Testing Grounds

This standalone TypeScript CLI lets you iterate on a JSCAD editing agent workflow (Ollama or OpenAI) without a UI. The agent uses tool calls (`diff-patch`, `jscad-validate`, `jscad-render-2d`) to edit and evaluate a JSCAD file.

## Setup

```bash
npm install
```

## CLI usage

```bash
npm run cli -- --goal "Make the hip implant thicker" --file jscad/hip-implant.jscad
```

Options you can pass:

- `--goal <text>` (required): describe what the agent should build.
- `--file <path>` (required): path to a JSCAD file to edit.
- `--max-iterations <n>`: how many loop cycles to run (default 3).
- `--openai`: use the OpenAI agents runner instead of Ollama.
- `--help`: show this list.

The agent edits the file in place via `diff-patch`.

## Sample files

See `jscad/` for example inputs.

## Build & test

```bash
npm run build
npm test
```

## Architecture notes

- `src/cli.ts` orchestrates argument parsing, the agent loop, and tool feedback.
- `src/config.ts` holds the system prompt and tool descriptors.
- `src/agents/ollama-jscad-editor.ts` runs the Ollama agent with tool calling.
- `src/agents/openai-jscad-editor.ts` runs the OpenAI agent with tool calling.
- `src/tools/` provides `diff-patch`, `jscad-validate`, and `jscad-render-2d`.
