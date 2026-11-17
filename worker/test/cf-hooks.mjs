const STUB = "data:text/javascript," + encodeURIComponent(
  "export class DurableObject {}; export class WorkerEntrypoint {}; export const env = {};",
);
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("cloudflare:")) return { url: STUB, shortCircuit: true };
  return next(specifier, context);
}
