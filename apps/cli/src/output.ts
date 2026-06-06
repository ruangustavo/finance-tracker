import type { Result } from "@chatter/core";

export function emit<T, E>(result: Result<T, E>): void {
  if (result.ok) {
    writeJson(result.value);
  } else {
    writeError(result.error);
    process.exitCode = 1;
  }
}

export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function writeError(error: unknown): void {
  process.stderr.write(`${JSON.stringify({ error })}\n`);
}
