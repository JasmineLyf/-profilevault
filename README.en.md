# ProfileVault

[简体中文](README.md) | [English](README.en.md)

Version 0.2.1. A local-first profile vault and form-filling extension for desktop Chrome and Edge. It runs independently after installation: no server, Codex, model API, account, training, telemetry, or cloud sync is required.

## Install

1. Download [profilevault-0.2.1.zip](release/profilevault-0.2.1.zip) and extract it into a permanent folder.
2. Open chrome://extensions or edge://extensions and enable Developer mode.
3. Click **Load unpacked** and select the extracted folder containing manifest.json. When building from source, select dist instead.
4. Pin ProfileVault to the browser toolbar if desired.

To update, export an encrypted backup, replace the files in the same installation folder, and click Reload on the extension card. Close and reopen its window, refresh the application page, and scan again. Do not uninstall: uninstalling may delete local data. Existing v1 vaults open with their original password; saving upgrades them to v2, which older versions cannot read.

## Create your profile

Choose password protection or local passwordless mode when creating a vault. Existing users can switch under **备份与安全** (Backup and security), verifying the current password when necessary.

Passwordless mode stores a random unlock secret alongside the encrypted vault in the browser profile. Anyone who can access that profile may open your data. It offers less protection than password mode. Exporting from passwordless mode still requires a separate backup password.

Enter Chinese and English names, addresses, and organizations in adjacent fields. The two languages are maintained separately; there is no automatic translation. Phone and email are shared. Add multiple education records and mark the highest and current education independently. Add internships, employment, or projects as needed.

## Import and parse resumes

Attach one Chinese and one English resume, each PDF or DOCX and at most 2 MiB. The extension extracts text locally and suggests names, email, phone, websites, education, and experience candidates. Adopt individual suggestions or add editable record drafts, correct the results, and save your profile. Phone suggestions require manual country-code review. The original files are retained for attaching to application forms.

Parsing is rule based, not powered by a language model. Complex layouts may need manual correction, especially company names and job titles. Scanned PDFs have no OCR; legacy DOC is unsupported. PDF limit: 30 pages. Extracted text limit: 60,000 characters. Total vault plaintext limit: 6 MiB; backup file limit: 9 MiB.

## Fill an application

1. Open the application page and click the ProfileVault toolbar icon.
2. Unlock if needed, then scan the page. Choose the profile language and education/experience record in the preview.
3. Empty fields with available data and a clear match are selected automatically, including supported dropdowns and resume inputs. Review the batch and click **填写已选 … 项** (Fill selected fields). You do not need to tick each field.
4. Existing values are not overwritten automatically. Ambiguous or unsupported fields need review or manual entry.
5. Native select controls and supported searchable/scrollable comboboxes are handled. Degree aliases include PhD, Ph.D., and Doctor of Philosophy (Ph.D.), without treating medical or law doctorates as equivalent. Country and common city aliases work across Chinese and English, such as 中国/China and 北京市/Beijing. Search can retry in the other language. Unlisted cities use the exact saved value; maintain their English version when needed.
6. For repeated education or experience, click Add another on the website, scan again, and select the appropriate record for each row. The extension does not create website rows automatically.
7. Resume files are attached only to clearly identified Resume/CV inputs that accept the format. The website may upload a file immediately after selection. Custom dropdowns and files do not have extension undo; ordinary text supports conditional undo when it has not subsequently been edited.

The extension does not submit applications, click Next, or accept terms. Passwords, verification codes, payment details, and other blocked fields remain excluded. Compatibility with every custom widget, virtualized list, iframe, or closed shadow root is not guaranteed.

## Backup and recovery

Use Backup and security to export an encrypted JSON backup. Keep its password separately. Import verifies the backup and replaces the whole vault after confirmation. Passwordless exports require a backup password and do not contain the local unlock secret. Passwords cannot be recovered through a service.

## Build from source

Requires Node.js 22.13+; validated with Node.js 24.

```sh
git clone https://github.com/JasmineLyf/-profilevault.git profilevault
cd profilevault
npm ci
npm run build
```

Load dist in the browser. Run npm run package to create the installation ZIP. Development checks: npm run typecheck, npm run lint, npm test, and npm run test:e2e (requires installed Chrome; set PV_BROWSER=msedge for Edge).

See [privacy](PRIVACY.md), [security](docs/SECURITY.md), [compatibility](docs/COMPATIBILITY.md), and [validation notes](docs/ACCEPTANCE.md). These technical notes are currently in Chinese. Automated checks are not an independent security audit or a guarantee of compatibility with all recruitment websites.
