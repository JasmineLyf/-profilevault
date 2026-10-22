# 架构（0.2.0）

MV3 service worker 处理 action 和目标授权；独立编辑窗口持有解锁会话、资料编辑与预览；content script 仅在获准页面按需注入，扫描、执行获批计划并保存短期文本撤销信息。

core/schema.ts 校验 v2 资料、教育与经历、双语附件及受限消息；crypto.ts 兼容认证后的 v1 迁移，写出 v2 AES-GCM 信封。repository.ts 处理 revision 与存储失败；保护方式切换将本机解锁秘密和密文一次写入。Session 将免口令会话与口令闲置锁定分开处理。

recruiting.ts 定义语言、学历别名和记录选择。matcher 与 normalize 生成候选和明确的记录值。content/combobox.ts 处理受约束的关联列表及唯一准确选项；content/files.ts 使用 DataTransfer 附加经校验文件。自定义控件与文件纳入预览批量批准，无撤销。

resume-parser.ts 提供本地 PDF worker 与受限 DOCX XML 提取，以及规则候选。RecruitingEditor 展示提取文字、待采用候选和可编辑草稿，解析取消与锁定绑定；不静默覆盖资料。解析库及许可证随 dist 分发。

无后端或模型 API，无需 Codex 运行时。第三方库仅用于本地 UI、校验、ZIP 和 PDF 处理；开发夹具 react-select 不进入产品包。
