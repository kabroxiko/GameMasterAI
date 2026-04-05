/**
 * Google Identity Services: call initialize() at most once per client_id.
 * Repeated initialize() triggers GSI_LOGGER warnings and can worsen iframe errors.
 */

let initializedForClientId = null;

/**
 * @param {string} clientId
 * @param {(response: { credential?: string }) => void} onCredential
 * @returns {boolean}
 */
export function ensureGsiInitialized(clientId, onCredential) {
  if (!clientId || typeof window === 'undefined' || !window.google?.accounts?.id) {
    return false;
  }
  if (initializedForClientId !== clientId) {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: onCredential,
    });
    initializedForClientId = clientId;
  }
  return true;
}

/**
 * Clear container and render the sign-in button (e.g. after logout or locale change).
 * @param {HTMLElement} el
 * @param {object} renderOptions theme, size, text, shape, locale
 */
export function renderGsiButton(el, renderOptions) {
  if (!el || !window.google?.accounts?.id) return;
  try {
    el.innerHTML = '';
  } catch (e) {
    /* ignore */
  }
  delete el.dataset.gsiRendered;
  window.google.accounts.id.renderButton(el, renderOptions);
  el.dataset.gsiRendered = '1';
}

/**
 * Wait until gsi/client script is available (async defer in index.html).
 * @param {() => void} fn
 * @param {{ maxAttempts?: number, intervalMs?: number }} [opts]
 */
export function whenGsiReady(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 50;
  const intervalMs = opts.intervalMs ?? 100;
  let n = 0;
  const t = setInterval(() => {
    n += 1;
    if (window.google?.accounts?.id) {
      clearInterval(t);
      fn();
    } else if (n >= maxAttempts) {
      clearInterval(t);
    }
  }, intervalMs);
}
