import { messageSchema, trustedUI } from '../core/protocol';
import { Scanner } from './scanner';
import { Filler } from './filler';
const root = globalThis as typeof globalThis & { __profilevaultInstalled?: boolean };
if (!root.__profilevaultInstalled) {
  root.__profilevaultInstalled = true;
  const scanner = new Scanner(),
    filler = new Filler(scanner);
  const invalidate = () => {
    filler.undo.clear();
    scanner.records.clear();
    scanner.scanId = '';
  };
  window.addEventListener('popstate', invalidate);
  window.addEventListener('hashchange', invalidate);
  (window as Window & { navigation?: EventTarget }).navigation?.addEventListener(
    'navigate',
    invalidate,
  );
  chrome.runtime.onMessage.addListener((input, sender, respond) => {
    const ownWorker =
      sender.id === chrome.runtime.id &&
      sender.url === chrome.runtime.getURL('background/service-worker.js');
    if (!trustedUI(sender) && !(ownWorker && input?.type === 'CLEAR')) return;
    const result = messageSchema.safeParse(input);
    if (!result.success) {
      respond({ error: 'INVALID_MESSAGE' });
      return;
    }
    const message = result.data;
    if (message.type === 'SCAN') {
      filler.undo.clear();
      respond(scanner.scan());
    }
    if (message.type === 'CLEAR') {
      invalidate();
      respond({ ok: true });
    }
    if (message.type === 'UNDO')
      respond(
        message.documentToken === scanner.documentToken &&
          scanner.isCurrentDocument() &&
          !!scanner.scanId
          ? filler.undo.restore()
          : [{ fieldId: '', status: 'changed', reason: '页面变化' }],
      );
    if (message.type === 'FILL') {
      filler
        .fill(message.plan)
        .then(respond)
        .catch(() => respond({ error: 'STALE_OR_INVALID_PLAN' }));
      return true;
    }
  });
}
