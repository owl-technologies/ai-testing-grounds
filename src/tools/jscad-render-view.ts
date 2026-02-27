import path from 'path';
import { ToolDefinition } from '../config';
import { compileJscad } from './jscad-validate';
import { Tool } from 'ollama';

const descriptor: Tool = {
  type: 'function',
  function: {
    name: 'jscad-render-view',
    description: 'Render JSCAD to a composite PNG snapshot with 4 views (top, perspective, front, right) and return a PNG data URL when possible.',
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

const run = async (args: Record<string, unknown>): Promise<{ response: string; images?: string[] }> => {
  const file = typeof args.file === 'string' ? args.file.trim() : '';
  if (!file) {
    return { response: JSON.stringify({ ok: false, error: 'Invalid tool input: "file" must be a non-empty string.' }) };
  }
  try {
    const fs = await import('fs/promises');
    const filePath = path.resolve(file);
    const source = await fs.readFile(filePath, 'utf-8');
    const rendererModules = loadRendererModules();
    if (!rendererModules.ok) {
      return { response: JSON.stringify({ ok: false, error: rendererModules.error }) };
    }

    const { prepareRender, drawCommands, cameras, entitiesFromSolids, contextToBuffer, writeBufferToFile, createRenderer } = rendererModules;
    const viewWidth = 512;
    const viewHeight = 512;
    const compositeWidth = viewWidth * 2;
    const compositeHeight = viewHeight * 2;
    const gl = createRenderer(viewWidth, viewHeight, { preserveDrawingBuffer: true });
    if (!gl) {
      return {
        response: JSON.stringify({
          ok: false,
          error: 'Unable to create a headless WebGL context. Install the optional "gl" dependency.',
        }),
      };
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

    let centerX = 0;
    let centerY = 0;
    let centerZ = 0;
    let distance = 1;
    if (hasBounds) {
      if (!hasZBounds) {
        minZ = 0;
        maxZ = 0;
      }
      centerX = (minX + maxX) / 2;
      centerY = (minY + maxY) / 2;
      centerZ = (minZ + maxZ) / 2;
      const sizeX = maxX - minX;
      const sizeY = maxY - minY;
      const sizeZ = maxZ - minZ;
      const radius = Math.max(0.5 * Math.hypot(sizeX, sizeY, sizeZ), 1);
      const fov = typeof camera.fov === 'number' ? camera.fov : Math.PI / 4;
      const aspect = viewWidth / viewHeight;
      const fovX = 2 * Math.atan(Math.tan(fov / 2) * aspect);
      const limitingFov = Math.min(fov, fovX);
      distance = radius / Math.sin(limitingFov / 2);
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
      distance = scaledDistance;
    } else {
      const fallbackTarget = camera.target as number[] | undefined;
      const fallbackPosition = camera.position as number[] | undefined;
      centerX = fallbackTarget?.[0] ?? 0;
      centerY = fallbackTarget?.[1] ?? 0;
      centerZ = fallbackTarget?.[2] ?? 0;
      distance = Math.hypot(
        (fallbackPosition?.[0] ?? 0) - centerX,
        (fallbackPosition?.[1] ?? 0) - centerY,
        (fallbackPosition?.[2] ?? 0) - centerZ,
      ) || 1;
    }

    const target = [centerX, centerY, centerZ];
    const perspectivePosition = [
      (camera.position as number[] | undefined)?.[0] ?? centerX + distance,
      (camera.position as number[] | undefined)?.[1] ?? centerY + distance,
      (camera.position as number[] | undefined)?.[2] ?? centerZ + distance,
    ];

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
    const compositeBuffer = new Uint8Array(compositeWidth * compositeHeight * 4);

    const views = [
      {
        position: [centerX, centerY, centerZ + distance],
        up: [0, 1, 0],
        offsetX: 0,
        offsetY: viewHeight,
      },
      {
        position: perspectivePosition,
        up: [0, 0, 1],
        offsetX: viewWidth,
        offsetY: viewHeight,
      },
      {
        position: [centerX, centerY + distance, centerZ],
        up: [0, 0, 1],
        offsetX: 0,
        offsetY: 0,
      },
      {
        position: [centerX + distance, centerY, centerZ],
        up: [0, 0, 1],
        offsetX: viewWidth,
        offsetY: 0,
      },
    ];

    for (const view of views) {
      camera.position = view.position;
      camera.target = target;
      camera.up = view.up;
      perspectiveCamera.setProjection(camera, camera, { width: viewWidth, height: viewHeight });
      perspectiveCamera.update(camera, camera);
      render(renderOptions);
      const viewBuffer = contextToBuffer(gl, viewWidth, viewHeight, 4);
      for (let y = 0; y < viewHeight; y += 1) {
        const sourceOffset = y * viewWidth * 4;
        const targetOffset = ((view.offsetY + y) * compositeWidth + view.offsetX) * 4;
        compositeBuffer.set(viewBuffer.subarray(sourceOffset, sourceOffset + viewWidth * 4), targetOffset);
      }
    }

    const outputPath = path.join(
      path.dirname(filePath),
      `${path.basename(filePath, path.extname(filePath))}.render.png`
    );
    writeBufferToFile(compositeBuffer, compositeWidth, compositeHeight, outputPath);

    const pngBuffer = await fs.readFile(outputPath);
    const imageBase64 = pngBuffer.toString('base64');
    const imageDataUrl = `data:image/png;base64,${imageBase64}`;
    return {
      response: JSON.stringify({ ok: true, imageBase64: 'attached', path: outputPath }),
      images: [imageDataUrl],
    };
  } catch (error) {
    return { response: JSON.stringify({ ok: false, error: formatError(error) }) };
  }
};

export const jscadRenderViewTool: ToolDefinition = {
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
  contextToBuffer: (gl: unknown, width: number, height: number, depth: number) => Uint8Array;
  writeBufferToFile: (buffer: Uint8Array, width: number, height: number, filePath: string) => void;
  createRenderer: (width: number, height: number, options: Record<string, unknown>) => unknown;
} | {
  ok: false;
  error: string;
} => {
  try {
    const { prepareRender, drawCommands, cameras, entitiesFromSolids } = require('@jscad/regl-renderer');
    const { contextToBuffer, writeBufferToFile } = require('@jscad/img-utils');
    const createRenderer = require('gl');
    return {
      ok: true,
      prepareRender,
      drawCommands,
      cameras,
      entitiesFromSolids,
      contextToBuffer,
      writeBufferToFile,
      createRenderer,
    };
  } catch (error) {
    return { ok: false, error: `PNG renderer unavailable: ${formatError(error)}` };
  }
};
