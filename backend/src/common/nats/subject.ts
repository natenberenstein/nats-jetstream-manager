/**
 * Convert a NATS subject pattern into a RegExp.
 * `*` matches exactly one token and `>` matches one or more trailing tokens.
 */
export function natsSubjectToRegex(pattern: string): RegExp {
  const parts = pattern.split('.');
  const regexParts = parts.map((part) => {
    if (part === '>') {
      return '.+';
    }
    if (part === '*') {
      return '[^.]+';
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });

  return new RegExp(`^${regexParts.join('\\.')}$`);
}
