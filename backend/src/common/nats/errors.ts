export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isNatsNotFound(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('not found') || message.includes('consumer not found');
}
