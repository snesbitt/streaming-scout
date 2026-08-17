// tests/blobs-resolve-hook.mjs
// Module-resolution hook registered by tests/register-blobs-mock.mjs.
// Only the one bare specifier is intercepted; everything else resolves normally.

const FAKE = new URL("./fake-blobs.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@netlify/blobs") {
    return { url: FAKE, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
