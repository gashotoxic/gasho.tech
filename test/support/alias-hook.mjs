/**
 * Test-only module resolution for the `@/…` path alias from tsconfig.
 *
 * The runtime tests are run by `node --test --experimental-strip-types`, which
 * knows nothing about tsconfig `paths`. Route handlers import their helpers as
 * `@/lib/...`, so without this hook a route cannot be imported (and therefore
 * cannot be tested) at all.
 *
 * Import this module (or pass it to `--import`) before importing a route.
 */
import { register } from "node:module"

register(new URL("./ts-alias-loader.mjs", import.meta.url))
