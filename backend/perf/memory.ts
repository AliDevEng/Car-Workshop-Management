import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PerfConfig } from './config.js';

/**
 * B13.3.5 — steady-state memory of the process under test.
 *
 * Sampled from outside, because the number that matters is the one the VPS
 * sees. `process.memoryUsage()` inside the harness would describe the harness;
 * a diagnostics endpoint on the server would describe the server but would
 * also mean adding an unauthenticated memory reading to the API surface to
 * answer a question `docker stats` already answers.
 *
 * Two strategies, both explicit, neither guessed at: a container name goes
 * through `docker stats`, a pid reads the process table. With neither
 * configured a run reports "not sampled" rather than a fabricated number.
 */

const run = promisify(execFile);

export type MemorySample = {
  readonly bytes: number;
  readonly source: string;
};

/** `1.234GiB` / `567.8MiB` / `12.3kB` — what `docker stats` prints. */
export function parseDockerMemUsage(value: string): number {
  const [used] = value.split('/');
  const match = /^([\d.]+)\s*([A-Za-z]+)$/.exec((used ?? '').trim());
  if (match === null) {
    throw new Error(`Unrecognised docker stats memory value: "${value}"`);
  }

  const [, amount, unit] = match;
  const scale: Readonly<Record<string, number>> = {
    b: 1,
    kb: 1_000,
    kib: 1_024,
    mb: 1_000_000,
    mib: 1_024 * 1_024,
    gb: 1_000_000_000,
    gib: 1_024 * 1_024 * 1_024,
  };

  const factor = scale[(unit ?? '').toLowerCase()];
  if (amount === undefined || factor === undefined) {
    throw new Error(`Unrecognised docker stats memory unit: "${value}"`);
  }
  return Number(amount) * factor;
}

async function sampleContainer(name: string): Promise<MemorySample> {
  const { stdout } = await run('docker', [
    'stats',
    '--no-stream',
    '--format',
    '{{.MemUsage}}',
    name,
  ]);
  return {
    bytes: parseDockerMemUsage(stdout.trim()),
    source: `docker stats ${name}`,
  };
}

async function samplePid(pid: number): Promise<MemorySample> {
  if (process.platform === 'win32') {
    // `WorkingSet64` is what Task Manager calls Memory; `tasklist` would need
    // its thousands separators parsed back out of a localised string.
    const { stdout } = await run('powershell', [
      '-NoProfile',
      '-Command',
      `(Get-Process -Id ${String(pid)}).WorkingSet64`,
    ]);
    return {
      bytes: Number(stdout.trim()),
      source: `pid ${String(pid)} (WorkingSet64)`,
    };
  }

  const { stdout } = await run('ps', ['-o', 'rss=', '-p', String(pid)]);
  // `ps` reports kibibytes.
  return {
    bytes: Number(stdout.trim()) * 1024,
    source: `pid ${String(pid)} (RSS)`,
  };
}

/**
 * One sample, or `null` when nothing was configured to sample. A failure to
 * read a configured target throws: silently degrading to "not sampled" would
 * let a typo in a container name look like a budget nobody asked about.
 */
export async function sampleMemory(
  config: PerfConfig,
): Promise<MemorySample | null> {
  if (config.PERF_MEMORY_CONTAINER !== undefined) {
    return sampleContainer(config.PERF_MEMORY_CONTAINER);
  }
  if (config.PERF_MEMORY_PID !== undefined) {
    return samplePid(config.PERF_MEMORY_PID);
  }
  return null;
}

/**
 * Samples repeatedly for as long as `isRunning` holds, keeping the peak.
 *
 * The peak, not the mean: B13.3.5 is a ceiling, and a mean hides the one
 * moment a PDF render doubled the heap.
 */
export async function trackPeakMemory(
  config: PerfConfig,
  isRunning: () => boolean,
  intervalMs = 5_000,
): Promise<MemorySample | null> {
  let peak = await sampleMemory(config);
  if (peak === null) {
    return null;
  }

  while (isRunning()) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (!isRunning()) {
      break;
    }
    const next = await sampleMemory(config);
    if (next !== null && next.bytes > peak.bytes) {
      peak = next;
    }
  }

  return peak;
}
