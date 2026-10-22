# 实施中已修复或避开的失败

1. 初始环境 `npm: The term 'npm' is not recognized`。未改变系统 PATH；以项目临时工具目录中的 npm 11.6.2 CLI 执行安装，并生成锁文件。
2. pnpm 临时执行 npm 出现 `ERR_PNPM_EXDEV: cross-device link not permitted`。改为从 npm 官方 registry 下载固定 npm tarball，使用 Node 直接执行 CLI，未改产品依赖策略。
3. 首次 TypeScript 检查 `window is possibly undefined`。处理 windows.create 的可选结果，复核后通过。
4. 首次 lint 误扫 `.tools/package` 中的第三方 npm 代码。仅将临时第三方目录加入 ignore，并补齐 Node TextDecoder 全局声明；产品与测试代码继续执行 lint。
5. 下载的 Chrome for Testing 在原缓存目录启动报 `spawn UNKNOWN`，Windows SideBySide 事件指向 `156.0.8078.4` 从属程序集加载失败。移至工作目录可启动，但没有继续依赖该副本；最终验证使用现有正式 Chrome/Edge 和隔离临时配置。没有修改系统浏览器或生产权限。
6. CDP 在 page session 调用 `Extensions.loadUnpacked` 返回 `Method not available`；triggerAction 传 page target 返回 `Action can only be triggered on a tab target`。改用 browser CDP session，并获取 type=tab 的 target；等待 Worker action listener 就绪。均为测试驱动修复，不增加产品权限。
7. 合法扩展窗口 sender 附带 tab，原 `!sender.tab` 检查误拒 UI，扫描按钮因没有目标而禁用。修为精确扩展 ID + UI URL 校验，未放开网页或外部扩展来源。真实闭环随后通过。
8. 隐式 select label 含选项文本，测试精确定位“国家／地区”失败。增加明确 aria-label，改善实际无障碍名称。
9. 解锁后留在之前的备份/填写页，测试无法定位档案编辑字段。现在重新解锁回到资料档案页，不恢复扫描批准状态。
10. HTTP 夹具有三个同名“邮箱”控件（正常、隐藏、禁用），测试 strict selector 命中多个。按可填写行限定测试定位，保留产品中的跳过行和理由。
11. 可见评估脚本把重复分区字段的空 ID 转为数字 0，误套第一条标注，得到 97.65% 精确率。修正评估索引，仅对明确 case-* ID 统计；重复分区另外验证未选分区不预选。未降低评分阈值或删除歧义样本。
12. 测试误调用 CDPSession 不存在的 waitForEvent。移除无用等待，使用真实 Worker target 终止和后续锁定/解锁/action 验证。

以上问题已在后续对应检查中修复或以可复现的测试环境替代。最终结论以同目录保存的最终报告为准，不将早期失败当成通过。

最终代码复核还移除了禁止/隐藏字段的内存旧值快照，并阻止含禁止成员的混合 radio 组，避免通过选中普通成员间接取消禁止选项。对应回归断言纳入 DOM 安全测试；这不改变禁止字段原本禁止写入的政策。


## 0.2.0 回归修复

- 盐/IV 的 Zod 长度约束移到 refine 前，修复初始化失败；真实扩展启动回归通过。
- React Select 只读 dummyInput 使用已知可见 control 检测，不放宽隐藏或密码字段政策。
- DOCX 单测夹具将 TextEncoder 返回数组转换到当前 realm；避免 jsdom 中 fflate 将跨 realm 字节误认为目录。浏览器与单元均实际解析 XML，保留实体和解压上限检测。
- 备份容量测试同步到明确的 9 MiB 新上限，保留超限拒绝。
