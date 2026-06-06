export type Ok<T> = Readonly<{ ok: true; value: T }>;

export type Err<E> = Readonly<{ ok: false; error: E }>;

export type Result<T, E> = Ok<T> | Err<E>;

export const Result = {
  ok: <T>(value: T): Ok<T> => ({ ok: true, value }),
  err: <E>(error: E): Err<E> => ({ ok: false, error }),
} as const;
