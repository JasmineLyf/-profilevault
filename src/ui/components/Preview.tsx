import { useState } from 'react';
import { defaultSelection, resumeFor, type FillSelection } from '../../core/recruiting';
import { catalog, type FieldId } from '../../core/field-catalog';
import { match } from '../../core/matcher';
import { prepareValue, profileValue } from '../../core/normalize';
import type { Profile } from '../../core/schema';
import type { Features, FillPlan, ScanResult, Value } from '../../core/protocol';
interface Choice {
  recordId?: string;
  selected: boolean;
  source?: FieldId;
  temporary?: Value;
  overwrite: boolean;
  show: boolean;
}
interface Props {
  scan: ScanResult;
  profile: Profile;
  onFill: (plan: FillPlan) => Promise<void>;
  onCancel: () => void;
}
export function Preview({ scan, profile, onFill, onCancel }: Props) {
  const sections = [...new Set(scan.fields.filter((f) => !f.blocked).map((f) => f.section))];
  const [selection, setSelection] = useState<FillSelection>(() => defaultSelection(profile));
  const [section, setSection] = useState(sections.length === 1 ? sections[0] : '');
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function choice(f: Features): Choice {
    const m = match(f, scan.origin, true);
    return (
      choices[f.fieldId] ?? {
        selected:
          m.decision !== 'blocked' &&
          m.score >= 70 &&
          m.score - m.runnerUpScore >= 15 &&
          !m.conflicts.length &&
          m.candidateField !== 'person.birthDate' &&
          !f.hasValue &&
          !!m.candidateField &&
          finalValue(f, {
            source: m.candidateField,
            selected: false,
            overwrite: false,
            show: false,
          }).value !== undefined &&
          !finalValue(f, {
            source: m.candidateField,
            selected: false,
            overwrite: false,
            show: false,
          }).error,
        source: m.candidateField,
        overwrite: false,
        show: false,
      }
    );
  }
  function setChoice(f: Features, patch: Partial<Choice>) {
    setChoices((old) => ({ ...old, [f.fieldId]: { ...choice(f), ...patch } }));
  }
  function finalValue(f: Features, c: Choice): { value?: Value; error?: string } {
    if (c.temporary !== undefined) {
      if (typeof c.temporary === 'string' && f.type !== 'select-multiple')
        return prepareValue(c.temporary, f, c.source);
      return { value: c.temporary };
    }
    if (!c.source) return {};
    if (c.source === 'resume.file')
      return f.type === 'file'
        ? { value: resumeFor(profile, selection.language) }
        : { error: '简历附件只能填到明确的文件上传框' };
    const effective = {
      ...selection,
      ...(c.source.startsWith('education.') && c.recordId ? { educationId: c.recordId } : {}),
      ...(c.source.startsWith('experience.') && c.recordId ? { experienceId: c.recordId } : {}),
    };
    const value = profileValue(profile, c.source, f, effective);
    return value === undefined
      ? { error: '该资料项未设置，或电话无法无歧义转换' }
      : prepareValue(value, f, c.source);
  }
  const visible = scan.fields.filter((f) => !section || f.section === section || f.blocked);
  const selected = visible.filter(
    (f) => !f.blocked && (!section || f.section === section) && choice(f).selected,
  );
  return (
    <div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">REVIEW BEFORE FILLING</p>
          <h2>检查本次填写</h2>
        </div>
        <span className="badge">{scan.fields.length} 个候选控件</span>
      </div>
      <div className="notice">
        <strong>填写后，本网站即可读取所选信息；部分网站可能立即保存。</strong>
        <p>扩展不会提交表单。请只向你信任的网站填写资料。</p>
      </div>
      {!scan.origin.startsWith('https:') && (
        <p className="warning">HTTP 连接未加密；所有字段均需手动选择。</p>
      )}
      <div className="form-grid">
        <label>
          填写语言 / Language
          <select
            aria-label="填写语言"
            value={selection.language}
            onChange={(e) => {
              setSelection({ ...selection, language: e.target.value as 'zh' | 'en' });
              setChoices({});
            }}
          >
            <option value="zh">中文资料</option>
            <option value="en">English profile</option>
          </select>
        </label>
        <label>
          本次教育经历
          <select
            aria-label="本次教育经历"
            value={selection.educationId ?? ''}
            onChange={(e) => {
              setSelection({ ...selection, educationId: e.target.value || undefined });
              setChoices({});
            }}
          >
            <option value="">请选择教育经历</option>
            {profile.education?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.school[selection.language] ?? '该语言学校名称未设置'}
                {e.id === profile.highestEducationId ? ' · 最高学历' : ''}
                {e.id === profile.currentEducationId ? ' · 当前学历' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          本次实习／工作／项目经历
          <select
            aria-label="本次经历"
            value={selection.experienceId ?? ''}
            onChange={(e) => {
              setSelection({ ...selection, experienceId: e.target.value || undefined });
              setChoices({});
            }}
          >
            <option value="">请选择经历</option>
            {profile.experiences?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.company[selection.language] ?? '该语言单位未设置'} ·{' '}
                {e.title[selection.language] ?? ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        中英文不自动互译。有资料且匹配明确的字段（含下拉与简历附件）自动选中，一次批准即可填写；网页新增行请手动点击
        Add another 后重新扫描。下拉选择及文件附加暂不支持扩展撤销。
      </p>
      <label className="section-picker">
        表单分区
        <select
          aria-label="表单分区"
          value={section}
          onChange={(e) => {
            setSection(e.target.value);
            setChoices({});
          }}
        >
          <option value="">全部分区</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        已自动选中可填写项，可直接点击下方填写按钮；已有值需批准覆盖。手动修正不保存为站点规则。
      </p>
      <div className="preview-list">
        {visible.map((f) => {
          const c = choice(f),
            m = match(f, scan.origin, Boolean(section)),
            final = finalValue(f, c);
          const sensitive =
            c.source === 'person.birthDate' ||
            f.type === 'date' ||
            /birth|bday|生日|出生/i.test([f.label, f.name, f.id, f.autocomplete].join(' '));
          const blocked = Boolean(f.blocked) || m.decision === 'blocked';
          return (
            <article className={'preview-row' + (blocked ? ' blocked' : '')} key={f.fieldId}>
              <div className="row-title">
                <label className="check">
                  <input
                    type="checkbox"
                    aria-label={'填写 ' + (f.label || f.ariaLabel || f.name || f.type)}
                    disabled={
                      blocked ||
                      !section ||
                      f.section !== section ||
                      final.value === undefined ||
                      !!final.error ||
                      (f.hasValue && !c.overwrite)
                    }
                    checked={!blocked && c.selected}
                    onChange={(e) => setChoice(f, { selected: e.target.checked })}
                  />
                  <strong>
                    {f.label || f.labelledby || f.ariaLabel || f.name || f.placeholder || f.type}
                  </strong>
                </label>
                <span className="badge">
                  {blocked
                    ? '禁止／跳过'
                    : sensitive
                      ? '敏感 · 逐项批准'
                      : m.score >= 90
                        ? '高分建议'
                        : m.score >= 70
                          ? '待确认'
                          : '未识别'}
                </span>
                {f.hasValue && <span className="badge">网页已有内容</span>}
              </div>
              {blocked ? (
                <p>{f.blocked ?? m.reasons.join('；')}</p>
              ) : (
                <>
                  <div className="form-grid">
                    <label>
                      对应资料项
                      <select
                        aria-label={'资料项 ' + f.fieldId}
                        value={c.source ?? ''}
                        onChange={(e) =>
                          setChoice(f, {
                            source: (e.target.value || undefined) as FieldId | undefined,
                            temporary: undefined,
                            selected: false,
                          })
                        }
                      >
                        <option value="">本次临时值／未分配</option>
                        {catalog.map(([id, l]) => (
                          <option key={id} value={id}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    {f.type === 'file' ? (
                      <p>使用所选语言的简历文件；上传后网站可能立即接收文件。</p>
                    ) : ['radio', 'checkbox'].includes(f.type) ? (
                      <label>
                        本次目标状态
                        <select
                          aria-label={'目标状态 ' + f.fieldId}
                          value={c.temporary === undefined ? '' : String(c.temporary)}
                          onChange={(e) =>
                            setChoice(f, {
                              source: undefined,
                              temporary:
                                e.target.value === '' ? undefined : e.target.value === 'true',
                              selected: false,
                            })
                          }
                        >
                          <option value="">请选择</option>
                          <option value="true">选中</option>
                          {f.type === 'checkbox' && <option value="false">取消选中</option>}
                        </select>
                      </label>
                    ) : f.type === 'select-multiple' ? (
                      <label>
                        本次选择多个选项
                        <select
                          multiple
                          aria-label={'多个选项 ' + f.fieldId}
                          value={Array.isArray(c.temporary) ? c.temporary : []}
                          onChange={(e) =>
                            setChoice(f, {
                              source: undefined,
                              temporary: Array.from(e.target.selectedOptions, (o) => o.value),
                              selected: false,
                            })
                          }
                        >
                          {f.options?.map((o, i) => (
                            <option key={i} value={o.value} disabled={o.disabled}>
                              {o.text}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label>
                        本次临时值
                        <input
                          aria-label={'临时值 ' + f.fieldId}
                          type={sensitive && !c.show ? 'password' : 'text'}
                          autoComplete="off"
                          placeholder="留空则使用资料项"
                          value={typeof c.temporary === 'string' ? c.temporary : ''}
                          onChange={(e) =>
                            setChoice(f, {
                              temporary: e.target.value === '' ? undefined : e.target.value,
                              selected: false,
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                  <div>
                    {c.source?.startsWith('education.') && (
                      <label>
                        此字段使用的教育经历
                        <select
                          aria-label={'教育记录 ' + f.fieldId}
                          value={c.recordId ?? selection.educationId ?? ''}
                          onChange={(e) =>
                            setChoice(f, { recordId: e.target.value || undefined, selected: false })
                          }
                        >
                          <option value="">请选择</option>
                          {profile.education?.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.school[selection.language] ?? '未设置'}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {c.source?.startsWith('experience.') && (
                      <label>
                        此字段使用的经历
                        <select
                          aria-label={'经历记录 ' + f.fieldId}
                          value={c.recordId ?? selection.experienceId ?? ''}
                          onChange={(e) =>
                            setChoice(f, { recordId: e.target.value || undefined, selected: false })
                          }
                        >
                          <option value="">请选择</option>
                          {profile.experiences?.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.company[selection.language] ?? '未设置'}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <p className="proposed">
                    拟填值：
                    {sensitive && !c.show
                      ? '已隐藏'
                      : final.value === undefined
                        ? '未设置'
                        : typeof final.value === 'boolean'
                          ? final.value
                            ? '选中'
                            : '取消选中'
                          : Array.isArray(final.value)
                            ? final.value.join('、')
                            : typeof final.value === 'object'
                              ? final.value.name
                              : final.value}
                  </p>
                  {sensitive && (
                    <button type="button" onClick={() => setChoice(f, { show: !c.show })}>
                      {c.show ? '隐藏敏感值' : '显示敏感值'}
                    </button>
                  )}
                  {f.hasValue && (
                    <label className="check warning">
                      <input
                        type="checkbox"
                        checked={c.overwrite}
                        onChange={(e) =>
                          setChoice(f, { overwrite: e.target.checked, selected: false })
                        }
                      />
                      批准覆盖此项网页原有内容
                    </label>
                  )}
                  <p className="muted">
                    {m.reasons.join('；') || '无高分依据，请手动确认'} · 规则分 {m.score} /
                    100（不是概率）{m.conflicts.length ? ' · ' + m.conflicts.join('；') : ''}
                  </p>
                  {final.error && <p className="error">{final.error}</p>}
                </>
              )}
            </article>
          );
        })}
      </div>
      {scan.warnings.map((w) => (
        <p className="muted" key={w}>
          {w}
        </p>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="sticky-actions">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button
          className="primary"
          disabled={busy || !selected.length}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const plan: FillPlan = {
                protocolVersion: 1,
                operationId: crypto.randomUUID(),
                scanId: scan.scanId,
                documentToken: scan.documentToken,
                expectedOrigin: scan.origin,
                expiresAt: Date.now() + 60000,
                fields: selected.map((f) => {
                  const c = choice(f);
                  return {
                    fieldId: f.fieldId,
                    semanticFingerprint: f.semanticFingerprint,
                    sourceFieldId: c.source,
                    value: finalValue(f, c).value!,
                    overwriteApproved: c.overwrite,
                    sensitiveApproved: true,
                  };
                }),
              };
              await onFill(plan);
            } catch {
              setError('填写未执行：目标或会话已失效，请解锁并重新扫描。');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? '正在检查与填写…' : `填写已选 ${selected.length} 项`}
        </button>
      </div>
    </div>
  );
}
