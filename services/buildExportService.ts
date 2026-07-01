// MP4 export for a build (reveal animation). Renders the timeline offscreen at
// the build's fps and encodes H.264 via WebCodecs, muxed to MP4 with Mediabunny.
//
// This module statically imports `mediabunny`, so it is ONLY ever pulled in via
// a dynamic `import()` (see BuildStudio.handleExport) — that keeps mediabunny +
// the WebCodecs glue out of the main bundle until the user actually exports.

import {
  Output, Mp4OutputFormat, BufferTarget, CanvasSource, canEncodeVideo, QUALITY_HIGH,
} from 'mediabunny';
import type { ImageBuild } from '../types';
import { renderFrame, totalDurationMs, prepareStepLayers } from './buildAnimator';

const MAX_EXPORT_W = 1920;
const MAX_EXPORT_SECONDS = 90; // safety cap so a runaway build can't OOM the tab

export interface ExportOptions {
  onProgress?: (fraction: number) => void;
}

/** Fast synchronous check: is in-browser H.264 encoding even possible here? */
export const canExportMp4 = (): boolean =>
  typeof window !== 'undefined' &&
  typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined';

/** Even-dimension output sized to the image aspect (H.264/yuv420p needs even). */
const outputDims = (imgW: number, imgH: number): { w: number; h: number } => {
  const w = Math.min(imgW, MAX_EXPORT_W);
  const h = Math.round((w * imgH) / imgW);
  return { w: w - (w % 2), h: h - (h % 2) };
};

export const exportBuildToMp4 = async (
  build: ImageBuild,
  image: CanvasImageSource,
  imgW: number,
  imgH: number,
  opts: ExportOptions = {}
): Promise<Blob> => {
  if (!imgW || !imgH) throw new Error('Image dimensions unknown.');
  const { w: outW, h: outH } = outputDims(imgW, imgH);

  const canEncode = await canEncodeVideo('avc', { width: outW, height: outH });
  if (!canEncode) throw new Error('H.264 (AVC) encoding is not available in this browser.');

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH });
  output.addVideoTrack(source);
  await output.start();

  const fps = Math.max(1, Math.min(60, build.fps || 30));
  const totalSec = Math.min(MAX_EXPORT_SECONDS, totalDurationMs(build) / 1000);
  const totalMs = totalSec * 1000;
  const frameCount = Math.max(1, Math.ceil(totalSec * fps));
  const frameDur = 1 / fps;

  // Precompute each step's masked layer once (shapes don't change per frame).
  const layers = prepareStepLayers(build, image, imgW, imgH);

  for (let i = 0; i < frameCount; i++) {
    const t = Math.min((i / fps) * 1000, totalMs);
    renderFrame(ctx, build, image, layers, imgW, imgH, t);
    // Await each add to respect encoder/writer backpressure.
    await source.add(i / fps, frameDur);
    opts.onProgress?.(i / frameCount);
  }

  await output.finalize();
  opts.onProgress?.(1);

  const buffer = target.buffer;
  if (!buffer) throw new Error('Export produced no data.');
  return new Blob([buffer], { type: 'video/mp4' });
};
