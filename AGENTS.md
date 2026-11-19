# Working on OMD desktop

Read README.md, docs/development.md and docs/packaging.md. This is an independent
Svelte/Tauri UI project, not the engine or a plugin repository.

- Use Vite+ for JS/TS, UV for Python and the pinned Rust toolchain. Consume the
  vendored versioned client SDK and public engine API; don't import engine code
  or assume a sibling checkout. Keep site-specific behavior in source plugins.
- Follow existing platform/theme tokens and shared UI primitives. Keep one main
  title per surface; supporting copy should explain a decision or behavior.
- Check the minimum 720×560 layout, keyboard/focus behavior, light/dark themes
  and native activation when changing visible UI. Native checks aren't replaced
  by an offscreen browser or another platform's emulated styles.
- Put reports, screenshots and scratch work in .local/agent-reports/<task>/ or
  outside the project. Keep maintained documentation in docs/.
- Keep profiles, source packages, cookies, signing credentials and private review
  evidence out of Git. Test against disposable profiles, never the owner's data.
- Don't remove pinned icon masters/exports, the licensed SDK or runtime terms as
  if they were caches. Public bundles require explicit reviewed runtime inputs.
- Use packaging/public-source-inputs.json and scripts/export-public-source.py
  for this project's source export. No other project is part of that archive.
