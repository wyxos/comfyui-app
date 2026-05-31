# ComfyUI Companion Extension

Chrome/Edge extension that adds a Civitai page CTA for queueing a model version in the local ComfyUI Companion app.

## Build

```sh
npm run extension:build
```

Load the unpacked extension from `extension/dist`.

The extension expects the companion server at `http://127.0.0.1:3210`.

## Package for local browser reload

```sh
npm run extension:package
```

That rebuilds the extension and copies the unpacked package to `~/Downloads/comfyui-companion-extension`.
Load or reload that directory from the browser extensions page.

For the local reload workflow, use:

```sh
npm run extension:package:local
```

That asks Codex to choose the extension semver bump (`major`, `minor`, or `patch`) from the extension changes, updates `extension/manifest.json`, then packages the unpacked extension. You can still force a bump with `npm run extension:package -- --bump=patch` or set an exact version with `npm run extension:package -- --version=1.2.3`.

To use another local directory:

```sh
npm run extension:package -- --target-dir "C:/Users/joeyj/Downloads/comfyui-companion-extension"
```

You can also set `COMFYUI_COMPANION_EXTENSION_DIR` or `COMPANION_EXTENSION_LOCAL_DIR`.
