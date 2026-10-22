# 兼容性（0.2.0）

目标为桌面 Chrome、Edge 的 Manifest V3。自动化使用已安装的 Chrome 和 Edge，运行真实生产扩展及隔离临时浏览器配置。

支持原生 input、textarea、select、月份控件；React 受控输入通过原生 setter 和事件更新。搜索、滚动式自定义选择要求可识别的 combobox / listbox / option 语义及确定关联；React Select 的可搜索与只读 dummyInput 两种形态均有夹具测试。禁用、歧义、无法确认完整性的虚拟列表会保守失败，不能承诺所有网站都能填。

附件支持明确标注的 Resume / CV 原生 file input，检查 accept 并派发文件变更事件；不填写 cover letter，不能操作操作系统文件对话框。不支持旧 DOC 或扫描件 OCR。PDF 和 DOCX 本地解析，不做自动翻译。

重复教育/经历区由用户在网页新增，再重新扫描并逐行选择记录。自定义下拉和文件不提供撤销；文本撤销仅对未被用户再次修改的合格字段生效。跨域 iframe、封闭 shadow DOM、非语义自绘控件等可能需要手填。

真实 Greenhouse 页面只作只读结构核对，未填写或投递；可搜索学校和学历的实现通过本地真实 React Select 夹具验证。不能把这一结果视为所有 Greenhouse 职位或招聘平台的兼容保证。
