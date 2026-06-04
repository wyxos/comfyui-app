# ComfyUI Companion App

Local Vue companion UI and Node server for ComfyUI workflows.

The app is a personal workbench for running ComfyUI with many local assets. It helps discover
models, queue Civitai downloads, preserve model metadata, assemble generation workflows, track
jobs, preview outputs, and reuse generated images.

## Features

- Generate images through ComfyUI from a structured UI.
- Select multiple checkpoints, each with its own LoRAs and ControlNets.
- Build SDXL-compatible and Anima workflows from local model metadata.
- Upload or reuse images for img2img and ControlNet inputs.
- Improve prompts with a local Ollama model.
- Search Civitai, inspect model/image metadata, and queue downloads.
- Track Civitai download state, previews, sidecars, and local model library entries.
- Track ComfyUI jobs, queue state, history, progress, outputs, cancellation, and errors.
- Use the MV3 browser extension to queue Civitai models from Civitai pages into the local app.

## Commands

```sh
npm install
npm run dev
npm run build
npm run lint
npm run test:unit
npm run test:e2e
npm run start
```

Extension commands:

```sh
npm run extension:build
npm run extension:package
npm run extension:package:local
```

`npm run extension:package:local` may mutate `extension/manifest.json` by applying a Codex-selected
version bump. Use `npm run extension:build` or `npm run extension:package` without `--bump` when you
only want a validation/package pass.

## Runtime Endpoints

The local server defaults to:

- Companion app: `http://127.0.0.1:3210`
- ComfyUI: `http://127.0.0.1:8000`
- Ollama: `http://127.0.0.1:11434`

Environment overrides:

| Variable | Purpose | Default |
| --- | --- | --- |
| `COMFY_COMPANION_HOST` | Companion server host | `127.0.0.1` |
| `COMFY_COMPANION_PORT` | Companion server port | `3210` |
| `COMFYUI_URL` | ComfyUI base URL | `http://127.0.0.1:8000` |
| `COMFYUI_CLIENT_ID` | Client id used for ComfyUI prompt submission and websocket tracking | `comfyui-companion-app` |
| `COMFYUI_DEFAULT_CHECKPOINT` | Preferred default checkpoint name | `waiIllustriousSDXL_v160.safetensors` |
| `OLLAMA_URL` | Ollama base URL | `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Preferred local prompt-improvement model | `gpt-oss:20b` |
| `OLLAMA_TIMEOUT_MS` | Ollama request timeout | `600000` |

## App State Paths

The app stores machine-local state in a config directory:

```text
COMFY_COMPANION_CONFIG_DIR
APPDATA/comfyui-companion-app
XDG_CONFIG_HOME/comfyui-companion-app
~/.config/comfyui-companion-app
```

Resolution order:

1. `COMFY_COMPANION_CONFIG_DIR`, when set.
2. `APPDATA/comfyui-companion-app`, when `APPDATA` is set. This is the normal Windows path, for example `C:\Users\<user>\AppData\Roaming\comfyui-companion-app`.
3. `XDG_CONFIG_HOME/comfyui-companion-app`, when `XDG_CONFIG_HOME` is set.
4. `~/.config/comfyui-companion-app`.

Files under that config directory:

| Path | Purpose |
| --- | --- |
| `settings.json` | Civitai API key and app preferences such as `includeNsfw`. |
| `downloads.json` | Persisted Civitai download state. |
| `downloads.json.bak` | Backup used during atomic download-state writes. |
| `downloads.json.<pid>.<timestamp>.tmp` | Temporary file used while persisting download state. |
| `jobs.sqlite` | Persisted ComfyUI job history and serialized job state. |
| `model-metadata-cache/*.civitai.info` | Fallback Civitai metadata cache when metadata cannot be written next to a model file. |

Do not commit files from this config directory. They can contain local paths, download state,
job history, and a saved Civitai API key.

## ComfyUI File Paths

The app discovers ComfyUI directories from environment variables first, then from ComfyUI
`/system_stats` arguments.

| Variable | Purpose |
| --- | --- |
| `COMFYUI_OUTPUT_DIR` | ComfyUI output directory used for generated output paths and `/api/view`. |
| `COMFYUI_INPUT_DIR` | ComfyUI input directory used for uploaded image inputs and ControlNet images. |
| `COMFYUI_LORA_DIR` | ComfyUI LoRA directory. |
| `COMFYUI_CHECKPOINT_DIR` | ComfyUI checkpoint directory. |
| `COMFYUI_CONTROLNET_DIR` | ComfyUI ControlNet directory. |

If a model directory variable is not set, the app tries to infer it from the parent of the
ComfyUI input or output directory:

```text
<comfy-root>/models/checkpoints
<comfy-root>/models/loras
<comfy-root>/models/controlnet
<comfy-root>/models/controlnets
```

Civitai downloads are written directly into the matching ComfyUI model directory:

| Civitai model type | Target directory |
| --- | --- |
| `Checkpoint` | `COMFYUI_CHECKPOINT_DIR` or inferred `models/checkpoints` |
| `LORA` | `COMFYUI_LORA_DIR` or inferred `models/loras` |
| `ControlNet` | `COMFYUI_CONTROLNET_DIR` or inferred `models/controlnet(s)` |

For each completed Civitai download, the app may write related files next to the downloaded model:

| Path pattern | Purpose |
| --- | --- |
| `<model>.civitai.info` | Civitai model/version metadata sidecar. |
| `<model>.preview.<ext>` | Primary downloaded preview image or video. |
| `<model>.previews/` | Preview gallery directory. |
| `<model>.part` | Temporary partial download file while a model is downloading. |

Manual compatibility edits from the Library write:

```text
<model>.companion.info
```

next to the relevant checkpoint, LoRA, or ControlNet file.

## Browser Extension Paths

The extension expects the local companion server at `http://127.0.0.1:3210`.

`npm run extension:build` writes the extension build to:

```text
extension/dist
```

`npm run extension:package` copies the unpacked extension to a stable browser-load directory.
Target directory resolution order:

1. `--target-dir` or `--extract-dir`
2. `COMFYUI_COMPANION_EXTENSION_DIR`
3. `COMPANION_EXTENSION_LOCAL_DIR`
4. `~/Downloads/comfyui-companion-extension`

## Repository Hygiene

The repository should only commit source, tests, docs, package manifests, and extension source.
The following are local/generated and intentionally ignored:

- `node_modules/`
- `dist/`
- `extension/dist/`
- `coverage/`
- `output/`
- `.codex/`
- `.codex-logs/`
- `.idea/`
- `.playwright-cli/`
- `.vitest-attachments/`
- `tests/e2e/__screenshots__/`

Do not commit local config files, generated ComfyUI outputs, model files, Civitai downloads,
download state, job databases, API keys, or sidecars from a personal ComfyUI installation.
