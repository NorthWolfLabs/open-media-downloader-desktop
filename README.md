# OMD desktop

A Svelte/Tauri interface for discovering media through source plugins, reviewing
downloads and keeping files you control. This project owns the UI and native shell.
The separate `open-media-downloader` engine owns downloads, permissions, accounts,
subscriptions and storage. The app is not a reader or media player.

OMD includes no sources. People import the `.omdp` plugin packages they trust from
Sources. The unofficial NASA podcast plugin in the separate
[`omd-source-nasa-podcast`](https://github.com/NorthWolfLabs/omd-source-nasa-podcast) project is an optional worked example, not part of an OMD release.
No engine or plugin source checkout is required to build this UI.

## Start here

- **Users:** [setup, browsing and downloads](docs/getting-started.md).
- **Updating:** [manual installation, upgrades and recovery](docs/manual-updates.md).
- **Developers:** [local development and tests](docs/development.md).
- **Agents:** read [AGENTS.md](AGENTS.md); use the engine's MCP server for media
  workflows rather than automating desktop widgets.
- **Release maintainers:** [explicit runtime staging and source exports](docs/packaging.md).
  Follow the [release acceptance and versioning checklist](docs/release.md).

## Development

Use Node 24.20.0, Vite+ 0.2.8 and Rust 1.93.0 with Tauri's platform prerequisites.
The client SDK is a versioned, licensed archive under vendor/, pinned by the lockfile.

```sh
vp install --frozen-lockfile
vp run check
vp run test
vp build
```

For an interactive browser preview, start a separate development engine with a
disposable profile and allow the dev server's origin (a separately started engine
accepts only the native app's origins by default), then point `vp dev` at it:

```sh
/absolute/runtime/bin/omd-engine --profile /absolute/private/dev-profile \
  --allowed-origin http://127.0.0.1:1422
OMD_V2_INSTANCE=/absolute/private/dev-profile/instance.json vp dev
```

For a native development window, supply a matching engine binary and a disposable
profile, then run `vp exec tauri dev`; the developer guide lists the environment
variables. Installed users do not need Node, Rust, Python or a sibling checkout.

## Project map

| Directory | Responsibility |
| --- | --- |
| `src/v2/` | Svelte pages, UI primitives, themes, display caching and client adapter |
| `src-tauri/src/` | Native window, dialogs, artifact opening and engine attachment |
| `src-tauri/icons/` | Editable platform icon masters and reviewed exports |
| `packaging/` | Public plugin policy, materials fixtures and source inventory |
| `scripts/` | Explicit runtime staging, builds and release validation |
| `vendor/` | The one locked, licensed client SDK archive |

Project code is [MIT licensed](LICENSE); bundled components retain their own terms.
Public source preparation does not establish signed installer or native-platform
acceptance. Publishing, signing and notarization are separate release steps.
