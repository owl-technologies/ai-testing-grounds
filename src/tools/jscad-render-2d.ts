import fs from 'fs';
import path from 'path/win32';
import { ToolDefinition, ToolDescriptor } from '../config';import { compileJscad } from './jscad-validate';
;

const descriptor: ToolDescriptor = {
  type: 'function',
  function: {
    name: 'jscad-render-2d',
    description: 'Render JSCAD to a PNG 2D snapshot when possible.',
    parameters: {
      type: 'object',
      required: ['source'],
      properties: {
        source: {
          type: 'string',
          description: 'Full JSCAD source code to render.',
        },
      },
    },
  },
};

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const run = async (args: Record<string, unknown>): Promise<string> => {
  const source = typeof args.source === 'string' ? args.source.trim() : '';
  if (!source) {
    return JSON.stringify({ ok: false, error: 'Invalid tool input: "source" must be a non-empty string.' });
  }
  try {
    const rendererModules = loadRendererModules();
    if (!rendererModules.ok) {
      return JSON.stringify({ ok: false, error: rendererModules.error });
    }

    const { prepareRender, drawCommands, cameras, entitiesFromSolids, writeContextToFile, createRenderer } = rendererModules;
    const width = 512;
    const height = 512;
    const gl = createRenderer(width, height, { preserveDrawingBuffer: true });
    if (!gl) {
      return JSON.stringify({
        ok: false,
        error: 'Unable to create a headless WebGL context. Install the optional "gl" dependency.',
      });
    }

    const geometry = await compileJscad(source);
    const solids = Array.isArray(geometry) ? geometry : [geometry];
    const entities = entitiesFromSolids({}, ...solids);

    const perspectiveCamera = cameras.perspective;
    const camera = { ...perspectiveCamera.defaults };
    perspectiveCamera.setProjection(camera, camera, { width, height });
    perspectiveCamera.update(camera, camera);

    const renderOptions = {
      camera,
      drawCommands: {
        drawAxis: drawCommands.drawAxis,
        drawGrid: drawCommands.drawGrid,
        drawLines: drawCommands.drawLines,
        drawMesh: drawCommands.drawMesh,
      },
      entities,
      glOptions: { gl },
      rendering: { background: [1, 1, 1, 1] },
    };

    const render = prepareRender(renderOptions);
    render(renderOptions);

    const tmpPath = path.join(process.cwd(), 'jscad-render.png');
    const outputPath = writeRenderOutput((nextPath) => {
      writeContextToFile(gl, width, height, 4, nextPath);
    }, tmpPath);

    if (!outputPath) {
      return JSON.stringify({ ok: false, error: 'No output path available for rendering.' });
    }

    return JSON.stringify({ ok: true, path: outputPath });
  } catch (error) {
    return JSON.stringify({ ok: false, error: formatError(error) });
  }
};

export const jscadRender2dTool: ToolDefinition = {
  descriptor,
  run,
};


export const writeRenderOutput = (writeFile: (outputPath: string) => void, lastOutputPath: string) => {
  if (!lastOutputPath) {
    return;
  }
  const directory = path.dirname(lastOutputPath);
  const baseName = path.basename(lastOutputPath, path.extname(lastOutputPath));
  const nextPath = nextRenderPath(directory, baseName);
  writeFile(nextPath);
  return nextPath;
}

const nextRenderPath = (directory: string, baseName: string) => {
  const prefix = `${baseName}.render.`;
  const entries = fs.existsSync(directory) ? fs.readdirSync(directory) : [];
  let maxIndex = 0;
  for (const entry of entries) {
    if (!entry.startsWith(prefix) || !entry.endsWith('.png')) {
      continue;
    }
    const middle = entry.slice(prefix.length, -'.png'.length);
    const parsed = Number(middle);
    if (Number.isFinite(parsed) && parsed > maxIndex) {
      maxIndex = parsed;
    }
  }
  return path.join(directory, `${baseName}.render.${maxIndex + 1}.png`);
}

const loadRendererModules = (): {
  ok: true;
  prepareRender: (options: Record<string, unknown>) => (options: Record<string, unknown>) => void;
  drawCommands: {
    drawAxis: unknown;
    drawGrid: unknown;
    drawLines: unknown;
    drawMesh: unknown;
  };
  cameras: {
    perspective: {
      defaults: Record<string, unknown>;
      setProjection: (out: Record<string, unknown>, camera: Record<string, unknown>, params: { width: number; height: number }) => void;
      update: (out: Record<string, unknown>, camera: Record<string, unknown>) => void;
    };
  };
  entitiesFromSolids: (options: Record<string, unknown>, ...geometries: unknown[]) => unknown[];
  writeContextToFile: (gl: unknown, width: number, height: number, channels: number, filePath: string) => void;
  createRenderer: (width: number, height: number, options: Record<string, unknown>) => unknown;
} | {
  ok: false;
  error: string;
} => {
  try {
    const { prepareRender, drawCommands, cameras, entitiesFromSolids } = require('@jscad/regl-renderer');
    const { writeContextToFile } = require('@jscad/img-utils');
    const createRenderer = require('gl');
    return {
      ok: true,
      prepareRender,
      drawCommands,
      cameras,
      entitiesFromSolids,
      writeContextToFile,
      createRenderer,
    };
  } catch (error) {
    return { ok: false, error: `PNG renderer unavailable: ${formatError(error)}` };
  }
};
