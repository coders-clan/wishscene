/** Flat namespaces fall back key by key, preserving translated siblings. */
export function mergeMessages(
  source: Record<string, Record<string, string>>,
  translated: Record<string, Record<string, string>> = {},
  missing?: (namespace: string, key: string) => void,
) {
  return Object.fromEntries(
    Object.entries(source).map(([namespace, messages]) => {
      const local = translated[namespace] ?? {};
      for (const key of Object.keys(messages)) if (!(key in local)) missing?.(namespace, key);
      return [namespace, { ...messages, ...local }];
    }),
  );
}
