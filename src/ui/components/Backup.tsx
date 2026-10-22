import { useState, useRef } from 'react';
import { decrypt } from '../../core/crypto';
import { parseEnvelope, MAX_BACKUP_BYTES, type Envelope } from '../../core/schema';
interface Props {
  hasVault: boolean;
  onExport?: (passphrase?: string) => Promise<void>;
  deviceMode?: boolean;
  onImport: (e: Envelope) => Promise<void>;
  onChangePass?: (current: string, next: string) => Promise<void>;
  guard?: () => void;
}
export function Backup({ hasVault, onExport, onImport, onChangePass, guard, deviceMode }: Props) {
  const [backupPass, setBackupPass] = useState(''),
    [backupConfirmation, setBackupConfirmation] = useState('');
  const [file, setFile] = useState<File>();
  const [pass, setPass] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState<{ envelope: Envelope; labels: string[] }>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  return (
    <section>
      <p className="eyebrow">LOCAL ENCRYPTED BACKUP</p>
      <h2>备份与安全</h2>
      <p>
        仅导入、导出加密的
        .profilevault.json。忘记口令无法恢复；卸载扩展或清理浏览器配置可能丢失资料。
      </p>
      {onExport && (
        <>
          {deviceMode && (
            <div>
              <p>免口令库的导出备份必须设置独立口令，防止备份泄露。该口令不会保存在扩展中。</p>
              <label>
                备份口令
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={backupPass}
                  onChange={(e) => setBackupPass(e.target.value)}
                />
              </label>
              <label>
                确认备份口令
                <input
                  type="password"
                  autoComplete="new-password"
                  value={backupConfirmation}
                  onChange={(e) => setBackupConfirmation(e.target.value)}
                />
              </label>
            </div>
          )}
          <button
            onClick={() => {
              setMessage('');
              if (deviceMode && (backupPass.length < 12 || backupPass !== backupConfirmation)) {
                setMessage('备份口令至少 12 个字符，且两次一致。');
                return;
              }
              void onExport(backupPass)
                .then(() => setMessage('已导出当前保存的加密资料库。'))
                .catch(() => setMessage('导出失败，请检查会话或备份口令。'))
                .finally(() => {
                  setBackupPass('');
                  setBackupConfirmation('');
                });
            }}
          >
            导出加密备份
          </button>
        </>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage('');
          setPending(undefined);
          setBusy(true);
          const version = ++epoch.current;
          try {
            guard?.();
            if (!file || file.size > MAX_BACKUP_BYTES) throw Error('FILE_SIZE');
            const envelope = parseEnvelope(await file.text());
            const decoded = await decrypt(envelope, pass);
            guard?.();
            if (version === epoch.current)
              setPending({ envelope, labels: decoded.payload.profiles.map((p) => p.label) });
          } catch (e) {
            const code = e instanceof Error ? e.message : '';
            setMessage(
              code === 'AUTH_FAILED'
                ? '口令错误或文件已损坏'
                : code === 'FILE_SIZE'
                  ? '请选择不超过 9 MiB 的备份文件'
                  : '格式不合法、版本不兼容或资料库已锁定。当前资料未改变。',
            );
          } finally {
            setPass('');
            setBusy(false);
          }
        }}
      >
        <h3>导入替换</h3>
        <label>
          加密备份文件
          <input
            type="file"
            accept=".json,.profilevault.json"
            onChange={(e) => {
              epoch.current++;
              setFile(e.target.files?.[0]);
              setPending(undefined);
            }}
          />
        </label>
        <label>
          该备份的口令
          <input
            required
            type="password"
            autoComplete="off"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </label>
        <button disabled={busy || !file}>验证备份并预览</button>
      </form>
      {pending && (
        <div className="notice">
          <h3>替换预览 · {pending.labels.length} 个档案</h3>
          <ul>
            {pending.labels.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          <p>
            {hasVault
              ? '将整库替换，当前档案和设置会被移除。请先导出当前库的加密备份。'
              : '将以此备份建立本机资料库。'}
            不会合并；替换后需要重新解锁。
          </p>
          <button
            className="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                guard?.();
                await onImport(pending.envelope);
                setPending(undefined);
              } catch {
                setMessage('替换失败，当前资料未改变。');
              } finally {
                setBusy(false);
              }
            }}
          >
            确认整库替换
          </button>
          <button
            onClick={() => {
              epoch.current++;
              setPending(undefined);
            }}
          >
            取消导入
          </button>
        </div>
      )}
      {onChangePass && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (next !== confirmation || next.length < 12) {
              setMessage('新口令需至少 12 个字符且两次一致。');
              return;
            }
            setBusy(true);
            try {
              await onChangePass(current, next);
              setMessage('主口令已更改。原备份仍使用原口令，请导出新备份。');
            } catch {
              setMessage('更改失败：当前口令错误、会话锁定或存储冲突。旧资料库保留。');
            } finally {
              setCurrent('');
              setNext('');
              setConfirmation('');
              setBusy(false);
            }
          }}
        >
          <h3>更改主口令</h3>
          <label>
            当前主口令
            <input
              required
              type="password"
              value={current}
              autoComplete="off"
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            新主口令
            <input
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          <label>
            确认新主口令
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <button disabled={busy}>更改主口令</button>
        </form>
      )}
      <p role="status" className="status">
        {message}
      </p>
    </section>
  );
}
