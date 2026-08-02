import { Logger } from "@nestjs/common";

/**
 * Run one of the job's passes, converting a failure into a returned error rather
 * than a thrown one, so the caller can run the other pass regardless
 * (technical-design §5, D4; AC-9). A broken email provider must not be able to
 * stop retention, and vice versa — putting both passes in one job (ADR-007) is
 * only safe if neither can starve the other.
 *
 * Its own module rather than a private function in `main.ts` because `main.ts`
 * runs the job on import: this is the seam that lets AC-9 be a test instead of a
 * hand-run probe.
 */
export async function runPass(
  name: string,
  pass: () => Promise<unknown>,
): Promise<Error | null> {
  try {
    await pass();
    return null;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    new Logger("Worker").error(
      JSON.stringify({ msg: `${name} pass failed`, error: error.message }),
    );
    return error;
  }
}
