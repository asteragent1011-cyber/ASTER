# Setting up ASTER on macOS and Windows

This guide takes you from a fresh machine to a running ASTER, two ways:

- **Development mode** runs ASTER from source: three processes you start yourself, with the UI
  reloading as you edit. Use it to work on ASTER.
- **A packaged app** is the installable `ASTER.app` (macOS) or `ASTER-<version>-setup.exe`
  (Windows). It carries its own server and needs nothing else running. Use it to *use* ASTER.

> **What was tested.** Every macOS command below was run on macOS (Apple Silicon) while writing this
> guide. The Windows commands follow the repository's scripts and CI configuration but were **not**
> run on a Windows machine; they are marked *Not yet verified on Windows*.

---

## How ASTER is put together

Knowing the three pieces makes every step below make sense:

| Piece | What it is | Runs as |
|---|---|---|
| **Server** (`server/`) | Owns your bots, conversations and settings, and starts the agent CLIs (Claude Code, Codex, …). Serves the API on `http://127.0.0.1:8799`. | `pnpm dev:server` in development; built into the packaged app |
| **Web UI** (`src/`) | The interface, a React app. | `pnpm dev` serves it on `http://127.0.0.1:5199` and forwards `/api` to the server |
| **Desktop shell** (`electron/`) | The app window, Dock/taskbar icon, tray, menus, permissions. | `pnpm dev:desktop` in development; it is the packaged app |

In development the desktop shell does **not** start the server for you: start the server and the web
UI first. The packaged app starts its own server.

