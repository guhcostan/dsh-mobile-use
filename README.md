# dsh-mobile-use

**Mobile use + live Simulator mirror for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).**
A profile bundle that gives the agent mobile-device tools **and** adds a **Simulator tab to the right
Sidebar** with a live mirror of the booted iOS Simulator — the device lives next to the conversation,
the way Orca-style agents show it.

`MIT` · `DSH 0.2.1-rc.3` · `macOS for iOS Simulator · Android via adb`

---

## What you get

| Piece | What it does |
|---|---|
| `mcp__mobile__*` tools | The [mobile-next/mobile-mcp](https://github.com/mobile-next/mobile-mcp) server through DSH's MCP client: list devices, tap/type/swipe, screenshots, app launch, deep links, orientation, clipboard and more (33 tools) |
| **Simulator tab** (right Sidebar) | A live mirror of the booted iOS Simulator, with device name, status dot and a refresh control. Opened from the right Sidebar guide (compass icon). |
| **Open Simulator** button | Shown when nothing is booted: boots the first available iPhone simulator, opens the Simulator app, then streams its screen here |

The mirror is **view-only** on purpose: the human watches, the agent acts through the
`mcp__mobile__*` tools. Both see the same device.

## Requirements

- **DeepSeek Harness 0.2.1-rc.3** (web or desktop profile — the tab is part of the Web UI).
- **macOS with Xcode** and an iOS Simulator runtime for the iOS mirror:
  ```sh
  xcrun simctl list runtimes
  xcrun simctl list devices available
  ```
- **Android (optional)**: Android platform-tools (`adb`) on `PATH` and a device/emulator
  connected. The same tab mirrors an Android device when no iOS simulator is booted.
- `npx` available for the mobile MCP server (the bundle's row runs
  `@mobilenext/mobile-mcp`).

## Install

The supported installation path is the DSH **Plugin Manager**; it installs the bundle,
resolves its dependencies and registers it as a profile bundle layer.

1. Clone this repository:

   ```sh
   git clone https://github.com/guhcostan/dsh-mobile-use.git
   ```

2. In a DSH session, ask the agent to install the bundle from that absolute path
   (`plugin_manager` with `action: install_bundle` and the repository directory as `target`).

3. **Reload the Web UI** (or restart the app) so the Client half loads, then open the right
   Sidebar guide (compass) and pick **Simulator**.

> One mobile MCP server per profile: if you already mount a `serverName: mobile` MCP row,
> remove it first or you will have two servers with the same name.

## Use

- **Mirror**: right Sidebar → guide → **Simulator**. The tab shows the booted device and
  refreshes automatically (≈2–4 fps; each frame is a simulator screenshot downscaled to
  1000 px for the mirror).
- **Boot one**: with no simulator running, press **Open Simulator**. The plugin boots the first
  available iPhone, opens Simulator.app and starts mirroring.
- **Agent**: ask things like *“take a screenshot of the iPhone simulator”*, *“open Settings on
  the simulator and tap Wi-Fi”*, or *“launch com.example.app on the Android device”*. The agent
  uses `mcp__mobile__*`.

## Configuration

The bundle works out of the box. Two override points in your profile's `cordis.patch.yml`:

**Use a different mobile MCP version or device backend** — override the `mobile-mcp` row
(an override replaces the whole `config`):

```yaml
- id: mobile-mcp
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: mobile
    transport: stdio
    command: npx
    args: ['-y', '@mobilenext/mobile-mcp@1.0.8']
    env:
      MOBILEMCP_DISABLE_TELEMETRY: '1'
    toolCallTimeoutMs: 120000
    failOnStartupError: false
```

**Point the mirror at one specific simulator** — the tab follows the first booted device, iOS
first. Open the one you want before any other, or use the agent's device-id-based tools.

## How it works

```
dsh-mobile-use/
├── package.json          # dsh.bundle.patch + dsh.client manifest + display metadata
├── cordis.patch.yml      # mobile MCP row + this plugin's row
├── index.js              # Host: authenticated /api/mobile-mirror/* routes
├── client.js             # Client: right-Sidebar tab type + guide entry + mirror UI
├── locale/{en,zh}.json   # Plugin Manager title/description
├── icon.svg              # bundle icon
└── scripts/check.sh      # Xcode / adb preflight
```

The **Host half** (`index.js`) registers exact Fetch routes through DSH's `connection`
service, so they inherit the app's authenticated origin (the browser session cookie):

- `GET /api/mobile-mirror/status` — booted devices;
- `GET /api/mobile-mirror/frame.png` — one PNG screenshot (`xcrun simctl io … screenshot`
  for iOS, `adb exec-out screencap -p` for Android), downscaled to 1000 px with `sips`
  when available;
- `POST /api/mobile-mirror/launch` — boot the first available iPhone and open Simulator.app.

The **Client half** (`client.js`) registers a page tab type through
`ctx.sidebarRightTabs.register({ id, kind, title, guide })` plus its body in the
`sidebar.right.pane.tab` slot under the same id. The body polls the status route and pumps
frames sequentially through a hidden `Image` preload, swapping `src` only after the next frame
decodes, so the mirror does not flicker or pile up requests.

The mirror never leaves the machine: routes are served by the DSH origin and only the local
browser session can read them.

## Limitations

- **Frames, not video** — each frame is a screenshot; expect ~2–4 fps depending on the
  machine and the simulator. Good for watching state, not for judging animation.
- **View-only** — clicking the mirror does not inject input. Use the agent tools for that
  (and the same device state is what you see).
- **One device at a time** — the tab mirrors the first booted device (iOS preferred).
- **Android needs `adb`** and a connected device; the mirror falls back to Android only when
  no iOS simulator is booted.
- **macOS only for iOS**; other platforms can still use the Android path.

## Troubleshooting

- **The guide has no Simulator card** — reload the Web UI (or restart the app) so the
  Client half loads; client plugins are mounted at page boot.
- **The tab stays on “Connecting…”** — the Host half may still be running a previous module
  generation after an in-place update. Toggle the plugin off/on in the Plugin Manager, or
  restart the app. On a fresh install the first frame normally arrives within a second.
- **Frame endpoint errors** — check `xcrun simctl list devices booted` and, for Android,
  `adb devices`. The status route reads the same sources.
- **No simulator device at all** — create one in Xcode
  (`xcrun simctl create …`) or press **Open Simulator** in the tab.

## Version compatibility

DSH prereleases require plugins whose dependencies match the running build exactly. This
release is pinned to **0.2.1-rc.3** (`@deepseek-ai/dsh-mcp-client`). When your DSH updates,
update that dependency to the same build and reinstall the bundle.

## License

[MIT](./LICENSE) © 2026 Gustavo Costa

This bundle wires `@mobilenext/mobile-mcp` and uses Xcode/`adb` tooling installed on the host.
Those projects keep their own licenses and support terms; this repository contains only the
composition, mirror routes, tab UI, documentation and artwork.
