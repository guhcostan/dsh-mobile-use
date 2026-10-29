/**
 * dsh-mobile-use — Host half.
 *
 * Registers authenticated routes on the DSH web application origin, through the
 * connection service's exact-Fetch route registry:
 *
 *   GET  /api/mobile-mirror/status     — booted devices (iOS simulators, Android)
 *   GET  /api/mobile-mirror/frame.png  — one PNG screenshot of the selected device
 *   POST /api/mobile-mirror/launch     — boot the first available iPhone simulator
 *
 * The Client half (client.js) polls these routes from the right-Sidebar tab. They
 * use the same origin as the app, so the browser session cookie authenticates
 * them; nothing is exposed on the network.
 *
 * @module dsh-mobile-use
 */
import { execFile } from 'node:child_process'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const STATUS_TTL_MS = 1000
const MAX_BUFFER = 64 * 1024 * 1024
const MIRROR_MAX_EDGE = 1000
const IOS_PREFIX = 'com.apple.CoreSimulator.SimRuntime.'

let devicesCache = { at: 0, devices: [] }
let frameSeq = 0

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/**
 * List booted devices: iOS simulators first, then Android devices via adb when
 * the Android platform tools are installed.
 * @returns {Promise<Array<{id: string, name: string, platform: string, runtime: string}>>}
 */
async function listBootedDevices() {
  if (Date.now() - devicesCache.at < STATUS_TTL_MS) return devicesCache.devices
  const devices = []

  try {
    const { stdout } = await run('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], {
      maxBuffer: MAX_BUFFER,
    })
    const payload = JSON.parse(stdout)
    for (const [runtime, list] of Object.entries(payload.devices ?? {})) {
      for (const device of list ?? []) {
        if (device.state !== 'Booted') continue
        devices.push({
          id: device.udid,
          name: device.name,
          platform: 'ios',
          runtime: runtime.replace(IOS_PREFIX, '').replace(/-/g, '.'),
        })
      }
    }
  } catch {
    /* Xcode absent or no simulator service: fall through to Android. */
  }

  try {
    const { stdout } = await run('adb', ['devices'], { maxBuffer: MAX_BUFFER })
    for (const line of stdout.split('\n').slice(1)) {
      const [id, state] = line.trim().split(/\s+/)
      if (id && state === 'device') {
        devices.push({ id, name: id, platform: 'android', runtime: 'Android' })
      }
    }
  } catch {
    /* adb absent: no Android devices. */
  }

  devicesCache = { at: Date.now(), devices }
  return devices
}

/**
 * Capture one PNG from a device.
 * @param {{id: string, platform: string}} device
 * @returns {Promise<Buffer>}
 */
async function captureFrame(device) {
  if (device.platform === 'android') {
    const { stdout } = await run('adb', ['-s', device.id, 'exec-out', 'screencap', '-p'], {
      encoding: 'buffer',
      maxBuffer: MAX_BUFFER,
    })
    return stdout
  }
  const file = join(tmpdir(), `dsh-mobile-frame-${process.pid}-${frameSeq++}.png`)
  const scaled = join(tmpdir(), `dsh-mobile-frame-${process.pid}-${frameSeq++}-s.png`)
  try {
    await run('xcrun', ['simctl', 'io', device.id, 'screenshot', '--type=png', file], {
      maxBuffer: MAX_BUFFER,
    })
    // The simulator screenshot is a multi-megabyte Retina PNG; downscale it for
    // the mirror so each frame stays small over the app bridge. sips ships with
    // macOS; when it is unavailable, fall back to the original frame.
    try {
      await run('sips', ['-Z', String(MIRROR_MAX_EDGE), file, '--out', scaled], {
        maxBuffer: MAX_BUFFER,
      })
      return await readFile(scaled)
    } catch {
      return await readFile(file)
    }
  } finally {
    await unlink(file).catch(() => {})
    await unlink(scaled).catch(() => {})
  }
}

/**
 * Boot the first available iPhone simulator when none is booted, then reveal the
 * Simulator application. Idempotent: with a booted device it only opens the app.
 * @returns {Promise<Response>}
 */
async function launchSimulator() {
  const booted = await listBootedDevices()
  if (booted.length > 0) {
    await run('open', ['-a', 'Simulator']).catch(() => {})
    return json({ ok: true, device: booted[0] })
  }

  let candidates = []
  try {
    const { stdout } = await run('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
      maxBuffer: MAX_BUFFER,
    })
    const payload = JSON.parse(stdout)
    for (const [runtime, list] of Object.entries(payload.devices ?? {})) {
      if (!runtime.includes('iOS')) continue
      for (const device of list ?? []) {
        if (device.isAvailable === false) continue
        candidates.push({ id: device.udid, name: device.name })
      }
    }
  } catch {
    return json({ ok: false, error: 'Xcode / iOS Simulator runtime not available.' }, 503)
  }

  if (candidates.length === 0) {
    return json(
      { ok: false, error: 'No iOS simulator device is installed. Create one in Xcode.' },
      409,
    )
  }

  const target = candidates.find((device) => /iPhone/i.test(device.name)) ?? candidates[0]
  try {
    await run('xcrun', ['simctl', 'boot', target.id], { maxBuffer: MAX_BUFFER })
  } catch (error) {
    const message = String(error?.stderr ?? error?.message ?? error)
    if (!/current state: Booted/i.test(message)) {
      return json({ ok: false, error: message }, 500)
    }
  }
  await run('open', ['-a', 'Simulator']).catch(() => {})

  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    const next = await listBootedDevices()
    const found = next.find((device) => device.id === target.id)
    if (found) return json({ ok: true, device: found })
    await sleep(500)
  }
  return json({ ok: false, error: 'The simulator did not finish booting in time.' }, 504)
}

/**
 * GET /api/mobile-mirror/status
 * @returns {Promise<Response>}
 */
async function statusRoute() {
  const devices = await listBootedDevices()
  return json({ devices, selected: devices[0] ?? null })
}

/**
 * GET /api/mobile-mirror/frame.png?device=<id>
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function frameRoute(request) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('device')
  const devices = await listBootedDevices()
  const device = (requested && devices.find((entry) => entry.id === requested)) || devices[0]
  if (!device) return json({ error: 'no booted device' }, 503)
  try {
    const png = await captureFrame(device)
    return new Response(png, {
      headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
    })
  } catch (error) {
    return json({ error: String(error?.message ?? error) }, 502)
  }
}

/**
 * POST /api/mobile-mirror/launch
 * @returns {Promise<Response>}
 */
async function launchRoute() {
  return launchSimulator()
}

/** Required host service: the authenticated Fetch route registry. */
export const inject = ['connection']

/**
 * Register the mirror routes.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  const connection = Reflect.get(ctx, 'connection')
  const routes = [
    { path: '/api/mobile-mirror/status', methods: ['GET'], requestBody: 'buffered', fetch: statusRoute },
    { path: '/api/mobile-mirror/frame.png', methods: ['GET'], requestBody: 'buffered', fetch: frameRoute },
    { path: '/api/mobile-mirror/launch', methods: ['POST'], requestBody: 'buffered', fetch: launchRoute },
  ]
  const disposers = []
  for (const route of routes) {
    const dispose = connection.fetch.register(route)
    if (typeof dispose === 'function') disposers.push(dispose)
  }
  ctx.effect(
    () => () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          /* teardown is best effort */
        }
      }
    },
    'mobile-use:routes',
  )
}
