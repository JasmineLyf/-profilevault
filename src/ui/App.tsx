import { useCallback, useEffect, useRef, useState } from 'react';
import { createVault, decrypt, toB64 } from '../core/crypto';
import {
  emptyPayload,
  emptyProfile,
  type Envelope,
  type Payload,
  type Profile,
} from '../core/schema';
import { chromeStorage, VaultRepository } from '../core/vault-repository';
import type { FieldResult, FillPlan, ScanResult } from '../core/protocol';
import { Session } from './session';
import { ProfileEditor } from './components/ProfileEditor';
import { Preview } from './components/Preview';
import { Backup } from './components/Backup';
import { VaultProtection } from './components/VaultProtection';
interface Target {
  tabId: number;
  origin: string;
  title: string;
  allowed: boolean;
  nonce: string;
}
const repo = new VaultRepository(chromeStorage);
export function App() {
  const session = useRef(new Session());
  const [ready, setReady] = useState(false);
  const [deviceMode, setDeviceMode] = useState(false);
  const [setupMode, setSetupMode] = useState<'password' | 'device'>('password');
  const [fatal, setFatal] = useState('');
  const [envelope, setEnvelope] = useState<Envelope>();
  const [payload, setPayload] = useState<Payload>();
  const [pass, setPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [tab, setTab] = useState<'profiles' | 'fill' | 'backup'>('profiles');
  const [active, setActive] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [scan, setScan] = useState<ScanResult>();
  const [results, setResults] = useState<FieldResult[]>();
  const [resultLabels, setResultLabels] = useState<Record<string, string>>({});
  const [undoDeadline, setUndoDeadline] = useState(0);
  const [lockedBackup, setLockedBackup] = useState(false);
  const targetRef = useRef<Target | null>(null);
  const undoToken = useRef('');
  const clearPage = useCallback(() => {
    const t = targetRef.current;
    if (t) void chrome.tabs.sendMessage(t.tabId, { type: 'CLEAR' }, { frameId: 0 }).catch(() => {});
  }, []);
  const lock = useCallback(
    (message = '资料库已锁定。') => {
      session.current.lock();
      setPayload(undefined);
      setPass('');
      setConfirmPass('');
      setScan(undefined);
      setResults(undefined);
      setResultLabels({});
      setUndoDeadline(0);
      setDirty(false);
      setStatus(message);
      clearPage();
    },
    [clearPage],
  );
  const check = useCallback(() => {
    try {
      return session.current.check();
    } catch {
      lock('会话已过期，请重新解锁。');
      throw Error('LOCKED');
    }
  }, [lock]);
  useEffect(() => {
    let disposed = false;
    let release: (() => void) | undefined;
    void navigator.locks.request('profilevault-single-editor', { ifAvailable: true }, async (l) => {
      if (!l) {
        setFatal('已有资料库窗口打开。请关闭此窗口，使用原窗口。');
        return;
      }
      await new Promise<void>((resolve) => {
        release = resolve;
        if (disposed) {
          resolve();
          return;
        }
        void (async () => {
          try {
            await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
            const saved = await repo.read();
            setEnvelope(saved);
            const stored = await chrome.storage.local.get('deviceSecret');
            if (saved && typeof stored.deviceSecret === 'string') {
              const decoded = await decrypt(saved, stored.deviceSecret);
              if (!disposed) unlock(decoded.key, decoded.payload, saved, true);
            }
            for (let i = 0; i < 10 && !disposed; i++) {
              const t = (await chrome.runtime.sendMessage({ type: 'GET_TARGET' })) as Target | null;
              if (t) {
                setTarget(t);
                targetRef.current = t;
                break;
              }
              await new Promise((r) => setTimeout(r, 100));
            }
            if (!disposed) setReady(true);
          } catch {
            setFatal('无法建立可信存储访问或资料库格式不合法。未启用资料操作。');
          }
        })();
      });
    });
    return () => {
      disposed = true;
      release?.();
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        session.current.key &&
        !session.current.deviceMode &&
        Date.now() >= session.current.deadline
      )
        lock('无操作超时，资料库已自动锁定。');
    }, 500);
    const unload = () => {
      session.current.lock();
      clearPage();
    };
    window.addEventListener('pagehide', unload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', unload);
    };
  }, [lock, clearPage]);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);
  function activity() {
    if (session.current.key) {
      try {
        check();
        session.current.touch();
      } catch {
        /* lock has cleared all UI state */
      }
    }
  }
  function allowLeave() {
    return !dirty || window.confirm('有未保存修改，确定放弃吗？');
  }
  function unlock(key: CryptoKey, p: Payload, e: Envelope, local = false) {
    session.current.unlock(key, p, e, local);
    setDeviceMode(local);
    setPayload(p);
    setEnvelope(e);
    setTab('profiles');
    setActive(p.preferences.defaultProfileId ?? p.profiles[0]?.id ?? '');
    setStatus('资料库已解锁；请在修改后保存。');
    setLockedBackup(false);
  }
  async function persist(next: Payload) {
    const s = check(),
      generation = session.current.generation;
    const saved = await repo.save(next, s.key, s.envelope);
    session.current.check(generation);
    session.current.payload = saved.payload;
    session.current.envelope = saved.envelope;
    setPayload(saved.payload);
    setEnvelope(saved.envelope);
    setStatus(deviceMode ? '已保存到本机（免口令）。' : '已加密保存。');
  }
  async function saveProfile(profile: Profile) {
    const s = check();
    await persist({
      ...s.payload,
      profiles: s.payload.profiles.map((p) => (p.id === profile.id ? profile : p)),
    });
    setScan(undefined);
  }
  async function newProfile(copy = false) {
    if (!allowLeave()) return;
    try {
      const s = check();
      if (s.payload.profiles.length >= 20) {
        setStatus('最多保存 20 个档案。');
        return;
      }
      const original = s.payload.profiles.find((p) => p.id === active);
      const p =
        copy && original
          ? {
              ...structuredClone(original),
              id: crypto.randomUUID(),
              label: (original.label + ' 副本').slice(0, 80),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : emptyProfile();
      await persist({ ...s.payload, profiles: [...s.payload.profiles, p] });
      setActive(p.id);
      setDirty(false);
      setScan(undefined);
    } catch {
      setStatus('新建失败：会话失效或存储冲突。');
    }
  }
  async function scanPage() {
    setBusy(true);
    setStatus('正在扫描主文档…');
    setScan(undefined);
    setResults(undefined);
    setUndoDeadline(0);
    try {
      check();
      if (!target?.allowed) throw Error('UNSUPPORTED');
      const generation = session.current.generation;
      const current = await chrome.tabs.get(target.tabId);
      if (!current.url || new URL(current.url).origin !== target.origin)
        throw Error('TARGET_CHANGED');
      await chrome.scripting.executeScript({
        target: { tabId: target.tabId, frameIds: [0] },
        world: 'ISOLATED',
        files: ['content/entry.js'],
      });
      const result = (await chrome.tabs.sendMessage(
        target.tabId,
        { type: 'SCAN' },
        { frameId: 0 },
      )) as ScanResult;
      session.current.check(generation);
      if (!result.scanId || result.origin !== target.origin) throw Error('TARGET_CHANGED');
      setScan(result);
      setTarget((current) => (current ? { ...current, title: result.title } : current));
      setStatus(`扫描完成，发现 ${result.fields.length} 个候选控件。`);
    } catch {
      setStatus(
        '无法扫描：受限页面、目标已导航、权限已失效或会话锁定。请在目标网页重新点击扩展图标；若窗口已打开，先关闭窗口。',
      );
    } finally {
      setBusy(false);
    }
  }
  async function fill(plan: FillPlan) {
    check();
    if (!target || !scan || scan.documentToken !== plan.documentToken) throw Error('TARGET');
    const generation = session.current.generation;
    const response = (await chrome.tabs.sendMessage(
      target.tabId,
      { type: 'FILL', plan },
      { frameId: 0 },
    )) as FieldResult[] | { error: string };
    session.current.check(generation);
    if (!Array.isArray(response)) throw Error('FILL_FAILED');
    undoToken.current = plan.documentToken;
    setResultLabels(
      Object.fromEntries(
        scan.fields.map((f) => [
          f.fieldId,
          f.label || f.labelledby || f.ariaLabel || f.name || f.type,
        ]),
      ),
    );
    setResults(response);
    setScan(undefined);
    setUndoDeadline(
      response.some(
        (r) =>
          r.status === 'written' &&
          !['file', 'combobox'].includes(
            scan.fields.find((f) => f.fieldId === r.fieldId)?.type ?? '',
          ),
      )
        ? Date.now() + 120000
        : 0,
    );
    setStatus('填写检查完成。结果仅代表检查时的状态，请在网页检查后自行提交。');
  }
  async function exportVault(backupPass?: string) {
    const s = check();
    const generation = session.current.generation;
    const stored = await repo.read();
    session.current.check(generation);
    if (JSON.stringify(stored) !== JSON.stringify(s.envelope)) throw Error('CONFLICT');
    let exported = s.envelope;
    if (session.current.deviceMode) {
      if (!backupPass || backupPass.length < 12) throw Error('BACKUP_PASSWORD');
      exported = (await createVault(s.payload, backupPass)).envelope;
      session.current.check(generation);
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup.profilevault.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importVault(next: Envelope) {
    if (session.current.key) check();
    await repo.replace(next, envelope, null);
    setDeviceMode(false);
    setEnvelope(next);
    lock('已替换加密资料库，请使用该备份的口令重新解锁。');
    setLockedBackup(false);
  }
  if (fatal)
    return (
      <main className="gate">
        <h1>ProfileVault</h1>
        <p role="alert">{fatal}</p>
      </main>
    );
  if (!ready)
    return (
      <main className="gate">
        <h1>ProfileVault</h1>
        <p role="status">正在建立本地可信存储…</p>
      </main>
    );
  return (
    <div className="app" onPointerDownCapture={activity} onKeyDownCapture={activity}>
      <header>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <div>
            <h1>ProfileVault</h1>
            <span>你的资料，只在本地。</span>
          </div>
        </div>
        <div className="header-actions">
          <span className="local-dot">
            {deviceMode ? '本机免口令 · 无远程服务' : '本地加密 · 无远程服务'}
          </span>
          {payload && (
            <button
              onClick={() => {
                if (allowLeave()) {
                  if (deviceMode) window.close();
                  else lock();
                }
              }}
            >
              {deviceMode ? '关闭资料窗口' : '立即锁定'}
            </button>
          )}
        </div>
      </header>
      {!payload ? (
        <main className="gate">
          <p className="eyebrow">YOUR INFORMATION, UNDER YOUR CONTROL</p>
          <h2>{envelope ? '解锁你的资料库' : '创建本地资料库'}</h2>
          <p>资料只加密保存在当前浏览器的本机扩展存储中，无需账户。</p>
          <p className="muted">
            忘记主口令无法恢复。卸载扩展可能丢失资料，请导出加密备份。网页可以在提交前读取已经填写的信息。
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setStatus('');
              const generation = session.current.generation;
              try {
                if (envelope) {
                  const decoded = await decrypt(envelope, pass);
                  if (session.current.generation !== generation) return;
                  unlock(decoded.key, decoded.payload, envelope);
                } else {
                  if (setupMode === 'password' && (pass !== confirmPass || pass.length < 12)) {
                    setStatus('口令至少 12 个字符，且两次输入一致。');
                    return;
                  }
                  const p = emptyPayload();
                  const local = setupMode === 'device';
                  const secret = local ? toB64(crypto.getRandomValues(new Uint8Array(32))) : pass;
                  const created = await createVault(p, secret);
                  if (session.current.generation !== generation) return;
                  await repo.replace(created.envelope, undefined, local ? secret : null);
                  unlock(created.key, p, created.envelope, local);
                  setStatus('资料库已建立。请创建首个档案，并在保存后导出备份。');
                }
              } catch {
                setStatus(
                  envelope
                    ? '口令错误或文件已损坏'
                    : '建库失败：存储不可用或已有资料库，请重新加载。',
                );
              } finally {
                setPass('');
                setConfirmPass('');
                setBusy(false);
              }
            }}
          >
            {!envelope && (
              <label>
                保护方式
                <select
                  aria-label="保护方式"
                  value={setupMode}
                  onChange={(e) => setSetupMode(e.target.value as 'password' | 'device')}
                >
                  <option value="password">主口令保护</option>
                  <option value="device">本机免口令</option>
                </select>
              </label>
            )}
            {setupMode === 'device' && !envelope && (
              <p className="warning">
                免口令会将本机解锁凭据保存在浏览器配置中。能访问此浏览器配置的人也能直接打开资料。
              </p>
            )}
            {(!!envelope || setupMode === 'password') && (
              <label>
                主口令
                <input
                  autoFocus
                  autoComplete={envelope ? 'current-password' : 'new-password'}
                  type="password"
                  minLength={envelope ? undefined : 12}
                  required
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                />
              </label>
            )}
            {!envelope && setupMode === 'password' && (
              <label>
                再次输入主口令
                <input
                  autoComplete="new-password"
                  type="password"
                  required
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                />
              </label>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? '正在准备本地资料库…'
                : envelope
                  ? '解锁资料库'
                  : setupMode === 'device'
                    ? '创建免口令资料库'
                    : '创建加密资料库'}
            </button>
          </form>
          <button className="link" onClick={() => setLockedBackup(!lockedBackup)}>
            {lockedBackup ? '收起导入' : '从加密备份恢复'}
          </button>
          {lockedBackup && <Backup hasVault={!!envelope} onImport={importVault} />}
        </main>
      ) : (
        <>
          <nav aria-label="主导航">
            {(
              [
                ['profiles', '资料档案'],
                ['fill', '网页填写'],
                ['backup', '备份与安全'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => {
                  if (allowLeave()) {
                    setTab(id);
                    setDirty(false);
                    setEditorVersion((v) => v + 1);
                    setScan(undefined);
                  }
                }}
              >
                {label}
              </button>
            ))}
            {!deviceMode && (
              <label className="lock-setting">
                自动锁定
                <select
                  aria-label="自动锁定时间"
                  value={payload.preferences.autoLockMinutes}
                  onChange={(e) => {
                    const next = Number(e.target.value) as 1 | 5 | 15;
                    void persist({
                      ...check().payload,
                      preferences: { ...check().payload.preferences, autoLockMinutes: next },
                    })
                      .then(() => session.current.touch())
                      .catch(() => setStatus('设置保存失败。'));
                  }}
                >
                  {[1, 5, 15].map((n) => (
                    <option key={n} value={n}>
                      {n} 分钟
                    </option>
                  ))}
                </select>
              </label>
            )}
          </nav>
          <div className="workspace">
            <aside>
              <p className="eyebrow">MY PROFILES</p>
              <h2>
                资料档案 <span className="count">{payload.profiles.length}/20</span>
              </h2>
              <div className="profile-list">
                {payload.profiles.map((p) => (
                  <button
                    className={'profile-card' + (p.id === active ? ' active' : '')}
                    key={p.id}
                    onClick={() => {
                      if (allowLeave()) {
                        check();
                        setActive(p.id);
                        setDirty(false);
                        setScan(undefined);
                        setEditorVersion((v) => v + 1);
                      }
                    }}
                  >
                    <span className="avatar" aria-hidden="true">
                      {p.label.slice(0, 1)}
                    </span>
                    <span>
                      <strong>{p.label}</strong>
                      <small>
                        {p.id === payload.preferences.defaultProfileId
                          ? '默认档案'
                          : '本地加密档案'}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
              <button className="full" onClick={() => void newProfile()}>
                ＋ 新建资料档案
              </button>
              {active && (
                <div className="profile-tools">
                  <button onClick={() => void newProfile(true)}>复制档案</button>
                  <button
                    onClick={() => {
                      if (!allowLeave()) return;
                      void persist({
                        ...check().payload,
                        preferences: { ...check().payload.preferences, defaultProfileId: active },
                      }).catch(() => setStatus('设置失败。'));
                    }}
                  >
                    设为默认
                  </button>
                  <button
                    className="danger"
                    onClick={async () => {
                      const p = payload.profiles.find((p) => p.id === active);
                      if (
                        !p ||
                        !window.confirm(
                          `确认删除档案「${p.label}」？此操作需要已导出的备份才能恢复。`,
                        )
                      )
                        return;
                      try {
                        const s = check(),
                          profiles = s.payload.profiles.filter((p) => p.id !== active);
                        await persist({
                          ...s.payload,
                          profiles,
                          preferences: {
                            ...s.payload.preferences,
                            defaultProfileId: profiles[0]?.id,
                          },
                        });
                        setActive(profiles[0]?.id ?? '');
                        setDirty(false);
                        setScan(undefined);
                      } catch {
                        setStatus('删除失败，原资料保留。');
                      }
                    }}
                  >
                    删除档案
                  </button>
                </div>
              )}
              <div className="aside-note">
                <strong>始终由你确认</strong>
                <p>不训练模型，不调用 API。每次只向页面发送你批准的字段。</p>
              </div>
            </aside>
            <main className="main-panel">
              {envelope?.formatVersion === 1 && (
                <p className="notice">
                  旧版资料已兼容打开。保存后将升级到 v2
                  格式，请先在备份页导出旧版加密备份；旧版扩展不能读取升级后的库。
                </p>
              )}
              {tab === 'profiles' &&
                (payload.profiles.find((p) => p.id === active) ? (
                  <ProfileEditor
                    key={active + editorVersion}
                    profile={payload.profiles.find((p) => p.id === active)!}
                    onSave={saveProfile}
                    onDirty={setDirty}
                  />
                ) : (
                  <div className="empty">
                    <p className="eyebrow">START WITH A PROFILE</p>
                    <h2>保存一次，少填很多次。</h2>
                    <p>创建你的首个资料档案。只保存你需要的字段。</p>
                    <button className="primary" onClick={() => void newProfile()}>
                      创建第一个档案
                    </button>
                  </div>
                ))}
              {tab === 'fill' && (
                <>
                  <div className="target">
                    <span className="eyebrow">TARGET WEBSITE</span>
                    <h2>{target?.origin ?? '尚未绑定网页'}</h2>
                    <p>{target?.title ?? '请关闭此窗口，然后在目标网页点击扩展图标。'}</p>
                  </div>
                  <p className="muted">
                    当前档案：
                    {payload.profiles.find((p) => p.id === active)?.label ?? '请先创建档案'}
                  </p>
                  <button
                    disabled={busy || !target?.allowed || !active}
                    onClick={() => void scanPage()}
                  >
                    {scan ? '重新扫描' : '扫描当前目标网页'}
                  </button>
                  {!target?.allowed && (
                    <p className="warning">
                      此页面不可扫描。MVP 不支持浏览器内部页、商店、PDF、file://、iframe 和 shadow
                      DOM。
                    </p>
                  )}
                  {scan && payload.profiles.find((p) => p.id === active) && (
                    <Preview
                      key={scan.scanId + active}
                      scan={scan}
                      profile={payload.profiles.find((p) => p.id === active)!}
                      onFill={fill}
                      onCancel={() => {
                        setScan(undefined);
                        clearPage();
                        setStatus('已取消，未执行填写。');
                      }}
                    />
                  )}
                  {results && (
                    <section>
                      <h3>逐项结果</h3>
                      <p>仅代表检查时状态；页面可能继续处理或回退。扩展没有主动提交。</p>
                      <ul className="results">
                        {results.map((r, i) => (
                          <li key={i}>
                            <strong>
                              {resultLabels[r.fieldId] ?? '本批次'} ·{' '}
                              {
                                {
                                  written: '已写入',
                                  skipped: '已跳过',
                                  failed: '失败',
                                  reverted: '页面回退',
                                  changed: '页面变化',
                                  restored: '已恢复',
                                  edited: '用户修改，跳过',
                                  expired: '缓存失效',
                                }[r.status]
                              }
                            </strong>{' '}
                            · {r.reason}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {undoDeadline > 0 && (
                    <div className="notice">
                      <p>
                        撤销有效至 {new Date(undoDeadline).toLocaleTimeString('zh-CN')}（2
                        分钟）。仅恢复未修改的 DOM 状态，无法撤回网站已读取的信息。
                      </p>
                      <button
                        onClick={async () => {
                          try {
                            check();
                            if (!target || Date.now() > undoDeadline) {
                              setStatus('撤销缓存已失效。');
                              setUndoDeadline(0);
                              return;
                            }
                            const generation = session.current.generation;
                            const response = await chrome.tabs.sendMessage(
                              target.tabId,
                              { type: 'UNDO', documentToken: undoToken.current },
                              { frameId: 0 },
                            );
                            session.current.check(generation);
                            if (!Array.isArray(response)) throw Error('UNDO_FAILED');
                            setResults(response);
                            setUndoDeadline(0);
                            setStatus('撤销检查完成。');
                          } catch {
                            setStatus('撤销失败，页面或会话已失效。');
                          }
                        }}
                      >
                        撤销本次填写
                      </button>
                    </div>
                  )}
                </>
              )}
              {tab === 'backup' && (
                <>
                  <VaultProtection
                    deviceMode={deviceMode}
                    onConvert={async (pass) => {
                      const s = check(),
                        generation = session.current.generation;
                      if (!deviceMode) await decrypt(s.envelope, pass);
                      session.current.check(generation);
                      const local = !deviceMode,
                        secret = local ? toB64(crypto.getRandomValues(new Uint8Array(32))) : pass;
                      const nextPayload = { ...s.payload, revision: s.envelope.revision + 1 };
                      const created = await createVault(nextPayload, secret);
                      session.current.check(generation);
                      await repo.replace(created.envelope, s.envelope, local ? secret : null);
                      unlock(created.key, nextPayload, created.envelope, local);
                      clearPage();
                    }}
                  />
                  <Backup
                    hasVault
                    deviceMode={deviceMode}
                    onExport={exportVault}
                    onImport={importVault}
                    guard={() => {
                      check();
                    }}
                    onChangePass={
                      deviceMode
                        ? undefined
                        : async (current, next) => {
                            const s = check(),
                              generation = session.current.generation;
                            const changed = await repo.changePassphrase(s.envelope, current, next);
                            session.current.check(generation);
                            session.current.unlock(changed.key, changed.payload, changed.envelope);
                            setPayload(changed.payload);
                            setEnvelope(changed.envelope);
                            setScan(undefined);
                            clearPage();
                          }
                    }
                  />
                </>
              )}
            </main>
          </div>
        </>
      )}
      <footer>
        <p role="status" aria-live="polite">
          {status || '准备就绪。'}
        </p>
        <span>
          {payload
            ? dirty
              ? '有未保存修改'
              : deviceMode
                ? '本机免口令模式'
                : '已解锁 · 本地会话'
            : '已锁定'}
        </span>
      </footer>
    </div>
  );
}