Your data (bots, transcripts, settings) lives in `~/.openmausbot` on macOS and
`%USERPROFILE%\.openmausbot` on Windows. The folder keeps its original name so existing installs keep
working. Development and the packaged app use the same folder unless you point one elsewhere (see
[Environment variables](#environment-variables)).

---

## What you need

| | macOS | Windows |
|---|---|---|
| OS | macOS 12 Monterey or newer | Windows 10 or 11, 64-bit (x64) |
| Hardware | Apple Silicon (arm64) or Intel (x64) | x64. There is no Windows-on-ARM package. |
| Node.js | **24 or newer** (`package.json` → `engines`) | **24 or newer** |
| pnpm | **10.33.0**, pinned in `package.json`; Corepack installs it | same |
| Git | any recent version | Git for Windows |
| An agent CLI | at least one, installed and signed in: [Claude Code](https://claude.com/claude-code) (`claude`) or [Codex](https://github.com/openai/codex) (`codex`) | same |
| To package the app | Xcode Command Line Tools (for the Swift speech helper) | nothing extra (see below) |

**No C/C++ toolchain is needed.** ASTER has no native Node modules to compile: the only install-time
builds are `electron` and `esbuild` (listed under `onlyBuiltDependencies` in `pnpm-workspace.yaml`),
and both download prebuilt binaries. You do **not** need Visual Studio Build Tools or the Windows SDK.

Packaging downloads a few pinned, checksum-verified tools (Cloudflare Tunnel, a browser engine,
Android platform tools and the computer-use driver), so it needs an internet connection.

---

## macOS

### 1. Install the tools

Install [Node.js 24 or newer](https://nodejs.org) (the installer or `brew install node`), then:

```sh
# Turn on Corepack, which ships with Node and installs the exact pnpm version ASTER pins
corepack enable

# Check the versions
node -v      # v24.x or newer
pnpm -v      # 10.33.0
git --version
```

To build the packaged app you also need Apple's command-line tools, which provide Swift:

```sh
xcode-select --install   # skip if `xcode-select -p` already prints a path
swift --version          # confirms Swift is available
```

### 2. Get the code

```sh
git clone https://github.com/asteragent1011-cyber/ASTER.git
cd ASTER
```

### 3. Install dependencies

```sh
pnpm install --frozen-lockfile
```

`--frozen-lockfile` installs exactly the versions in `pnpm-lock.yaml`, so your setup matches CI. The
install also sets up the repository's git hooks.

### 4. Run in development mode

Open **three terminal windows** in the `ASTER` folder and run one command in each:

```sh
# Terminal 1: the server, on http://127.0.0.1:8799
pnpm dev:server
```

```sh
# Terminal 2: the web UI, on http://127.0.0.1:5199
pnpm dev
```

```sh
# Terminal 3: the desktop window (optional; you can also use the web UI in a browser)
pnpm dev:desktop
```

- You can use ASTER in a browser at **http://127.0.0.1:5199** with only terminals 1 and 2.
- `pnpm dev:desktop` first stages Cloudflare Tunnel for your Mac (`prepare-cloudflared.mjs --current`),
  then opens an Electron window that loads `http://127.0.0.1:5199`.
- **Quit the packaged ASTER first.** Only one ASTER desktop app can run at a time; if the packaged app
  is open, `pnpm dev:desktop` prints `ASTER is already running — focusing that window` and exits.
- Stop any of them with `Ctrl+C`.

### 5. Build the packaged app

The one-command build makes a `.dmg` and a `.zip` for **both** Apple Silicon and Intel:

```sh
pnpm package:mac
```

That runs, in order:

1. `pnpm package:prepare`: typechecks and builds the UI (`dist/`), bundles the server
   (`dist-server/`), and stages the companion, updater, Android tools, Cloudflare Tunnel and browser engine.
2. `pnpm build:speech`: compiles the native speech-recognition helper (`ASTER Speech.app`) with Swift
   as a universal (arm64 + x86_64) binary.
3. `pnpm build:cua`: stages the computer-use driver. It uses `/Applications/CuaDriver.app` if that
   exact version is installed, otherwise it downloads the checksummed release.
4. `electron-builder --mac`: writes the app, `.dmg` and `.zip` to `release/`.

**Building only for your own Mac (faster).** On some Apple Silicon Macs the Intel half of the speech
helper fails to link (see [Troubleshooting](#macos-troubleshooting)). To build just for the Mac you are
on, run the steps yourself with one architecture:

```sh
pnpm package:prepare

# The speech helper for this Mac's architecture only (arm64 shown; use x86_64 on an Intel Mac)
mkdir -p "electron/resources/ASTER Speech.app/Contents/MacOS"
cp electron/resources/speech-helper-Info.plist "electron/resources/ASTER Speech.app/Contents/Info.plist"
swiftc -O -target arm64-apple-macos12 electron/resources/speech-helper.swift \
  -o "electron/resources/ASTER Speech.app/Contents/MacOS/speech-helper"

pnpm build:cua

# An unpacked app (no .dmg) for this architecture only; use --x64 on an Intel Mac
pnpm exec electron-builder --mac dir --arm64 --publish never
```

### 6. Launch the packaged app

```sh
open release/mac-arm64/ASTER.app     # release/mac/ASTER.app on an Intel Mac
```

Or open the `.dmg` from `release/` and drag ASTER to Applications.

Local builds are **not signed** with an Apple Developer ID. An app you built yourself opens normally.
A build downloaded from someone else may be blocked by Gatekeeper the first time: right-click it,
choose **Open**, then **Open** again.

### 7. Permissions

macOS asks the first time a feature needs them. If you said no, turn them on in
**System Settings → Privacy & Security**:

| Permission | Shown for | Needed by |
|---|---|---|
| **Microphone** | ASTER / ASTER Speech | Dictation and voice calls |
| **Speech Recognition** | ASTER Speech | Turning your voice into text, on this Mac |
| **Accessibility** and **Screen Recording** | CuaDriver | Letting a bot use this Mac ("This computer") |

Dictation runs through a small helper app inside ASTER, `ASTER Speech.app`; that is the name you see
in the Speech Recognition list. Because local builds are not signed with a stable Developer ID,
**macOS may ask again after you rebuild the app**: that is macOS treating the new build as a new
program, and you simply allow it again.

To reset the Speech Recognition answer and be asked again:

```sh
tccutil reset SpeechRecognition com.openmausbot.app.speech-helper
```

### macOS troubleshooting

| What you see | Why | Fix |
|---|---|---|
| `error: link command failed` … `swiftc -O -target x86_64-apple-macos12` during `pnpm package:mac` | The Intel slice of the speech helper does not link on this Apple Silicon Mac's toolchain | Build for your own architecture only (step 5, second block) |
| `ASTER is already running — focusing that window` and `pnpm dev:desktop` exits | The packaged app is open, and only one ASTER desktop can run | Quit the packaged ASTER (⌘Q), then run `pnpm dev:desktop` |
| `pnpm dev:server` stops with `Error: listen EADDRINUSE: address already in use 127.0.0.1:8799` | The packaged app's server already uses port 8799 | Quit the packaged app, or run the dev server on another port: `ASTER_PORT=8899 pnpm dev:server` **and** `ASTER_PORT=8899 pnpm dev` |
| The web UI shows **Connecting to the bot server…** | The server is not running, or the UI is forwarding to the wrong port | Start `pnpm dev:server`; give both commands the same `ASTER_PORT` |
| `Error: ENOTEMPTY: directory not empty, rmdir '…/node_modules/.vite/deps'` from `pnpm dev` | Vite's dependency cache was left half-cleared | `rm -rf node_modules/.vite` and run `pnpm dev` again; it rebuilds the cache |
| `pnpm` says the Node version is unsupported | Node is older than 24 | Install Node 24+ |
| `ERR_PNPM_OUTDATED_LOCKFILE` | `package.json` and `pnpm-lock.yaml` disagree | Pull the latest code; do not drop `--frozen-lockfile` to get past it |
| The model picker is empty | No agent CLI is installed or signed in | Install and sign in to `claude` or `codex`, then reopen the picker |

---

## Windows

> *Not yet verified on Windows.* These steps follow `package.json`, `electron-builder.yml` and the
> Windows CI jobs, but were written on macOS. Please report anything that differs.

### 1. Install the tools

Install [Node.js 24 or newer](https://nodejs.org) (the Windows x64 installer) and
[Git for Windows](https://git-scm.com/download/win). Then, in **PowerShell**:

```powershell
# Turn on Corepack, which installs the exact pnpm version ASTER pins.
# Run this PowerShell window as Administrator if it reports a permissions error.
corepack enable

node -v      # v24.x or newer
pnpm -v      # 10.33.0
git --version
```

You do **not** need Visual Studio Build Tools or the Windows SDK (see [What you need](#what-you-need)).

### 2. Get the code

```powershell
git clone https://github.com/asteragent1011-cyber/ASTER.git
cd ASTER
```

### 3. Install dependencies

```powershell
pnpm install --frozen-lockfile
```

### 4. Run in development mode

Open **three PowerShell windows** in the `ASTER` folder:

```powershell
# Window 1: the server, on http://127.0.0.1:8799
pnpm dev:server
```

```powershell
# Window 2: the web UI, on http://127.0.0.1:5199
pnpm dev
```

```powershell
# Window 3: the desktop window (optional)
pnpm dev:desktop
```

As on macOS, quit the installed ASTER first: only one ASTER desktop app can run at a time. On Windows,
closing the ASTER window hides it to the system tray; choose **Quit ASTER** from the tray icon's menu to
exit completely.

### 5. Build the packaged app

Windows packages must be built **on Windows x64**: the computer-use step (`pnpm build:cua:win`) refuses
to run anywhere else (`prepare-cua-win requires Windows x64`).

```powershell
pnpm package:win
```

That runs `pnpm package:prepare`, then `pnpm build:cua:win`, then `electron-builder --win`, and writes to
`release\`:

- `ASTER-<version>-setup.exe`: the installer
- a `.zip` of the same app, for a portable copy

You can also build it without a Windows PC: the repository's `package-win.yml` GitHub Actions workflow
runs the same build on GitHub's Windows machines.

### 6. Launch the packaged app

Double-click `release\ASTER-<version>-setup.exe`. It installs for your user only (no administrator
prompt) and creates an **ASTER** shortcut in the Start menu.

The installer is **not code-signed yet**, so Windows SmartScreen may say "Windows protected your PC"
or "Unknown publisher". Make sure the file came from your own build or the official
[ASTER releases page](https://github.com/asteragent1011-cyber/ASTER/releases), then choose
**More info → Run anyway**. Microsoft Defender may also scan the new app the first time it starts,
which can make that first launch slow.

### 7. Permissions and Windows settings

| Setting | Where | Needed by |
|---|---|---|
| **Microphone** | Settings → Privacy & security → Microphone → turn on **Let desktop apps access your microphone** | Voice features |
| **Notifications** | Settings → System → Notifications → ASTER | Message and approval notifications |
| **Firewall** | Windows may ask whether ASTER can use the network | ASTER only listens on `127.0.0.1` (this PC) by default. Allow private networks only if you pair a phone over Wi-Fi. |

**Known limitation:** on-device dictation uses Apple's speech engine and is available on macOS only.
The Windows app reports dictation as unsupported, so voice input (dictation and voice calls) does not
yet work on Windows.

### Windows troubleshooting

| What you see | Why | Fix |
|---|---|---|
| `prepare-cua-win requires Windows x64` | `pnpm package:win` was run on macOS, Linux or Windows on ARM | Build on a Windows x64 PC, or use the `package-win.yml` workflow |
| `pnpm : … running scripts is disabled on this system` | PowerShell's execution policy blocks the `pnpm` shim | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use `corepack pnpm …` instead |
| `corepack enable` reports a permissions error | Corepack writes next to Node's install | Run that one command in PowerShell as Administrator |
| ASTER keeps running after you close its window | Closing hides it to the tray | Right-click the tray icon → **Quit ASTER** |
| Port 8799 already in use | The installed ASTER is running, or an earlier dev server | Quit ASTER from the tray, or use another port: `$env:ASTER_PORT = "8899"` in both windows before `pnpm dev:server` and `pnpm dev` |

---

## Environment variables

**You can skip this section:** local chat needs no configuration, and keys for integrations
(Composio, voices, the decision model) are best entered in **App Settings** inside ASTER. They are
stored on your machine and never shown again.

Environment variables are for overrides. The server **does not read a `.env` file**: set variables in
the terminal you start it from. Every `ASTER_*` name also accepts its older `OMB_*` form.

| Variable | Purpose | Default |
|---|---|---|
| `ASTER_PORT` | Server port. Give `pnpm dev` the same value so the UI forwards to it. | `8799` |
| `ASTER_UI_PORT` | Port of the development web UI (`pnpm dev`) | `5199` |
| `ASTER_DATA_DIR` | Where bots, transcripts and settings are kept | `~/.openmausbot` |
| `DECIDER_PROVIDER` | Decision engine for Auto rooms: `jev`, `clef-flash` or `off` | `jev` |

macOS / Linux, for one command:

```sh
ASTER_PORT=8899 ASTER_DATA_DIR="$HOME/aster-test-data" pnpm dev:server
```

Windows PowerShell, for the current window:

```powershell
$env:ASTER_PORT = "8899"
$env:ASTER_DATA_DIR = "$env:USERPROFILE\aster-test-data"
pnpm dev:server
```

A separate `ASTER_DATA_DIR` gives you a throwaway setup that cannot touch your real bots: useful for
trying things out.

**About `.env.example`.** It documents the variables for the **Docker Compose deployment**
(`docker compose`), plus optional decision-engine and ElevenLabs keys. If you use Compose, copy it to
`.env` and fill in what you need:

```sh
cp .env.example .env          # macOS / Linux
```

```powershell
Copy-Item .env.example .env   # Windows
```

`.env` is git-ignored so your keys are never committed. Never put real keys in `.env.example`, in
documentation, or in an issue or chat.

---

## Development vs. production at a glance

| You want to… | Do this |
|---|---|
| Work on ASTER's code | Development mode: `pnpm dev:server` + `pnpm dev` (+ `pnpm dev:desktop`) |
| Check that the code builds | `pnpm typecheck`, `pnpm lint`, `pnpm build` (writes the production UI to `dist/`) |
| Make an installable app | `pnpm package:mac` (on a Mac) or `pnpm package:win` (on Windows x64); output in `release/` |
| Use ASTER day to day | Install and open the packaged app; it runs its own server on port 8799 |
| Point the development UI at a server that is already running | Start `pnpm dev` with that server's port, e.g. `ASTER_PORT=8799 pnpm dev` to use the packaged app's server and data in your browser at http://127.0.0.1:5199 |
| Run the server without the app (a home server or another machine) | `pnpm aster setup`, then `pnpm aster serve`; `pnpm pair` mints a code to pair another device. Self-hosting and Docker: [`docs/self-hosting.md`](self-hosting.md) |

The development UI only forwards to a server on **this** machine (`127.0.0.1`).

---

## Checking your setup

```sh
pnpm typecheck        # TypeScript, app and server
pnpm lint             # code style; warnings fail
pnpm build            # production UI build
pnpm exec vitest run <files>   # run specific tests
```

---

## How this guide was verified

| Step | macOS (Apple Silicon, macOS 27, Node 26, pnpm 10.33.0) | Windows |
|---|---|---|
| `pnpm install --frozen-lockfile` | ✓ ran | not run |
| `pnpm dev:server` (on a separate port and data folder) | ✓ `/api/health` answered 200; the port-in-use error above was reproduced | not run |
| `pnpm dev` and its `/api` forwarding | ✓ UI and forwarded `/api/health` answered 200 | not run |
| `pnpm dev:desktop` | ✓ window opened; also confirmed it exits while the packaged app is running | not run |
| Packaged build (single-architecture steps) and `ASTER.app` | ✓ built and launched repeatedly | not run |
| `pnpm package:mac` (both architectures) | ✗ the Intel speech helper failed to link on this Mac (documented above) | n/a |
| `pnpm package:win` | n/a: requires Windows x64 | not run |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | ✓ | not run |
