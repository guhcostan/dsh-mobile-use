window.__ModuleLoader__.load({
  id: 'dsh-mobile-use',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState } = React

    const TYPE_ID = 'dsh-mobile-use'
    const KIND = 'mobile-mirror'
    const STATUS_URL = '/api/mobile-mirror/status'
    const FRAME_URL = '/api/mobile-mirror/frame.png'
    const LAUNCH_URL = '/api/mobile-mirror/launch'
    const FRAME_INTERVAL_MS = 120
    const STATUS_INTERVAL_MS = 3000

    let t = (key) => key

    const en = {
      'type.label': 'Simulator',
      'guide.title': 'Simulator',
      'guide.description': 'Mirror the booted iOS Simulator',
      'empty.title': 'No simulator running',
      'empty.body': 'Boot a simulator and its screen appears here live.',
      'action.launch': 'Open Simulator',
      'action.refresh': 'Refresh',
      'status.connecting': 'Connecting…',
      'status.error': 'Could not read simulator status',
      'aria.mirror': 'Simulator screen mirror',
    }

    const zh = {
      'type.label': '模拟器',
      'guide.title': '模拟器',
      'guide.description': '镜像已启动的 iOS 模拟器',
      'empty.title': '没有运行中的模拟器',
      'empty.body': '启动一个模拟器后，屏幕会实时镜像到这里。',
      'action.launch': '打开模拟器',
      'action.refresh': '刷新',
      'status.connecting': '正在连接…',
      'status.error': '无法读取模拟器状态',
      'aria.mirror': '模拟器屏幕镜像',
    }

    const styles = {
      root: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--dsw-alias-bg-l1, #141414)',
        color: 'var(--dsw-alias-label-secondary, #b8b8b8)',
        font: '12px/1.4 var(--dsw-font-sans, system-ui, sans-serif)',
      },
      header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        flex: 'none',
        padding: '7px 10px',
        borderBottom: '0.5px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.10))',
      },
      headerLeft: { display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 },
      dot: { width: 7, height: 7, borderRadius: '50%', flex: 'none' },
      deviceName: {
        color: 'var(--dsw-alias-label-primary, #f2f2f2)',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      badge: {
        flex: 'none',
        padding: '1px 6px',
        borderRadius: 999,
        border: '0.5px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.16))',
        color: 'var(--dsw-alias-label-tertiary, #8a8a8a)',
        fontSize: 10,
        lineHeight: '15px',
      },
      iconButton: {
        flex: 'none',
        width: 24,
        height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--dsw-radius-sm, 6px)',
        border: '0.5px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.14))',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary, #c8c8c8)',
        cursor: 'pointer',
        fontSize: 14,
        lineHeight: 1,
      },
      stage: {
        position: 'relative',
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: '#000',
      },
      image: {
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        background: '#000',
      },
      placeholder: {
        color: 'var(--dsw-alias-label-tertiary, #8a8a8a)',
        padding: 20,
        textAlign: 'center',
      },
      empty: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: 24,
        textAlign: 'center',
        maxWidth: 320,
      },
      emptyTitle: {
        color: 'var(--dsw-alias-label-primary, #f2f2f2)',
        fontSize: 13,
        fontWeight: 600,
      },
      emptyBody: { color: 'var(--dsw-alias-label-tertiary, #8a8a8a)', fontSize: 12 },
      primary: {
        marginTop: 4,
        padding: '6px 12px',
        borderRadius: 'var(--dsw-radius-sm, 6px)',
        border: '0.5px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.18))',
        background: 'var(--dsw-alias-fill-l2, rgba(255,255,255,0.10))',
        color: 'var(--dsw-alias-label-primary, #f2f2f2)',
        cursor: 'pointer',
        fontSize: 12,
      },
    }

    /** Guide glyph: a phone with a screen. Inherits the tab strip's currentColor. */
    function MirrorGlyph() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 18,
          height: 18,
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('rect', {
          x: 6.5,
          y: 2.5,
          width: 11,
          height: 19,
          rx: 2.6,
          stroke: 'currentColor',
          strokeWidth: 1.7,
        }),
        h('path', {
          d: 'M10 18.4h4',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
        }),
      )
    }

    function Badge({ label }) {
      return h('span', { style: styles.badge }, label)
    }

    function MirrorBody() {
      const [status, setStatus] = useState({
        loading: true,
        devices: [],
        selected: null,
        error: null,
      })
      const [frame, setFrame] = useState(null)
      const [busy, setBusy] = useState(false)
      const [refresh, setRefresh] = useState(0)
      const alive = useRef(true)

      useEffect(() => {
        alive.current = true
        return () => {
          alive.current = false
        }
      }, [])

      useEffect(() => {
        let cancelled = false
        const load = async () => {
          try {
            const response = await fetch(STATUS_URL, {
              headers: { accept: 'application/json' },
              cache: 'no-store',
            })
            if (!response.ok) throw new Error('HTTP ' + response.status)
            const data = await response.json()
            if (cancelled) return
            setStatus({
              loading: false,
              devices: Array.isArray(data.devices) ? data.devices : [],
              selected: data.selected ?? null,
              error: null,
            })
          } catch (error) {
            if (cancelled) return
            setStatus((previous) => ({
              ...previous,
              loading: false,
              error: String((error && error.message) || error),
            }))
          }
        }
        load()
        const timer = setInterval(load, STATUS_INTERVAL_MS)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [refresh])

      const selectedId = status.selected ? status.selected.id : null

      useEffect(() => {
        setFrame(null)
        if (!selectedId) return
        let cancelled = false
        let timer = null
        const pump = () => {
          if (cancelled) return
          const next =
            FRAME_URL + '?device=' + encodeURIComponent(selectedId) + '&t=' + Date.now()
          const image = new Image()
          image.onload = () => {
            if (cancelled) return
            setFrame(next)
            timer = setTimeout(pump, FRAME_INTERVAL_MS)
          }
          image.onerror = () => {
            if (cancelled) return
            timer = setTimeout(pump, 900)
          }
          image.src = next
        }
        pump()
        return () => {
          cancelled = true
          if (timer) clearTimeout(timer)
        }
      }, [selectedId])

      const launch = async () => {
        setBusy(true)
        try {
          await fetch(LAUNCH_URL, { method: 'POST' })
          setRefresh((value) => value + 1)
        } catch {
          /* the status poll reports the failure state */
        } finally {
          setBusy(false)
        }
      }

      const selected = status.selected
      const connecting = !frame && (status.loading || selected)

      return h(
        'div',
        { style: styles.root },
        h(
          'div',
          { style: styles.header },
          h(
            'div',
            { style: styles.headerLeft },
            h('span', {
              style: {
                ...styles.dot,
                background: selected ? '#3fb950' : 'var(--dsw-alias-label-tertiary, #8a8a8a)',
              },
            }),
            h('span', { style: styles.deviceName }, selected ? selected.name : t('empty.title')),
            selected
              ? h(Badge, {
                  label: selected.platform === 'android' ? 'Android' : 'iOS',
                })
              : null,
          ),
          h(
            'button',
            {
              type: 'button',
              style: styles.iconButton,
              title: t('action.refresh'),
              'aria-label': t('action.refresh'),
              onClick: () => setRefresh((value) => value + 1),
            },
            '↻',
          ),
        ),
        h(
          'div',
          { style: styles.stage },
          frame
            ? h('img', {
                key: frame,
                src: frame,
                alt: t('aria.mirror'),
                draggable: false,
                style: styles.image,
              })
            : connecting
              ? h('div', { style: styles.placeholder }, t('status.connecting'))
              : h(
                  'div',
                  { style: styles.empty },
                  h('div', { style: styles.emptyTitle }, t('empty.title')),
                  h(
                    'div',
                    { style: styles.emptyBody },
                    status.error
                      ? t('status.error') + ': ' + status.error
                      : t('empty.body'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      style: styles.primary,
                      disabled: busy,
                      onClick: launch,
                    },
                    busy ? '…' : t('action.launch'),
                  ),
                ),
        ),
      )
    }

    const inject = ['slots', 'locale', 'sidebarRightTabs']

    function apply(ctx) {
      const namespace = 'mobileUse'
      t = ctx.locale.bind(namespace)

      ctx.effect(
        () => ctx.locale.register(namespace, { zh, en }),
        'mobile-use:copy',
      )

      ctx.effect(
        () =>
          ctx.sidebarRightTabs.register({
            id: TYPE_ID,
            kind: KIND,
            title: () => t('type.label'),
            guide: [
              {
                id: 'simulator',
                order: 35,
                title: () => t('guide.title'),
                description: () => t('guide.description'),
                icon: MirrorGlyph,
              },
            ],
          }),
        'mobile-use:type',
      )

      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register(
              { name: 'sidebar.right.pane.tab', key: TYPE_ID },
              MirrorBody,
            ),
          ),
        'mobile-use:body',
      )
    }

    return { inject, apply }
  },
})
