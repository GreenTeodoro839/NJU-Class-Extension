;(function announceNjuClassHelper() {
  'use strict'

  if (globalThis.location?.origin !== 'https://njuclass.zcec.top') return

  const userscriptVersion = typeof GM_info === 'object'
    ? GM_info?.script?.version
    : null
  let extensionVersion = null
  if (!userscriptVersion) {
    try {
      extensionVersion = globalThis.chrome?.runtime?.getManifest?.().version
    } catch {
      extensionVersion = null
    }
  }

  const source = userscriptVersion ? 'userscript' : 'extension'
  const rawVersion = userscriptVersion || extensionVersion
  const version = typeof rawVersion === 'string' ? rawVersion.trim() : ''
  if (!version) return

  function markInstalled() {
    const root = document.documentElement
    if (!root) return false

    root.dataset.njuclassHelperVersion = version
    root.dataset.njuclassHelperSource = source
    root.dispatchEvent(new Event('njuclass-helper-ready', {
      bubbles: true,
      composed: true,
    }))
    return true
  }

  if (markInstalled()) return

  const observer = new MutationObserver(() => {
    if (!markInstalled()) return
    observer.disconnect()
  })
  observer.observe(document, { childList: true, subtree: true })
})()
