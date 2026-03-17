/**
 * The binary parsing logic in this file is adapted from:
 *   apps/bundle-analyzer/lib/analyze-data.ts
 *   in the vercel/next.js repository.
 *
 *   MIT License
 *   Copyright (c) 2016-present Vercel, Inc.
 *   https://github.com/vercel/next.js/blob/5809756f5599f9cd5fd8396b44eb7a4d9668479e/apps/bundle-analyzer/lib/analyze-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import type { BundleAnalysis, RouteAnalysis } from './types';

// ---------------------------------------------------------------------------
// Type definitions (from vercel/next.js apps/bundle-analyzer/lib/analyze-data.ts)
// ---------------------------------------------------------------------------

export type SourceIndex = number;

export interface AnalyzeSource {
  parent_source_index: number | null;
  path: string;
}

export interface AnalyzeChunkPart {
  source_index: number;
  output_file_index: number;
  size: number;
  compressed_size: number;
}

export interface AnalyzeOutputFile {
  filename: string;
}

interface EdgesDataReference {
  offset: number;
  length: number;
}

interface AnalyzeDataHeader {
  sources: AnalyzeSource[];
  chunk_parts: AnalyzeChunkPart[];
  output_files: AnalyzeOutputFile[];
  output_file_chunk_parts: EdgesDataReference;
  source_chunk_parts: EdgesDataReference;
  source_children: EdgesDataReference;
  source_roots: number[];
}

// ---------------------------------------------------------------------------
// AnalyzeData class (adapted from vercel/next.js)
// ---------------------------------------------------------------------------

class AnalyzeData {
  private analyzeHeader: AnalyzeDataHeader;
  private analyzeBinaryData: DataView;

  constructor(analyzeArrayBuffer: ArrayBuffer) {
    const analyzeDataView = new DataView(analyzeArrayBuffer);
    const analyzeJsonLength = analyzeDataView.getUint32(0, false); // big-endian
    const analyzeJsonBytes = new Uint8Array(analyzeArrayBuffer, 4, analyzeJsonLength);
    const analyzeJsonString = new TextDecoder('utf-8').decode(analyzeJsonBytes);
    this.analyzeHeader = JSON.parse(analyzeJsonString) as AnalyzeDataHeader;
    const analyzeBinaryOffset = 4 + analyzeJsonLength;
    this.analyzeBinaryData = new DataView(analyzeArrayBuffer, analyzeBinaryOffset);
  }

  chunkPart(index: number): AnalyzeChunkPart | undefined {
    return this.analyzeHeader.chunk_parts[index];
  }

  chunkPartCount(): number {
    return this.analyzeHeader.chunk_parts.length;
  }

  outputFile(index: number): AnalyzeOutputFile | undefined {
    return this.analyzeHeader.output_files[index];
  }

  private readEdgesDataAtIndex(
    reference: EdgesDataReference,
    index: SourceIndex
  ): SourceIndex[] {
    const { offset, length } = reference;

    if (length === 0) {
      return [];
    }

    const numOffsets = this.analyzeBinaryData.getUint32(offset, false);

    if (index < 0 || index >= numOffsets) {
      return [];
    }

    const offsetsStart = offset + 4;
    const prevOffset =
      index === 0
        ? 0
        : this.analyzeBinaryData.getUint32(offsetsStart + (index - 1) * 4, false);
    const currentOffset = this.analyzeBinaryData.getUint32(
      offsetsStart + index * 4,
      false
    );

    const edgeCount = currentOffset - prevOffset;
    if (edgeCount === 0) {
      return [];
    }

    const dataStart = offset + 4 + numOffsets * 4;
    const edges: number[] = [];
    for (let j = 0; j < edgeCount; j++) {
      edges.push(
        this.analyzeBinaryData.getUint32(dataStart + (prevOffset + j) * 4, false)
      );
    }

    return edges;
  }

  outputFileChunkParts(index: number): number[] {
    return this.readEdgesDataAtIndex(this.analyzeHeader.output_file_chunk_parts, index);
  }
}

// ---------------------------------------------------------------------------
// Client JS size extraction
// ---------------------------------------------------------------------------

/**
 * Sum client-side JS sizes for a route by iterating over output files
 * under [client-fs]/ with .js extension, using outputFileChunkParts to
 * aggregate sizes without double-counting.
 */
function getClientJsSizes(data: AnalyzeData): { size: number; compressedSize: number } {
  let size = 0;
  let compressedSize = 0;

  for (let i = 0; i < Infinity; i++) {
    const outputFile = data.outputFile(i);
    if (!outputFile) break;

    if (!outputFile.filename.startsWith('[client-fs]/') || !outputFile.filename.endsWith('.js')) {
      continue;
    }

    for (const chunkPartIndex of data.outputFileChunkParts(i)) {
      const chunkPart = data.chunkPart(chunkPartIndex);
      if (chunkPart) {
        size += chunkPart.size;
        compressedSize += chunkPart.compressed_size;
      }
    }
  }

  return { size, compressedSize };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads the bundle analysis from .next/analyze/data/
 *
 * Directory structure:
 *   <analyzeDir>/data/routes.json         - list of routes
 *   <analyzeDir>/data/analyze.data        - binary data for "/"
 *   <analyzeDir>/data/[lang]/analyze.data - binary data for "/[lang]"
 */
export function loadAnalysis(analyzeDir: string): BundleAnalysis {
  core.debug(`Loading analysis from: ${analyzeDir}`);

  const dataDir = path.join(analyzeDir, 'data');
  const routesJsonPath = path.join(dataDir, 'routes.json');

  if (!fs.existsSync(routesJsonPath)) {
    throw new Error(`routes.json not found at: ${routesJsonPath}`);
  }

  const routes: string[] = JSON.parse(fs.readFileSync(routesJsonPath, 'utf-8'));
  core.debug(`Found ${routes.length} routes in routes.json`);

  const result: RouteAnalysis[] = [];

  for (const route of routes) {
    // "/" → "analyze.data", "/[lang]" → "[lang]/analyze.data"
    const routeRelPath =
      route === '/' ? 'analyze.data' : `${route.replace(/^\//, '')}/analyze.data`;
    const dataFilePath = path.join(dataDir, routeRelPath);

    try {
      const buf = fs.readFileSync(dataFilePath);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const data = new AnalyzeData(ab);
      const { size, compressedSize } = getClientJsSizes(data);
      result.push({
        route,
        size: compressedSize, // gzip size
        rawSize: size,
      });
    } catch (err) {
      // API routes and some special routes may not have analyze data
      core.debug(`Skipping route ${route}: ${err}`);
    }
  }

  core.debug(`Loaded ${result.length} routes with analyze data`);
  return { routes: result };
}
