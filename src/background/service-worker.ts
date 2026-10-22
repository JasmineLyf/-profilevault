import { supportedURL, trustedUI } from '../core/protocol';
interface Target {
  tabId: number;
  origin: string;
  title: string;
  allowed: boolean;
  nonce: string;
}
interface Session {
  windowId: number;
  target: Target;
}
let queue = Promise.resolve();
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
chrome.action.onClicked.addListener((tab) => {
  queue = queue
    .then(async () => {
      if (!tab.id) return;
      const old = (await chrome.storage.session.get('session')).session as Session | undefined;
      if (old) {
        try {
          await chrome.windows.update(old.windowId, { focused: true });
          return;
        } catch {
          await chrome.storage.session.remove('session');
        }
      }
      const allowed = supportedURL(tab.url ?? '');
      const target: Target = {
        tabId: tab.id,
        origin: allowed ? new URL(tab.url!).origin : '受限页面',
        title: (tab.title ?? '').slice(0, 256),
        allowed,
        nonce: crypto.randomUUID(),
      };
      const window = await chrome.windows.create({
        url: chrome.runtime.getURL('ui/index.html'),
        type: 'popup',
        width: 1160,
        height: 860,
      });
      if (window?.id)
        await chrome.storage.session.set({ session: { windowId: window.id, target } });
    })
    .catch(() => {
      console.warn('TARGET_WINDOW_FAILED');
    });
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!trustedUI(sender) || message?.type !== 'GET_TARGET' || Object.keys(message).length !== 1)
    return;
  chrome.storage.session
    .get('session')
    .then(async (data) => {
      const s = data.session as Session | undefined;
      respond(s?.target ?? null);
    })
    .catch(() => respond(null));
  return true;
});
chrome.windows.onRemoved.addListener((id) => {
  queue = queue
    .then(async () => {
      const data = await chrome.storage.session.get('session');
      const s = data.session as Session | undefined;
      if (s?.windowId === id) {
        await chrome.tabs
          .sendMessage(s.target.tabId, { type: 'CLEAR' }, { frameId: 0 })
          .catch(() => {});
        await chrome.storage.session.remove('session');
      }
    })
    .catch(() => {
      console.warn('TARGET_CLEANUP_FAILED');
    });
});
