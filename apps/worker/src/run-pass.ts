import { Logger } from "@nestjs/common";

/**
 * What one pass of the job produced: its summary when it succeeded, or the error
 * that stopped it. Both are reported — the summary on the run's completion line
 * (AC-8), the error in the exit code (AC-9).
 */
export interface PassOutcome<T> {
  summary: T | null;
  error: Error | null;
}

/**
 * Run one of the job's passes, converting a failure into a returned outcome
 * rather than a thrown one, so the caller can run the other pass regardless
 * (technical-design §5, D4; AC-9). A broken email provider must not be able to
 * stop retention, and vice versa — putting both passes in one job (ADR-007) is
 * only safe if neither can starve the other.
 *
 * The pass's return value is carried out with it: `main.ts` needs both summaries
 * to build the run's completion line (AC-8), and a failed pass must not cost the
 * other pass its summary — AC-9 guarantees the other one still ran.
 *
 * Its own module rather than a private function in `main.ts` because `main.ts`
 * runs the job on import: this is the seam that lets AC-9 be a test instead of a
 * hand-run probe.
 */
export async function runPass<T>(
  name: string,
  pass: () => Promise<T>,
): Promise<PassOutcome<T>> {
  try {
    return { summary: await pass(), error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    new Logger("Worker").error(
      JSON.stringify({ msg: `${name} pass failed`, error: error.message }),
    );
    return { summary: null, error };
  }
}
