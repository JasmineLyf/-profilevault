# 测试说明（0.2.0）

2026-10-22，Windows、Node 24.19.0、npm 11.6.2；Chrome 154、Edge 155。仅使用虚构资料、独立临时浏览器配置和本地夹具。

依次运行 npm ci、npm run typecheck、npm run lint、npm run format:check、npm test、npm run build、npm run test:e2e。设置 PV_BROWSER=msedge 后重跑 E2E。npm run package 生成并解压 ZIP；设置 PV_DIST=release/unpacked 后使用 playwright test --grep 'real action|PDF and DOCX|real React Select' 验证分发包。本环境使用 node .tools/package/bin/npm-cli.js 代替全局 npm。

24 项单元及 DOM 集成测试涵盖加密、存储失败、旧库迁移、双语及记录引用、附件边界、DOCX 解析与恶意实体/解压限制、取消、禁填策略和撤销。真实浏览器 10 项用例涵盖原有填表/加密备份/锁定/React/离线/可访问性，以及免口令切换、双语教育选择、本地 PDF/DOCX 解析保存、搜索及滚动选择和附件。

CDP 加载实际 dist 并在真实 tab target 上触发 action，未用普通网页代替扩展。真实招聘网页只读核对，未提交申请。报告保存在 docs/validation；自动测试不代替独立人工复核、辅助技术或所有招聘网站兼容性检查。
