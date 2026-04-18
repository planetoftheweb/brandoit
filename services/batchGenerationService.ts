import { User, Generation } from "../types";

/**
 * A single unit of work inside a batch submit.
 *
 *   promptIndex: which expanded-prompt slot this job belongs to (0-based).
 *   copyIndex: which copy within that slot (0-based; 0..copiesPerPrompt-1).
 *   globalIndex: absolute 0-based position across the whole batch.
 */
export interface BatchJob {
  id: string;
  prompt: string;
  promptIndex: number;
  copyIndex: number;
  globalIndex: number;
}

export interface BatchError {
  jobId: string;
  prompt: string;
  message: string;
}

export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  inFlight: number;
  errors: BatchError[];
  latest?: Generation;
  currentPrompts: string[];
}

export interface BatchResult {
  total: number;
  completed: number;
  failed: number;
  errors: BatchError[];
  generations: Generation[];
  lastGeneration?: Generation;
}

/**
 * Default parallelism for batch generation. Exported so UI code (progress
 * banners, pre-send estimates) stays in sync with the actual runner.
 */
export const DEFAULT_BATCH_CONCURRENCY = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRateLimitError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b429\b|rate.?limit|quota|too many requests/i.test(message);
};

const toBatchError = (job: BatchJob, err: unknown): BatchError => ({
  jobId: job.id,
  prompt: job.prompt,
  message: err instanceof Error ? err.message : String(err ?? "Unknown error"),
});

export const buildJobs = (
  prompts: string[],
  copiesPerPrompt: number
): BatchJob[] => {
  const jobs: BatchJob[] = [];
  const safeCount = Math.max(1, Math.floor(copiesPerPrompt || 1));
  let globalIndex = 0;
  prompts.forEach((prompt, promptIndex) => {
    for (let copyIndex = 0; copyIndex < safeCount; copyIndex += 1) {
      jobs.push({
        id: `job-${Date.now().toString(36)}-${globalIndex}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        prompt,
        promptIndex,
        copyIndex,
        globalIndex,
      });
      globalIndex += 1;
    }
  });
  return jobs;
};

interface RunBatchOptions {
  prompts: string[];
  copiesPerPrompt: number;
  concurrency?: number;
  /** Produces a Generation for a single expanded prompt. Persistence is the caller's responsibility. */
  runOne: (job: BatchJob) => Promise<Generation>;
  onProgress?: (progress: BatchProgress) => void;
  signal?: AbortSignal;
  /** Max milliseconds to back off when the runner detects a rate-limit style error. */
  rateLimitCooldownMs?: number;
}

export const runBatchGenerations = async ({
  prompts,
  copiesPerPrompt,
  concurrency = DEFAULT_BATCH_CONCURRENCY,
  runOne,
  onProgress,
  signal,
  rateLimitCooldownMs = 1000,
}: RunBatchOptions): Promise<BatchResult> => {
  const jobs = buildJobs(prompts, copiesPerPrompt);
  const total = jobs.length;

  const state = {
    completed: 0,
    failed: 0,
    inFlight: 0,
    errors: [] as BatchError[],
    generations: [] as Generation[],
    latest: undefined as Generation | undefined,
    currentPrompts: [] as string[],
  };

  const emit = () => {
    if (!onProgress) return;
    onProgress({
      total,
      completed: state.completed,
      failed: state.failed,
      inFlight: state.inFlight,
      errors: [...state.errors],
      latest: state.latest,
      currentPrompts: [...state.currentPrompts],
    });
  };

  if (total === 0) {
    emit();
    return {
      total,
      completed: 0,
      failed: 0,
      errors: [],
      generations: [],
      lastGeneration: undefined,
    };
  }

  emit();

  let cursor = 0;
  const take = (): BatchJob | undefined => {
    if (signal?.aborted) return undefined;
    if (cursor >= jobs.length) return undefined;
    const job = jobs[cursor];
    cursor += 1;
    return job;
  };

  const worker = async () => {
    for (let job = take(); job; job = take()) {
      state.inFlight += 1;
      state.currentPrompts = [...state.currentPrompts, job.prompt];
      emit();
      try {
        const generation = await runOne(job);
        state.generations.push(generation);
        state.latest = generation;
        state.completed += 1;
      } catch (err) {
        state.failed += 1;
        state.errors.push(toBatchError(job, err));
        if (isRateLimitError(err) && rateLimitCooldownMs > 0) {
          await sleep(rateLimitCooldownMs);
        }
      } finally {
        state.inFlight -= 1;
        state.currentPrompts = state.currentPrompts.filter(
          (prompt, index, arr) => {
            // Remove the first occurrence matching this job's prompt.
            if (prompt !== job!.prompt) return true;
            return arr.indexOf(prompt) !== index;
          }
        );
        emit();
      }
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, total));
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const result: BatchResult = {
    total,
    completed: state.completed,
    failed: state.failed,
    errors: state.errors,
    generations: state.generations,
    lastGeneration: state.latest,
  };
  return result;
};

// --- Admin / cap helpers -----------------------------------------------------

/**
 * Admin flag mirrors the existing gate in App.tsx (seedStructures).
 */
export const isAdminUser = (user?: User | null): boolean =>
  !!user && user.username === "planetoftheweb";

/**
 * Per-submit generation cap. Normal users: 5. Admins: effectively unlimited.
 */
export const DEFAULT_BATCH_CAP = 5;
export const ADMIN_BATCH_CAP = Number.POSITIVE_INFINITY;

export const batchCapFor = (user?: User | null): number =>
  isAdminUser(user) ? ADMIN_BATCH_CAP : DEFAULT_BATCH_CAP;

export const formatCap = (cap: number): string =>
  Number.isFinite(cap) ? String(cap) : "unlimited";
