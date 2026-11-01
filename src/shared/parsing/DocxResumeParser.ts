import JSZip from 'jszip';
import { err, ok, type Result } from '../utils/Result';
import { extractPlainTextFromPaste } from './ResumeTextExtractor';

const maxDocxBytes = 10 * 1024 * 1024;
const maxArchiveEntries = 2048;
const maxCentralDirectoryBytes = 2 * 1024 * 1024;
const maxDocumentXmlBytes = 2 * 1024 * 1024;
const endOfCentralDirectorySignature = 0x06054b50;
const centralDirectoryFileHeaderSignature = 0x02014b50;
const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const documentXmlPath = 'word/document.xml';

type DocumentXmlMetadata = {
  compressionMethod: number;
  uncompressedSize: number;
};

type ArchiveInspection = {
  documentXml: DocumentXmlMetadata;
};

type ZipByteStream = {
  on(event: 'data', callback: (chunk: Uint8Array) => void): ZipByteStream;
  on(event: 'end', callback: () => void): ZipByteStream;
  on(event: 'error', callback: (error: Error) => void): ZipByteStream;
  pause(): ZipByteStream;
  resume(): ZipByteStream;
};

type StreamableZipFile = {
  internalStream(type: 'uint8array'): ZipByteStream;
};

export async function extractTextFromDocx(file: File): Promise<Result<string>> {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return err('Only .docx files are supported by this parser.');
  }
  if (file.size > maxDocxBytes) {
    return err('The .docx file is too large. Keep it under 10 MB.');
  }

  try {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > maxDocxBytes) {
      return err('The .docx file is too large. Keep it under 10 MB.');
    }

    const inspection = inspectDocxArchive(buffer);
    if (!inspection.ok) return inspection;

    const archive = await JSZip.loadAsync(buffer, { checkCRC32: false });
    const documentFile = archive.file(documentXmlPath);
    if (!documentFile) return err('The .docx archive does not contain a Word document.');

    const xmlBytes = await readZipEntryBounded(documentFile as unknown as StreamableZipFile);
    if (xmlBytes.byteLength !== inspection.value.documentXml.uncompressedSize) {
      return err('The .docx archive document size does not match its directory.');
    }
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(xmlBytes);
    const text = extractWordDocumentText(xml);
    if (!text.ok) return text;

    return extractPlainTextFromPaste(text.value);
  } catch (error) {
    if (error instanceof Error && error.message === 'DOCX_XML_SIZE_LIMIT') {
      return err('The .docx document content exceeds the supported size of 2 MB.');
    }
    return err('The .docx file could not be parsed in this browser context.');
  }
}

