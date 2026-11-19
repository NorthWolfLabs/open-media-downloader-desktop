# Develop the desktop

Use Node 24.20.0, Vite+ 0.2.8 and Rust 1.93.0. Install Tauri's native prerequisites
for your platform. The UI's frozen dependency installation uses the approved client
SDK in vendor/; no engine source directory or global npm package is a dependency.

```sh
vp install --frozen-lockfile
vp run check
vp run test
vp exec node --test scripts/*.test.mjs
vp build
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

The browser build is written to ignored dist-v2/. It has one stylesheet, linked from
the HTML head. src/v2/main.ts loads the app and the global sheets through
src/v2/boot.ts, so startup errors can be shown. boot.ts imports App before the global
CSS: global rules such as `.picker-row .choice-picker` win over component rules only by
coming later. The build fails if the order or the single stylesheet changes
(scripts/frontend-css-order.mjs). Cargo output is also ignored;
CARGO_TARGET_DIR can place it outside this source tree. Generated native schemas
and staged runtime resources are not committed.

## Run locally

Build or obtain a matching engine/worker separately. For native development:

```sh
OMD_V2_ENGINE_BINARY=/absolute/runtime/bin/omd-engine \
OMD_V2_PROFILE=/absolute/private/disposable-profile \
vp exec tauri dev
```

The native shell starts that engine itself and allows the dev server's origin.

For browser-only development, start the engine yourself in a separate terminal. A
separately started engine accepts only the native app's origins by default, so allow
the dev server's origin explicitly or the browser cannot attach:

```sh
/absolute/runtime/bin/omd-engine \
  --profile /absolute/private/disposable-profile \
  --allowed-origin http://127.0.0.1:1422
```

The engine finds its worker next to its executable. To test downloads or browser
sign-in, also pass `--tools` and `--browser-tools` with verified distribution
manifests, as the engine's developer guide describes. Then run
`OMD_V2_INSTANCE=/absolute/private/disposable-profile/instance.json vp dev` and open
http://127.0.0.1:1422. The dev server attaches only to the explicitly selected
loopback instance. Never point tests or a browser dev server at a real user's profile.

The engine owns the public HTTP contract, downloads, credentials and file mutations.
The UI owns window/dialog integration, layout/themes and display caching. Keep source
navigation/resolution in plugins. Update the vendored SDK only as a deliberate
versioned input change with its lockfile, license and source-policy digest.

## UI verification

Use shared primitives and theme tokens. Check 1340×860 and the 720×560 minimum,
sidebar collapsed/expanded, light/dark, keyboard interaction, focus visibility and
active/inactive native selection. Respect reduced motion and forced colors.
Source lists/discovery should work with one and many sources. Test placeholders,
loading, cached navigation and recovery states, not only the populated happy path.

Keep agent reports/screenshots in .local/agent-reports/<task>/ or outside the project.
A fixture/emulated pass is not native Windows/Linux/macOS acceptance. The source
CI workflow covers development checks; [packaging](packaging.md) covers releases.

Environment-assignment examples use a POSIX shell. In PowerShell set
`$env:NAME = "value"` before the command; replace every example path with a real
absolute path for your platform.
