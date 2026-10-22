import { useState } from 'react';
export function VaultProtection({
  deviceMode,
  onConvert,
}: {
  deviceMode: boolean;
  onConvert: (pass: string) => Promise<void>;
}) {
  const [pass, setPass] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section className="notice">
      <h3>{deviceMode ? '本机免口令模式' : '口令保护模式'}</h3>
      <p>
        {deviceMode
          ? '本机解锁凭据与加密资料保存在同一浏览器配置中。能访问此浏览器配置的人可直接打开资料，不提供离线口令防护；关闭窗口仅清除本次内存。'
          : '关闭窗口或无操作超时后，需要重新输入主口令。'}
      </p>
      <details>
        <summary>{deviceMode ? '启用主口令保护' : '改为本机免口令'}</summary>
        <p>
          {deviceMode
            ? '设置至少 12 个字符的新口令。'
            : '请输入当前口令确认。改为免口令后，打开扩展将自动读取本机资料，不再自动锁定。原有备份仍使用原来的备份口令。'}
        </p>
        <label>
          {deviceMode ? '新主口令' : '当前主口令'}
          <input
            type="password"
            autoComplete="off"
            minLength={deviceMode ? 12 : undefined}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </label>
        {deviceMode && (
          <label>
            确认新主口令
            <input
              type="password"
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
        )}
        <button
          type="button"
          disabled={busy || !pass}
          onClick={async () => {
            if (deviceMode && (pass.length < 12 || pass !== confirmation)) {
              setMessage('新口令至少 12 个字符，且两次一致。');
              return;
            }
            setBusy(true);
            try {
              await onConvert(pass);
              setPass('');
              setConfirmation('');
              setMessage('保护方式已更改。请重新导出备份。');
            } catch {
              setMessage('更改失败：口令错误、会话过期或存储冲突。旧库保留。');
            } finally {
              setBusy(false);
            }
          }}
        >
          {deviceMode ? '启用口令保护' : '确认改为免口令'}
        </button>
        <p role="status">{message}</p>
      </details>
    </section>
  );
}