function inspectDocxArchive(buffer: ArrayBuffer): Result<ArchiveInspection> {
  const bytes = new DataView(buffer);
  const archiveEnd = buffer.byteLength;
  const earliestEndOffset = Math.max(0, archiveEnd - 22 - 0xffff);
  let endRecordOffset = -1;

  for (let offset = archiveEnd - 22; offset >= earliestEndOffset; offset -= 1) {
    if (
      bytes.getUint32(offset, true) === endOfCentralDirectorySignature &&
      offset + 22 + bytes.getUint16(offset + 20, true) === archiveEnd
    ) {
      endRecordOffset = offset;
      break;
    }
  }
  if (endRecordOffset < 0 || archiveEnd < 22) {
    return err('The .docx archive is invalid or incomplete.');
  }

  const diskNumber = bytes.getUint16(endRecordOffset + 4, true);
  const centralDirectoryDisk = bytes.getUint16(endRecordOffset + 6, true);
  const entriesOnDisk = bytes.getUint16(endRecordOffset + 8, true);
  const entryCount = bytes.getUint16(endRecordOffset + 10, true);
  const centralDirectorySize = bytes.getUint32(endRecordOffset + 12, true);
  const centralDirectoryOffset = bytes.getUint32(endRecordOffset + 16, true);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    return err('The .docx archive uses an unsupported split or ZIP64 format.');
  }
  if (entryCount > maxArchiveEntries) {
    return err('The .docx archive contains too many files to parse safely.');
  }
  if (
    centralDirectorySize > maxCentralDirectoryBytes ||
    centralDirectoryOffset + centralDirectorySize > endRecordOffset
  ) {
    return err('The .docx archive directory is too large or invalid.');
  }

  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  let cursor = centralDirectoryOffset;
  let documentXml: DocumentXmlMetadata | undefined;

  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > centralDirectoryEnd ||
      bytes.getUint32(cursor, true) !== centralDirectoryFileHeaderSignature
    ) {
      return err('The .docx archive directory is invalid.');
    }

    const compressionMethod = bytes.getUint16(cursor + 10, true);
    const compressedSize = bytes.getUint32(cursor + 20, true);
    const uncompressedSize = bytes.getUint32(cursor + 24, true);
    const nameLength = bytes.getUint16(cursor + 28, true);
    const extraLength = bytes.getUint16(cursor + 30, true);
    const commentLength = bytes.getUint16(cursor + 32, true);
    const localHeaderOffset = bytes.getUint32(cursor + 42, true);
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;

    if (
      entryEnd > centralDirectoryEnd ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff ||
      localHeaderOffset >= centralDirectoryOffset
    ) {
      return err('The .docx archive directory is invalid or uses ZIP64.');
    }

    if (matchesAsciiPath(buffer, cursor + 46, nameLength, documentXmlPath)) {
      if (documentXml) return err('The .docx archive contains duplicate document files.');
      if (uncompressedSize > maxDocumentXmlBytes) {
        return err('The .docx document content exceeds the supported size of 2 MB.');
      }
      if (compressionMethod !== 0 && compressionMethod !== 8) {
        return err('The .docx document uses an unsupported compression method.');
      }
      documentXml = { compressionMethod, uncompressedSize };
    }

    cursor = entryEnd;
  }

  if (!documentXml) return err('The .docx archive does not contain a Word document.');
  if (cursor > centralDirectoryEnd) return err('The .docx archive directory is invalid.');
  return ok({ documentXml });
}

function matchesAsciiPath(
  buffer: ArrayBuffer,
  offset: number,
  length: number,
  expectedPath: string
): boolean {
  if (length !== expectedPath.length) return false;
  const bytes = new Uint8Array(buffer, offset, length);
  for (let index = 0; index < expectedPath.length; index += 1) {
    if (bytes[index] !== expectedPath.charCodeAt(index)) return false;
  }
  return true;
}

function readZipEntryBounded(file: StreamableZipFile): Promise<Uint8Array> {
  const stream = file.internalStream('uint8array');
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let settled = false;

  return new Promise((resolve, reject) => {
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      stream.pause();
      reject(error);
    };

    stream
      .on('data', (chunk) => {
        if (settled) return;
        if (totalBytes + chunk.byteLength > maxDocumentXmlBytes) {
          fail(new Error('DOCX_XML_SIZE_LIMIT'));
          return;
        }
        chunks.push(chunk);
        totalBytes += chunk.byteLength;
      })
      .on('error', (error) => fail(error))
      .on('end', () => {
        if (settled) return;
        settled = true;
        const result = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.byteLength;
        }
        resolve(result);
      });

    stream.resume();
  });
}

function extractWordDocumentText(xml: string): Result<string> {
  if (/<!DOCTYPE\b/i.test(xml)) return err('DOCTYPE is not supported in a .docx document.');

  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const root = document.documentElement;
  if (root.localName === 'parsererror' || root.localName !== 'document') {
    return err('The .docx document XML is invalid.');
  }
  if (root.namespaceURI !== wordNamespace) {
    return err('The .docx document XML has an unsupported format.');
  }

  const body = Array.from(root.getElementsByTagNameNS(wordNamespace, 'body'))[0];
  if (!body) return err('The .docx document does not contain readable text.');

  return ok(readWordContent(body));
}

function readWordContent(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as Element;
  if (element.namespaceURI !== wordNamespace) return '';
  if (['del', 'delText', 'instrText', 'moveFrom'].includes(element.localName)) return '';
  if (element.localName === 'tab') return '\t';
  if (element.localName === 'br' || element.localName === 'cr') return '\n';

  const children = Array.from(element.childNodes).map(readWordContent).join('');
  if (element.localName === 'p') return `${children}\n\n`;
  if (element.localName === 'tc') return `${children}\t`;
  if (element.localName === 'tr') return `${children.replace(/\t+$/, '')}\n`;
  return children;
}
