import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
it("does not let a fixed native inset compete with measured header geometry in any build", () => {
  const root = resolve("src-tauri");
  for (const name of readdirSync(root).filter((name) =>
    /^tauri.*\.conf\.json$/.test(name),
  )) {
    const config = JSON.parse(readFileSync(resolve(root, name), "utf8"));
    for (const window of config.app?.windows ?? [])
      expect(
        window.trafficLightPosition,
        `${name}: Tao would reset the native button position on redraw`,
      ).toBeUndefined();
  }
});
it("requires the objc2 release whose autoreleased-return retains cannot claim another object", () => {
  // objc2 0.6.4 let the title-bar update steal a retain from the window's
  // content view on macOS 13+ (objc2 #861); AppKit then aborted on reopen.
  const atLeast065 = (version: string) => {
    const [major, minor, patch] = version.split(".").map(Number);
    return major > 0 || minor > 6 || (minor === 6 && patch >= 5);
  };
  const manifest = readFileSync(resolve("src-tauri/Cargo.toml"), "utf8").replace(/\r\n/g, "\n");
  const required = manifest.match(/^objc2 = "([^"]+)"$/m)?.[1];
  expect(required, "Cargo.toml must name a direct objc2 requirement").toBeDefined();
  expect(atLeast065(required!), `Cargo.toml requires objc2 ${required}`).toBe(true);
  const lock = readFileSync(resolve("src-tauri/Cargo.lock"), "utf8").replace(/\r\n/g, "\n");
  const resolved = [...lock.matchAll(/^name = "objc2"\nversion = "([^"]+)"$/gm)].map((m) => m[1]);
  expect(resolved.length).toBeGreaterThan(0);
  for (const version of resolved)
    expect(atLeast065(version), `Cargo.lock resolves objc2 ${version}`).toBe(true);
});
it("allows the native open and save dialogs required by theme import and export", () => {
  const config = JSON.parse(
    readFileSync(resolve("src-tauri/capabilities/default.json"), "utf8"),
  );
  expect(config.permissions).toEqual(
    expect.arrayContaining(["dialog:allow-open", "dialog:allow-save"]),
  );
});
