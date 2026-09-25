// A refusal the user can act on. `code` is stable and shared with the reference
// ledger (modules/ledger) so the two can be compared (DB-6).
export class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// A function declaration (not an arrow) so TypeScript narrows after a call.
export function fail(code: string, message: string, status = 400): never {
  throw new AppError(code, message, status);
}
