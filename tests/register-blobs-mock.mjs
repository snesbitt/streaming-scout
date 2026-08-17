// tests/register-blobs-mock.mjs
//
// Redirects `import { getStore } from "@netlify/blobs"` to tests/fake-blobs.mjs
// for the duration of a test run, so netlify/functions/*.mjs can be exercised
// exactly as written, with no test-only branches or injected dependencies in
// the production files.
//
// Used as: node --import ./tests/register-blobs-mock.mjs tests/blobs-concurrency.test.mjs
//
// A resolve hook rather than a stub package under node_modules, so the suite
// works on a clean CI checkout where `npm ci` installs the real @netlify/blobs.

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./blobs-resolve-hook.mjs", pathToFileURL(import.meta.filename));
