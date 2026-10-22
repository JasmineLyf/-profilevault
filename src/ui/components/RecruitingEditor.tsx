import { useState, useRef, useEffect } from 'react';
import type { Profile } from '../../core/schema';
import { degrees } from '../../core/schema';
import { degreeLabels, type Language } from '../../core/recruiting';
import {
  readResume,
  extractResumeText,
  suggestFromText,
  applyBasicSuggestion,
  educationFromLine,
  experienceFromLine,
  type ResumeSuggestion,
} from '../../core/resume-parser';
interface Props {
  draft: Profile;
  onChange: (next: Profile) => void;
}
export function RecruitingEditor({ draft, onChange }: Props) {
  const latest = useRef(draft);
  latest.current = draft;
  const parserController = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => parserController.current?.abort(), []);
  const [parsing, setParsing] = useState(false),
    [parseMessage, setParseMessage] = useState(''),
    [suggestions, setSuggestions] = useState<ResumeSuggestion[]>([]),
    [resumeLanguage, setResumeLanguage] = useState<Language>('zh'),
    [extracted, setExtracted] = useState('');
  function change(mutator: (p: Profile) => void) {
    const next = structuredClone(latest.current);
    mutator(next);
    onChange(next);
  }
  function localized(
    label: string,
    value: { zh?: string; en?: string } | undefined,
    update: (lang: Language, value: string) => void,
    long = false,
  ) {
    return (
      <div className="form-grid">
        {(['zh', 'en'] as const).map((lang) => (
          <label key={lang}>
            {label} · {lang === 'zh' ? '中文' : 'English'}
            {long ? (
              <textarea
                maxLength={4000}
                value={value?.[lang] ?? ''}
                onChange={(e) => update(lang, e.target.value)}
              />
            ) : (
              <input
                maxLength={256}
                value={value?.[lang] ?? ''}
                onChange={(e) => update(lang, e.target.value)}
              />
            )}
          </label>
        ))}
      </div>
    );
  }
  return (
    <>
      <section id="education-editor">
        <h3>教育经历 / Education</h3>
        <p className="muted">
          本科、硕士、博士均可按实际情况添加；最高学历与当前学历可以标记为同一条或不同条。
        </p>
        {(draft.education ?? []).map((entry, index) => (
          <article className="record-card" key={entry.id}>
            <div className="row-title">
              <strong>教育经历 {index + 1}</strong>
              <button
                type="button"
                onClick={() =>
                  change((p) => {
                    p.education = p.education?.filter((x) => x.id !== entry.id);
                    if (p.highestEducationId === entry.id) delete p.highestEducationId;
                    if (p.currentEducationId === entry.id) delete p.currentEducationId;
                  })
                }
              >
                删除这条教育经历
              </button>
            </div>
            {localized('学校 / School', entry.school, (lang, value) =>
              change((p) => {
                const e = p.education!.find((e) => e.id === entry.id)!;
                if (value) e.school[lang] = value;
                else delete e.school[lang];
              }),
            )}
            <label>
              学历 / Degree
              <select
                aria-label={`学历 ${index + 1}`}
                value={entry.degree}
                onChange={(e) =>
                  change((p) => {
                    p.education!.find((x) => x.id === entry.id)!.degree = e.target
                      .value as typeof entry.degree;
                  })
                }
              >
                {degrees.map((d) => (
                  <option value={d} key={d}>
                    {degreeLabels[d].zh} / {degreeLabels[d].en}
                  </option>
                ))}
              </select>
            </label>
            {localized('专业 / Major', entry.major, (lang, value) =>
              change((p) => {
                const e = p.education!.find((e) => e.id === entry.id)!;
                e.major ??= {};
                if (value) e.major[lang] = value;
                else delete e.major[lang];
              }),
            )}
            <div className="form-grid">
              {(['startMonth', 'endMonth'] as const).map((k) => (
                <label key={k}>
                  {k === 'startMonth' ? '入学年月 / Start' : '毕业年月 / End'}
                  <input
                    type="month"
                    value={entry[k] ?? ''}
                    onChange={(e) =>
                      change((p) => {
                        const item = p.education!.find((x) => x.id === entry.id)!;
                        if (e.target.value) item[k] = e.target.value;
                        else delete item[k];
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.highestEducationId === entry.id}
                onChange={(e) =>
                  change((p) => {
                    if (e.target.checked) p.highestEducationId = entry.id;
                    else delete p.highestEducationId;
                  })
                }
              />
              最高学历 / Highest education
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.currentEducationId === entry.id}
                onChange={(e) =>
                  change((p) => {
                    if (e.target.checked) p.currentEducationId = entry.id;
                    else delete p.currentEducationId;
                  })
                }
              />
              当前学历 / Current education
            </label>
          </article>
        ))}
        <button
          type="button"
          disabled={(draft.education?.length ?? 0) >= 10}
          onClick={() =>
            change((p) => {
              p.education ??= [];
              p.education.push({ id: crypto.randomUUID(), school: {}, degree: 'bachelor' });
            })
          }
        >
          ＋ 添加教育经历 / Add education
        </button>
      </section>
      <section>
        <h3>实习、工作与项目经历 / Experience</h3>
        {(draft.experiences ?? []).map((entry, index) => (
          <article className="record-card" key={entry.id}>
            <div className="row-title">
              <strong>经历 {index + 1}</strong>
              <button
                type="button"
                onClick={() =>
                  change((p) => {
                    p.experiences = p.experiences?.filter((x) => x.id !== entry.id);
                  })
                }
              >
                删除这条经历
              </button>
            </div>
            <label>
              经历类型
              <select
                aria-label={`经历类型 ${index + 1}`}
                value={entry.kind}
                onChange={(e) =>
                  change((p) => {
                    p.experiences!.find((x) => x.id === entry.id)!.kind = e.target
                      .value as typeof entry.kind;
                  })
                }
              >
                <option value="internship">实习 / Internship</option>
                <option value="work">工作 / Work</option>
                <option value="project">项目 / Project</option>
              </select>
            </label>
            {(['company', 'title', 'description'] as const).map((k) => (
              <div key={k}>
                {localized(
                  k === 'company'
                    ? '单位或项目 / Company'
                    : k === 'title'
                      ? '职位 / Title'
                      : '经历描述 / Description',
                  entry[k],
                  (lang, value) =>
                    change((p) => {
                      const e = p.experiences!.find((x) => x.id === entry.id)!;
                      e[k] ??= {};
                      if (value) e[k]![lang] = value;
                      else delete e[k]![lang];
                    }),
                  k === 'description',
                )}
              </div>
            ))}
            <div className="form-grid">
              {(['startMonth', 'endMonth'] as const).map((k) => (
                <label key={k}>
                  {k === 'startMonth' ? '开始年月' : '结束年月'}
                  <input
                    type="month"
                    disabled={k === 'endMonth' && entry.current}
                    value={entry[k] ?? ''}
                    onChange={(e) =>
                      change((p) => {
                        const item = p.experiences!.find((x) => x.id === entry.id)!;
                        if (e.target.value) item[k] = e.target.value;
                        else delete item[k];
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={entry.current}
                onChange={(e) =>
                  change((p) => {
                    const item = p.experiences!.find((x) => x.id === entry.id)!;
                    item.current = e.target.checked;
                    if (item.current) delete item.endMonth;
                  })
                }
              />
              至今 / Present
            </label>
          </article>
        ))}
        <button
          type="button"
          disabled={(draft.experiences?.length ?? 0) >= 20}
          onClick={() =>
            change((p) => {
              p.experiences ??= [];
              p.experiences.push({
                id: crypto.randomUUID(),
                kind: 'internship',
                company: {},
                title: {},
                current: false,
              });
            })
          }
        >
          ＋ 添加实习／工作／项目经历
        </button>
      </section>
      <section>
        <h3>中英文简历 / Résumés</h3>
        <p className="muted">
          每种语言保存一份 PDF / DOCX，每份最多 2 MiB。文件与资料一起保存在本机；总库上限 6
          MiB。解析依靠本地文本与规则，无模型 API、无 OCR。
        </p>
        <label>
          简历语言
          <select
            aria-label="简历语言"
            disabled={parsing}
            value={resumeLanguage}
            onChange={(e) => {
              setResumeLanguage(e.target.value as Language);
              setExtracted('');
              setSuggestions([]);
            }}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          添加并解析简历
          <input
            aria-label="添加并解析简历"
            type="file"
            disabled={parsing}
            accept=".pdf,.docx"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              parserController.current?.abort();
              const controller = new AbortController();
              parserController.current = controller;
              setParsing(true);
              setParseMessage('正在本地读取与解析…');
              setExtracted('');
              setSuggestions([]);
              try {
                const { resume, bytes } = await readResume(file, resumeLanguage);
                if (controller.signal.aborted) return;
                change((p) => {
                  p.resumes = [
                    ...(p.resumes ?? []).filter((r) => r.language !== resumeLanguage),
                    resume,
                  ];
                });
                try {
                  const text = await extractResumeText(bytes, resume.mime, controller.signal);
                  if (controller.signal.aborted) return;
                  setExtracted(text);
                  setSuggestions(suggestFromText(text));
                  setParseMessage('解析完成。请核对下方建议，再手动采用；最后保存资料。');
                } catch (error) {
                  setParseMessage(
                    error instanceof Error && error.message === 'RESUME_NO_TEXT'
                      ? '文件已添加，但没有可提取文本。扫描版 PDF 需要 OCR；本版不含 OCR。'
                      : '文件已添加，但文本解析失败或超过页数／资源限制。可以继续选择该附件上传。',
                  );
                }
              } catch {
                setParseMessage('请选择有效的 PDF / DOCX，文件大小不超过 2 MiB。');
              } finally {
                setParsing(false);
              }
            }}
          />
        </label>
        {(draft.resumes ?? []).map((r) => (
          <div className="attachment-row" key={r.id}>
            <strong>
              {r.language === 'zh' ? '中文' : 'English'} · {r.name}
            </strong>
            <span>{Math.ceil(r.size / 1024)} KB</span>
            <button
              type="button"
              onClick={() =>
                change((p) => {
                  p.resumes = p.resumes?.filter((x) => x.id !== r.id);
                })
              }
            >
              移除附件
            </button>
          </div>
        ))}
        <p role="status">{parseMessage}</p>
        {extracted && (
          <details>
            <summary>检查提取的全文 / Extracted text</summary>
            <textarea aria-label="简历提取文本" readOnly rows={10} value={extracted} />
          </details>
        )}
        {suggestions.length > 0 && (
          <div className="parse-review">
            <h4>解析建议 · 请逐条核对</h4>
            {suggestions.map((s) => (
              <article key={s.id}>
                <strong>{s.label}</strong>
                <p>{s.value}</p>
                {['email', 'name', 'website'].includes(s.kind) ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          '采用这条解析建议？对应资料项的原内容会被替换，保存前仍可编辑。',
                        )
                      ) {
                        onChange(applyBasicSuggestion(draft, s, resumeLanguage));
                        setSuggestions((old) => old.filter((x) => x.id !== s.id));
                      }
                    }}
                  >
                    采用此项
                  </button>
                ) : s.kind === 'education' ? (
                  <button
                    type="button"
                    disabled={(draft.education?.length ?? 0) >= 10}
                    onClick={() => {
                      change((p) => {
                        p.education ??= [];
                        p.education.push(educationFromLine(s.value, resumeLanguage));
                      });
                      setSuggestions((old) => old.filter((x) => x.id !== s.id));
                    }}
                  >
                    添加为教育经历草稿
                  </button>
                ) : s.kind === 'experience' ? (
                  <button
                    type="button"
                    disabled={(draft.experiences?.length ?? 0) >= 20}
                    onClick={() => {
                      change((p) => {
                        p.experiences ??= [];
                        p.experiences.push(experienceFromLine(s.value, resumeLanguage));
                      });
                      setSuggestions((old) => old.filter((x) => x.id !== s.id));
                    }}
                  >
                    添加为经历草稿
                  </button>
                ) : (
                  <p className="muted">请手动核对后填入资料。</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
