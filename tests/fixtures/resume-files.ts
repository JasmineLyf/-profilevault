import { zipSync, strToU8 } from 'fflate';
export function chineseResume() {
  const lines = [
    '乔云',
    'qiao.yun@example.test',
    '教育经历',
    '示例大学 本科 2020.09-2024.06',
    '实习经历',
    '示例科技有限公司 软件工程实习生',
    '开发表单测试工具',
  ];
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    lines.map((l) => '<w:p><w:r><w:t>' + l + '</w:t></w:r></w:p>').join('') +
    '</w:body></w:document>';
  return zipSync({
    'word/document.xml': new Uint8Array(strToU8(xml)),
    '[Content_Types].xml': new Uint8Array(
      strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
      ),
    ),
  });
}
export function englishResume() {
  const lines = [
    'Yun Qiao',
    'qiao.yun@example.test',
    'Education',
    'Fictional University Bachelor of Science',
    'Internship - Fictional Labs',
  ];
  const content =
    'BT /F1 12 Tf 40 750 Td ' +
    lines
      .map((l, i) => (i ? '0 -20 Td ' : '') + '(' + l.replace(/[()\\]/g, (c) => '\\' + c) + ') Tj')
      .join(' ') +
    ' ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf +=
    'xref\n0 6\n0000000000 65535 f \n' +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
