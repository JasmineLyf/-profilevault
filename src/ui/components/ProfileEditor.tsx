import { Fragment, useState } from 'react';
import { catalog, countryAliases } from '../../core/field-catalog';
import { profileSchema, type Profile } from '../../core/schema';
import { RecruitingEditor } from './RecruitingEditor';
interface Props {
  profile: Profile;
  onSave: (p: Profile) => Promise<void>;
  onDirty: (v: boolean) => void;
}
export function ProfileEditor({ profile, onSave, onDirty }: Props) {
  const [draft, setDraft] = useState(() => structuredClone(profile));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function update(group: string, key: string, value: string) {
    setDraft((current) => {
      const next = structuredClone(current);
      if (group === 'root') next.label = value;
      else if (group === 'phone') {
        const phone = {
          countryCallingCode: '',
          nationalNumber: '',
          ...next.contact.phone,
          [key]: value,
        };
        if (!phone.countryCallingCode && !phone.nationalNumber && !phone.extension)
          delete next.contact.phone;
        else {
          if (!phone.extension) delete phone.extension;
          next.contact.phone = phone;
        }
      } else {
        const target = next[
          group as 'person' | 'contact' | 'address' | 'organization' | 'links'
        ] as Record<string, unknown>;
        if (value === '') delete target[key];
        else target[key] = value;
      }
      return next;
    });
    onDirty(true);
  }
  function field(id: string, label: string) {
    const [group, key] = id.split('.');
    const value = (
      draft[group as 'person' | 'contact' | 'address' | 'organization' | 'links'] as Record<
        string,
        unknown
      >
    )[key];
    if (id === 'contact.phone')
      return (
        <fieldset className="phone" key={id}>
          <legend>电话（字符串保存，不猜测国家码）</legend>
          {[
            ['countryCallingCode', '国家呼叫码，如 +86'],
            ['nationalNumber', '本地号码'],
            ['extension', '分机（可选）'],
          ].map(([k, l]) => (
            <label key={k}>
              {l}
              <input
                autoComplete="off"
                value={
                  draft.contact.phone?.[k as keyof NonNullable<Profile['contact']['phone']>] ?? ''
                }
                onChange={(e) => update('phone', k, e.target.value)}
              />
            </label>
          ))}
        </fieldset>
      );
    return (
      <label key={id}>
        {label}
        {id === 'address.countryCode' ? (
          <select
            aria-label={label}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => update(group, key, e.target.value)}
          >
            <option value="">未设置</option>
            {Object.entries(countryAliases).map(([c, a]) => (
              <option key={c} value={c}>
                {a[0]} · {c}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={
              id === 'person.birthDate'
                ? 'date'
                : id === 'contact.email'
                  ? 'email'
                  : id === 'links.website'
                    ? 'url'
                    : 'text'
            }
            autoComplete="off"
            maxLength={id.includes('line') ? 512 : 256}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => update(group, key, e.target.value)}
          />
        )}
      </label>
    );
  }
  return (
    <form
      className="editor"
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = profileSchema.safeParse({ ...draft, updatedAt: new Date().toISOString() });
        if (!parsed.success) {
          setError('资料格式不合法。请检查邮箱、网址、国家呼叫码与号码等字段。');
          return;
        }
        setBusy(true);
        try {
          await onSave(parsed.data);
          onDirty(false);
          setError('');
        } catch (error) {
          setError(
            error instanceof Error && error.message === 'PAYLOAD_SIZE'
              ? '资料和附件总量超过 6 MiB，请移除旧附件后重试；原资料库未改变。'
              : '保存失败：资料库已锁定、存储失败或版本冲突。请保留原库并重新加载。',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">PROFILE DETAILS</p>
          <h2>编辑资料档案</h2>
        </div>
        <button className="primary" disabled={busy} type="submit">
          {busy ? '保存中…' : '保存资料'}
        </button>
      </div>
      <label>
        档案名称
        <input
          required
          maxLength={80}
          value={draft.label}
          onChange={(e) => update('root', 'label', e.target.value)}
        />
      </label>
      {Object.entries({
        person: '基本信息',
        contact: '联系方式',
        address: '地址',
        organization: '单位',
        links: '链接',
      }).map(([g, title]) => (
        <section key={g}>
          <h3>{title}</h3>
          <div className="form-grid">
            {catalog
              .filter(([id]) => id.startsWith(g + '.') && id !== 'person.birthDate')
              .map(([id, l]) => {
                const [group, key] = id.split('.') as [
                  'person' | 'address' | 'organization',
                  string,
                ];
                const bilingual =
                  ['person', 'address', 'organization'].includes(group) &&
                  !['latinFullName', 'countryCode', 'postalCode'].includes(key);
                return (
                  <Fragment key={id}>
                    {field(id, l)}
                    {bilingual && (
                      <label>
                        {l} · English
                        <input
                          aria-label={l + ' English'}
                          maxLength={id.includes('line') ? 512 : 256}
                          value={
                            (
                              draft.translations?.en?.[group] as Record<string, string> | undefined
                            )?.[key] ?? ''
                          }
                          onChange={(e) => {
                            const next = structuredClone(draft);
                            next.translations ??= {};
                            next.translations.en ??= {};
                            const en = next.translations.en as Record<
                              string,
                              Record<string, string>
                            >;
                            en[group] ??= {};
                            if (e.target.value) en[group][key] = e.target.value;
                            else delete en[group][key];
                            setDraft(next);
                            onDirty(true);
                          }}
                        />
                      </label>
                    )}
                  </Fragment>
                );
              })}
          </div>
        </section>
      ))}
      <details>
        <summary>敏感信息 · 出生日期</summary>
        <p className="muted">每次填写均需单独选择；不会自动勾选。</p>
        {field('person.birthDate', '出生日期')}
      </details>
      <RecruitingEditor
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          onDirty(true);
        }}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}
