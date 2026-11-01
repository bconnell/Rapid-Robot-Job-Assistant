import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { extractTextFromDocx } from '../../src/shared/parsing/DocxResumeParser';

const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function createDocx(
  documentXml: string,
  extraEntries = 0,
  declareDocumentSizeAs?: number
): Promise<File> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
  );
  zip.file(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
  );
  zip.file('word/document.xml', documentXml.replaceAll('WORD_NAMESPACE', wordNamespace));
  for (let index = 0; index < extraEntries; index += 1) {
    zip.file(`custom/entry-${index}.xml`, '<entry/>');
  }
  const data = await zip.generateAsync({ type: 'uint8array' });
  const buffer = new ArrayBuffer(data.byteLength);
  const bytes = new Uint8Array(buffer);
  bytes.set(data);
  if (declareDocumentSizeAs !== undefined) {
    const view = new DataView(buffer);
    for (let offset = 0; offset <= bytes.byteLength - 46; offset += 1) {
      if (view.getUint32(offset, true) === 0x02014b50 && bytes[offset + 46] === 'w'.charCodeAt(0)) {
        const nameLength = view.getUint16(offset + 28, true);
        const name = new TextDecoder().decode(
          bytes.subarray(offset + 46, offset + 46 + nameLength)
        );
        if (name === 'word/document.xml') {
          const localHeaderOffset = view.getUint32(offset + 42, true);
          view.setUint32(offset + 24, declareDocumentSizeAs, true);
          view.setUint32(localHeaderOffset + 22, declareDocumentSizeAs, true);
          break;
        }
      }
    }
  }
  const file = new File([buffer], 'synthetic-resume.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  return Object.assign(file, { arrayBuffer: async () => buffer });
}

function documentXml(body: string): string {
  return `<w:document xmlns:w="WORD_NAMESPACE"><w:body>${body}</w:body></w:document>`;
}

describe('extractTextFromDocx', () => {
  it('rejects files over the input bound before reading them', async () => {
    let readCount = 0;
    const file = {
      name: 'oversized.docx',
      size: 10 * 1024 * 1024 + 1,
      arrayBuffer: async () => {
        readCount += 1;
        return new ArrayBuffer(0);
      }
    } as File;

    const result = await extractTextFromDocx(file);

    expect(result.ok).toBe(false);
    expect(readCount).toBe(0);
  });

  it('extracts paragraph, tab, line-break, and table text from a synthetic DOCX', async () => {
    const file = await createDocx(
      documentXml(
        '<w:p><w:r><w:t>Alex Example</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>Professional Experience</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>Senior Engineer</w:t><w:tab/><w:t>Northstar Labs</w:t><w:br/><w:t>2022 - Present</w:t></w:r></w:p>' +
          '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>TypeScript</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>React</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
      )
    );

    const result = await extractTextFromDocx(file);

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Alex Example');
      expect(result.value).toContain('Professional Experience');
      expect(result.value).toMatch(/Senior Engineer\s+Northstar Labs/);
      expect(result.value).toContain('Northstar Labs\n2022 - Present');
      expect(result.value).toContain('TypeScript');
      expect(result.value).toContain('React');
    }
  });

  it('rejects document XML whose uncompressed content exceeds the parser bound', async () => {
    const oversizedText = 'x'.repeat(2 * 1024 * 1024);
    const file = await createDocx(documentXml(`<w:p><w:r><w:t>${oversizedText}</w:t></w:r></w:p>`));

    const result = await extractTextFromDocx(file);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('document content exceeds the supported size');
  });

  it('enforces the uncompressed XML bound even if ZIP metadata understates its size', async () => {
    const oversizedText = 'x'.repeat(3 * 1024 * 1024);
    const file = await createDocx(
      documentXml(`<w:p><w:r><w:t>${oversizedText}</w:t></w:r></w:p>`),
      0,
      1
    );

    const result = await extractTextFromDocx(file);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('document content exceeds the supported size');
  });

  it('rejects archives with too many entries before parsing document content', async () => {
    const file = await createDocx(
      documentXml('<w:p><w:r><w:t>Alex Example resume</w:t></w:r></w:p>'),
      2048
    );

    const result = await extractTextFromDocx(file);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('too many files');
  });

  it('rejects XML documents with a DTD instead of expanding entities', async () => {
    const file = await createDocx(
      `<!DOCTYPE w:document [<!ENTITY resume "Alex Example">]>${documentXml('<w:p><w:r><w:t>&resume;</w:t></w:r></w:p>')}`
    );

    const result = await extractTextFromDocx(file);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('DOCTYPE is not supported');
  });
});
