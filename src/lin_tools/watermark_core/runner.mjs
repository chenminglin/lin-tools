import fs from 'node:fs';
import process from 'node:process';

import { interpolateAlphaMap } from './adaptiveDetector.js';
import { getEmbeddedAlphaMap } from './embeddedAlphaMaps.js';
import { processWatermarkImageData } from './watermarkProcessor.js';

function readArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

function requireArg(args, name) {
  const value = args[name];
  if (!value) {
    throw new Error(`Missing required argument: --${name}`);
  }
  return value;
}

const args = readArgs(process.argv);
const inputRawPath = requireArg(args, 'input-raw');
const outputRawPath = requireArg(args, 'output-raw');
const metaPath = requireArg(args, 'meta');
const width = Number.parseInt(requireArg(args, 'width'), 10);
const height = Number.parseInt(requireArg(args, 'height'), 10);
const adaptiveMode = args['adaptive-mode'] || 'auto';
const maxPasses = Math.max(1, Number.parseInt(args['max-passes'] || '4', 10) || 4);

if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
  throw new Error(`Invalid image dimensions: ${width}x${height}`);
}

const raw = fs.readFileSync(inputRawPath);
const expectedLength = width * height * 4;
if (raw.length !== expectedLength) {
  throw new Error(`RGBA byte length mismatch: expected ${expectedLength}, got ${raw.length}`);
}

const alpha48 = getEmbeddedAlphaMap(48);
const alpha96 = getEmbeddedAlphaMap(96);
const imageData = {
  width,
  height,
  data: new Uint8ClampedArray(raw)
};

const result = processWatermarkImageData(imageData, {
  alpha48,
  alpha96,
  adaptiveMode,
  maxPasses,
  getAlphaMap: (size) => interpolateAlphaMap(alpha96, 96, size)
});

fs.writeFileSync(outputRawPath, Buffer.from(result.imageData.data));
fs.writeFileSync(metaPath, JSON.stringify(result.meta || null, null, 2), 'utf8');
