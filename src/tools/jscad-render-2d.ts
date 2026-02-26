import path from 'path';
import { ToolDefinition } from '../config';
import { compileJscad } from './jscad-validate';
import { Tool } from 'ollama';

const descriptor: Tool = {
  type: 'function',
  function: {
    name: 'jscad-render-2d',
    description: 'Render JSCAD to a PNG 2D snapshot and return base64 image data when possible.',
    parameters: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          description: 'Path to a JSCAD file to render.',
        },
      },
    },
  },
};

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const run = async (args: Record<string, unknown>): Promise<string> => {
  const file = typeof args.file === 'string' ? args.file.trim() : '';
  if (!file) {
    return JSON.stringify({ ok: false, error: 'Invalid tool input: "file" must be a non-empty string.' });
  }
  try {
    const fs = await import('fs/promises');
    const filePath = path.resolve(file);
    const source = await fs.readFile(filePath, 'utf-8');
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

    const { measurements } = require('@jscad/modeling');
    const { measureBoundingBox } = measurements;

    const perspectiveCamera = cameras.perspective;
    const camera = { ...perspectiveCamera.defaults };
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = 0;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = 0;
    let hasBounds = false;
    let hasZBounds = false;
    for (const solid of solids) {
      const bounds = measureBoundingBox(solid);
      if (!Array.isArray(bounds) || bounds.length < 2) {
        continue;
      }
      const [min, max] = bounds as number[][];
      if (!min || !max) {
        continue;
      }
      if (Number.isFinite(min[0]) && Number.isFinite(max[0])) {
        minX = Math.min(minX, min[0]);
        maxX = Math.max(maxX, max[0]);
        hasBounds = true;
      }
      if (Number.isFinite(min[1]) && Number.isFinite(max[1])) {
        minY = Math.min(minY, min[1]);
        maxY = Math.max(maxY, max[1]);
        hasBounds = true;
      }
      if (Number.isFinite(min[2]) && Number.isFinite(max[2])) {
        minZ = hasZBounds ? Math.min(minZ, min[2]) : min[2];
        maxZ = hasZBounds ? Math.max(maxZ, max[2]) : max[2];
        hasZBounds = true;
        hasBounds = true;
      }
    }
    if (hasBounds) {
      if (!hasZBounds) {
        minZ = 0;
        maxZ = 0;
      }
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const centerZ = (minZ + maxZ) / 2;
      const sizeX = maxX - minX;
      const sizeY = maxY - minY;
      const sizeZ = maxZ - minZ;
      const radius = Math.max(0.5 * Math.hypot(sizeX, sizeY, sizeZ), 1);
      const fov = typeof camera.fov === 'number' ? camera.fov : Math.PI / 4;
      const aspect = width / height;
      const fovX = 2 * Math.atan(Math.tan(fov / 2) * aspect);
      const limitingFov = Math.min(fov, fovX);
      const distance = radius / Math.sin(limitingFov / 2);
      const dirX = 1;
      const dirY = 1;
      const dirZ = Math.SQRT2;
      const dirLen = Math.hypot(dirX, dirY, dirZ);
      const scaledDistance = distance * 1.15;
      camera.target = [centerX, centerY, centerZ];
      camera.position = [
        centerX + (dirX / dirLen) * scaledDistance,
        centerY + (dirY / dirLen) * scaledDistance,
        centerZ + (dirZ / dirLen) * scaledDistance,
      ];
      camera.up = [0, 0, 1];
    }
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

    const outputPath = path.join(
      path.dirname(filePath),
      `${path.basename(filePath, path.extname(filePath))}.render.png`
    );
    writeContextToFile(gl, width, height, 4, outputPath);

    const pngBuffer = await fs.readFile(outputPath);
    const imageBase64 = pngBuffer.toString('base64');
    return JSON.stringify({ ok: true, imageBase64, path: outputPath });
  } catch (error) {
    return JSON.stringify({ ok: false, error: formatError(error) });
  }
};

export const jscadRender2dTool: ToolDefinition = {
  descriptor,
  run,
};

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
