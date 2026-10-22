# ProfileVault

[简体中文](README.md) | [English](README.en.md)

**Keep your application details on your computer and fill job or internship forms in batches.**

Version **0.2.1**, for desktop Chrome and Edge. Store Chinese and English details, multiple education records, internships, employment, projects, and resume attachments. After installation it runs independently: no Codex, ChatGPT, API key, paid model, or server is required.

> First-time setup: download → load the extension → create a profile → open an application form → scan and fill. Regular users do not need Node.js or coding tools.

## 1. Download and install

Download **[ProfileVault v0.2.1](https://github.com/JasmineLyf/-profilevault/raw/refs/heads/main/release/profilevault-0.2.1.zip)**.

Use this installation package. GitHub's green Code → Download ZIP provides source code, which cannot be loaded directly as the extension.

Extract the package into a permanent folder, such as `D:\Apps\ProfileVault` on Windows. Inside, you should see `manifest.json` and folders including `ui`, `content`, and `background`. Select this extracted folder when loading the extension, not the ZIP or a parent folder. Keep it in place after installation: the browser continues to read its files.

### Chrome

1. Enter `chrome://extensions` in the address bar.
2. Enable Developer mode in the top-right corner.
3. Click Load unpacked.
4. Select the extracted folder containing `manifest.json`.
5. Confirm that a ProfileVault card appears.
6. Open the puzzle-piece menu in the toolbar and pin ProfileVault.

### Edge

1. Enter `edge://extensions` in the address bar.
2. Enable Developer mode and click Load unpacked.
3. Select the folder containing `manifest.json`.
4. Open the Extensions menu and choose to show ProfileVault in the toolbar.

Button wording may vary by browser version. This is a locally loaded extension, not an extension-store installation.

## 2. Create your local vault

Click the ProfileVault toolbar icon. A separate window opens with **创建本地资料库** (Create a local vault). The current interface primarily uses Chinese labels; the instructions below include the labels you need.

Choose **保护方式** (Protection mode):

| Mode                            | Setup and daily use                                                                                                    | Suitable when                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Password protection             | Set and confirm a master password of at least 12 characters, then click 创建加密资料库. Unlock when opening the vault. | You want password protection for local data.               |
| 本机免口令 — Local passwordless | Select this mode and click 创建免口令资料库. Open without typing a password later.                                     | Convenience on a computer and browser profile you control. |

Passwordless mode stores a random unlock secret alongside the encrypted vault in the browser profile. Anyone with access to that profile may open your data; it offers less protection than password mode.

Keep your master password safe. There is no email or customer-support recovery service.

## 3. Create and complete a profile

Click **创建第一个档案** (Create your first profile). A vault holds your data; a profile is one set of application details. Start with one profile and add others for different purposes if needed.

1. Give 档案名称 (Profile name) an internal label, such as “My applications.”
2. Enter your name, email, phone, and address. Leave unknown or unnecessary information blank.
3. Chinese and English names, addresses, and organization fields are adjacent, so you can enter both versions together.
4. Enter phone country calling code and national number separately. For example, a Chinese mobile number uses `+86` as the calling code. Email, phone, country code, and postal code are shared.
5. Click **保存资料** (Save profile) and wait for a success message. Editing or parsing alone does not save the profile.

**The two languages must be maintained separately; there is no automatic translation.** Use the institution's or company's official English name. Fields missing English content may remain empty when you choose English filling.

### Education

Click **＋ 添加教育经历 / Add education**. Add the bachelor's, master's, doctoral, or other records that actually apply to you. Each record supports bilingual school, major, description, degree, and start/end months.

Mark **最高学历 / Highest education** and **当前学历 / Current education** as appropriate. They may refer to the same record or different records. Follow your actual status and the application's requirements; the extension does not determine whether a degree has been awarded.

The preview prefers current education, then highest education. A single education record can also be selected automatically. You can change the selection before filling.

### Internships, employment, and projects

Click **＋ 添加实习／工作／项目经历** (Add internship/work/project). Choose the type and enter bilingual company or project name, title, description, and dates. Mark ongoing records as current where appropriate.

With multiple records, choose which one to use in the filling preview. Repeated sections can use different records per field.

## 4. Attach and parse resumes

In the resume section of the profile editor:

1. Set **简历语言** (Resume language) to Chinese or English.
2. Click **添加并解析简历** (Add and parse resume) and choose a PDF or DOCX in that language.
3. Wait for local parsing. Expand **检查提取的全文** (Inspect extracted text) to review the text.
4. Under **解析建议** (Suggestions), use **采用此项** (Adopt this item) for name, email, or website candidates. Confirm any replacement of an existing value.
5. Use **添加为教育经历草稿** (Add education draft) or **添加为经历草稿** (Add experience draft), then correct the resulting school, company, title, dates, and other details. Phone candidates require manual country-code review and entry.
6. Click **保存资料** (Save profile). Switch resume language and repeat for the other file if needed.

**Attaching a file does not automatically apply every extracted suggestion.** The original file is retained for uploading; suggestions must be adopted or edited and then saved.

| Limit          | Details                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Formats        | PDF and DOCX; legacy DOC is unsupported.                                                                  |
| Files          | One Chinese and one English resume per profile. A new file in the same language replaces that attachment. |
| File size      | Up to 2 MiB each.                                                                                         |
| PDF length     | Up to 30 pages.                                                                                           |
| Extracted text | Up to 60,000 characters.                                                                                  |
| Total vault    | Up to 6 MiB of plaintext, including attachments.                                                          |

Parsing uses local text extraction and rules, not a language model. Complex layouts may need correction. Scanned image-only PDFs have no extractable text, and OCR is not included. If the message says the file was added but parsing failed, you can still save the attachment, enter details manually, and use that file later.

## 5. Fill an application form

### Open the form before clicking the extension

Open the actual job or internship application page, with its name, education, and other inputs visible. Click the ProfileVault toolbar icon on that page. The extension binds to the page where you clicked it.

Choose your profile, open **网页填写** (Web form filling), and click **扫描当前目标网页** (Scan the current target page). **Scanning identifies fields; it does not write data yet.**

### Choose the information to use

The **检查本次填写** (Review this fill) preview contains:

- **填写语言 / Language:** choose Chinese details or English profile.
- **本次教育经历:** choose the education record for this application.
- **本次实习／工作／项目经历:** choose the relevant experience record, especially when you have several.
- **表单分区:** view all form sections or focus on one section.

After changing language or records, review **拟填值** (Proposed value). **Empty fields with available data and a clear match are selected automatically**, including supported dropdowns and resume inputs. You do not need to tick each field.

### Fill once, then check the website

1. Confirm the website, data sources, and proposed values. Untick anything you do not want to share.
2. Click **填写已选 N 项** (Fill N selected fields). Results are shown per field; one failure does not mean every field failed.
3. Return to the application page and check the actual school, degree, country, city, dates, and attachment.
4. Complete unsupported or additional questions yourself, then submit the application yourself.

Existing values are not overwritten automatically. Approve overwriting a field before selecting it for replacement. **撤销本次填写** (Undo this fill) can restore eligible text fields, but does not forcibly undo fields you subsequently edited. Custom dropdowns and attachments have no extension undo: edit or remove them on the website.

### Dropdowns

Native selects and some searchable or scrollable comboboxes are supported. Degree aliases include `PhD`, `Ph.D.`, and `Doctor of Philosophy (Ph.D.)`; medical and law doctorates are not treated as equivalents.

Countries and common cities have Chinese/English aliases, such as 中国/China and 北京市/Beijing. Search can retry in the other language. Unlisted cities use your saved value in the chosen language.

The extension selects only a unique available match. Not every custom widget, remote search, or virtualized list is supported. If selection fails, choose manually; do not enter incorrect personal data just to force a match.

### Multiple education or experience sections

Click Add another on the website yourself, then scan again. In the preview, assign the appropriate records to the relevant fields and review before filling. The extension does not create website rows automatically.

### Resume upload

The chosen filling language determines which saved resume is attached. Only clearly identified Resume/CV inputs are used, and the file must satisfy the website's accepted formats. Cover letter inputs are excluded.

A website may upload immediately after file selection. **It can receive the attachment or field values before you click Submit.** Use trusted websites and verify the filename on the page.

## 6. Back up your data

Open **备份与安全** (Backup and security) and click **导出加密备份** (Export encrypted backup). Store the resulting JSON safely. Passwordless mode also requires a separate backup password and confirmation; the export does not include the local unlock secret.

To move to another computer or browser, install the extension and use **从加密备份恢复** (Restore from encrypted backup) or the backup page's import option. Enter the backup password. After confirmation, import **replaces the whole vault; it does not merge profiles**. Maximum import size: 9 MiB.

Chrome, Edge, and different browser profiles do not sync automatically. Uninstalling the extension, clearing its storage, or deleting a browser profile can erase data. Back up regularly.

## 7. Troubleshooting

**No toolbar icon?** Open the browser's puzzle-piece/Extensions menu and pin ProfileVault. If it is missing there too, check that it is loaded and enabled on the extensions page.

**Cannot find manifest.json?** You may have selected the ZIP, source directory, or a parent folder. Locate the extracted manifest.json and select its containing folder.

**Zero fields selected?** Confirm your profile is saved, the correct profile and language are selected, translated values exist, education/experience records are chosen, and the website inputs are empty. Unclear matches remain unselected; review the source mapping or enter them manually.

**Scanning fails, the target expires, or the preview belongs to another page?** Close the extension window, click its toolbar icon on the correct application page, and scan again. Rescan after navigation, page refresh, or dynamically adding form rows.

**School, city, or degree not selected?** Check official names, language, and the chosen record. Missing website options, ambiguous matches, and unsupported controls require manual selection.

**Incorrect parsed company, title, or dates?** Treat parsing results as drafts, correct them, and save. For scanned PDFs, use another tool to create a text-based document or enter details manually.

**What about identity documents, verification codes, or consent?** Handle these yourself on the website. Passwords, verification codes, payment details, and other blocked fields are excluded. The extension does not click Next, accept terms, or submit applications.

**Why does it not work on some pages?** It targets ordinary webpage main documents. Browser internal pages, extension stores, browser PDF viewers, local file:// pages, and some iframes, closed shadow roots, or custom widgets are unsupported.

**Is my data sent to a cloud service?** The extension has no backend, model API, or cloud sync. Storage and parsing are local. Once you approve filling a website, that website can read or upload the information. See [privacy notes](PRIVACY.md).

## For developers: build from source

Regular users can use the installation package above. Development requires Node.js 22.13+; validated with Node.js 24.

```sh
git clone https://github.com/JasmineLyf/-profilevault.git profilevault
cd profilevault
npm ci
npm run build
```

Load the generated dist folder. `npm run package` creates the installation ZIP. Technical notes, currently in Chinese: [testing](docs/TESTING.md), [validation](docs/ACCEPTANCE.md), [security](docs/SECURITY.md), and [compatibility](docs/COMPATIBILITY.md).
