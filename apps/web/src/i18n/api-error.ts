export class ClientApiError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
