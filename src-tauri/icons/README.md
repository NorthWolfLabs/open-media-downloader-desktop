# OMD application icons

Approved November 9, 2026: three compact trapezoidal media cards in a blue V-cut receiver. Each card uses the same SVG path and label anchor; the side instances rotate outward 12 degrees without stretching or shearing. Purple/book, teal/image and coral/video are the only content differences.

## Sources

`platform/omd-master.svg` is the complete editable vector. `omd-windows.svg`, `omd-linux.svg` and `omd-symbolic.svg` provide platform treatments. `geometry.json` records the common shape. `platform/OMD.icon` contains seven SVG layers in four groups with native Liquid Glass on the colored layers. No bitmap, font or external symbol library is embedded in these SVGs.

`platform/build-artwork.mjs` reconstructs the source files into a fresh directory:

```sh
vp exec node src-tauri/icons/platform/build-artwork.mjs /absolute/fresh-directory
```

This does not overwrite approved sources. An intentional source change must be copied into platform/ and reviewed before refreshing `source-sha256.json` and the engine's public-source policy pins.

## Export

From the desktop root on macOS, with Xcode/Icon Composer 27 and librsvg's `rsvg-convert`:

```sh
uv run src-tauri/icons/export-icons.py
# To verify without changing this checkout:
uv run src-tauri/icons/export-icons.py --output-root /absolute/scratch-directory
```

The exporter verifies the exact source set and SHA-256 manifest before rendering. Apple actool compiles a complete legacy ICNS at a macOS 13.5 deployment target. Windows/Linux are rasterized directly from SVG at each physical size. The ICO contains nine exact PNG frames (16,20,24,32,40,48,64,128,256 px). Linux bundle PNGs are 32,128,256 px. In-app icons are 256 px PNGs.

All eight consumed outputs reproduce the approved candidate kit byte-for-byte with the recorded tooling. Actual 32 and 128 px files were visually inspected. Windows/Linux shell rendering and older macOS appearance have not been verified.

## macOS integration limit

The ICNS is the native compiler's rendered Liquid Glass Default artwork. Current Tauri bundle configurations consume only the ICNS. Dedicated Dark/Clear/Tinted system variants additionally require the compiled Assets.car and CFBundleIconName=OMD, which are prepared in the approved portable asset kit but are not yet wired into app packaging. Do not treat the ICNS alone as full dynamic appearance integration. The editable Icon Composer source is retained here so that integration can be completed in a fresh app build, followed by resource checks, materials binding and signing.

The deployment minimum remains macOS 13.5. No installed or signed app is modified by exporting these source assets.
