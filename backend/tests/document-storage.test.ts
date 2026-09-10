import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  StoragePathError,
  documentRelativePath,
  readDocumentFile,
  resolveStoragePath,
  sha256,
  storeDocumentFile,
} from '../src/modules/documents/storage.js';
import { createStorageRoot } from './helpers/quotes.js';

/**
 * Document storage (B7.2.2, B7.2.4).
 *
 * §8.3 puts the output under `STORAGE_PATH/documents/YYYY/MM/` with the
 * SHA-256 recorded, and §4.2 makes the stored file the authoritative record.
 * These tests are about the two properties that make that trustworthy: the
 * path cannot escape the root, and the bytes cannot be silently replaced.
 */

let storage: Awaited<ReturnType<typeof createStorageRoot>>;

beforeAll(async () => {
  storage = await createStorageRoot();
});

afterAll(async () => {
  await storage.remove();
});

describe('B7.2.2 — the filing location', () => {
  it('files a document under documents/YYYY/MM by its number', () => {
    expect(
      documentRelativePath('OF-2026-0001', new Date('2026-09-10T08:00:00Z')),
    ).toBe('documents/2026/09/OF-2026-0001.pdf');
  });

  it('files by the workshop’s calendar date, not by UTC', () => {
    // 00:30 on 1 January in Stockholm is still 31 December in UTC. §4.4 keys
    // the sequence on the workshop's year, so this document is
    // `OF-2026-0001` — and filing it by UTC would put the first document of
    // the year in last year's folder.
    expect(
      documentRelativePath('OF-2026-0001', new Date('2025-12-31T23:30:00Z')),
    ).toBe('documents/2026/01/OF-2026-0001.pdf');

    // The mirror case: mid-afternoon in July is the same date either way, so
    // the conversion must not shift a date that does not need shifting.
    expect(
      documentRelativePath('OF-2026-0042', new Date('2026-07-15T13:00:00Z')),
    ).toBe('documents/2026/07/OF-2026-0042.pdf');
  });

  it('always uses forward slashes, whichever platform wrote it', () => {
    // The value goes into a column a Linux container reads back. A Windows
    // development machine storing `documents\2026\09\…` would produce a row
    // that only the machine that wrote it can resolve.
    const relative = documentRelativePath(
      'SP-2027-0123',
      new Date('2027-01-05T00:00:00Z'),
    );
    expect(relative).not.toContain('\\');
    expect(relative).toBe('documents/2027/01/SP-2027-0123.pdf');
  });
});

describe('B7.2.4 — the resolved path is asserted to be inside STORAGE_PATH', () => {
  const root = path.resolve('/srv/storage');

  it('accepts a path under the root', () => {
    expect(resolveStoragePath(root, 'documents/2026/09/OF-2026-0001.pdf')).toBe(
      path.join(root, 'documents', '2026', '09', 'OF-2026-0001.pdf'),
    );
  });

  it('refuses a traversal, however it is spelled', () => {
    for (const attempt of [
      '../secrets.pdf',
      'documents/../../etc/passwd',
      'documents/2026/../../../../root/.ssh/id_rsa',
      '..',
    ]) {
      expect(() => resolveStoragePath(root, attempt)).toThrow(StoragePathError);
    }
  });

  it('refuses an absolute path', () => {
    // `path.resolve('/srv/storage', '/etc/passwd')` is `/etc/passwd`: the
    // function does exactly what it is asked, and the caller is the one who is
    // wrong. Without this branch the containment check never even runs.
    expect(() => resolveStoragePath(root, path.resolve('/etc/passwd'))).toThrow(
      StoragePathError,
    );
  });

  it('refuses a sibling directory that shares the root’s prefix', () => {
    // `/srv/storage-old` starts with `/srv/storage`. A `startsWith` check
    // without the separator would let it through, and it is a different volume.
    expect(() =>
      resolveStoragePath(root, path.join('..', 'storage-old', 'leak.pdf')),
    ).toThrow(StoragePathError);
  });
});

describe('storing and reading back', () => {
  const bytes = Buffer.from('%PDF-1.7 pretend document ÅÄÖ', 'utf8');
  const relative = 'documents/2026/09/OF-2026-9001.pdf';

  it('writes the file, creating the month directory', async () => {
    const stored = await storeDocumentFile(storage.path, relative, bytes);

    expect(stored.relativePath).toBe(relative);
    expect(stored.sizeBytes).toBe(bytes.byteLength);
    expect(stored.fileHashSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.fileHashSha256).toBe(sha256(bytes));

    const onDisk = await readFile(path.join(storage.path, relative));
    expect(onDisk.equals(bytes)).toBe(true);
  });

  it('refuses to overwrite a document that already exists', async () => {
    // A §4.4 number is spent once. A second write to the same path is a bug or
    // an uncaught replay, and silently overwriting the authoritative record is
    // the one thing §8.3 says must never happen.
    await expect(
      storeDocumentFile(storage.path, relative, Buffer.from('different')),
    ).rejects.toThrow(/EEXIST/);
  });

  it('reads the bytes back with their hash', async () => {
    const read = await readDocumentFile(storage.path, relative);

    expect(read.bytes.equals(bytes)).toBe(true);
    expect(read.fileHashSha256).toBe(sha256(bytes));
  });

  it('reports a different hash once the file is altered on disk', async () => {
    const altered = 'documents/2026/09/OF-2026-9002.pdf';
    const stored = await storeDocumentFile(storage.path, altered, bytes);

    await writeFile(
      path.join(storage.path, altered),
      Buffer.from('%PDF-1.7 tampered'),
    );

    const read = await readDocumentFile(storage.path, altered);
    expect(read.fileHashSha256).not.toBe(stored.fileHashSha256);
  });

  it('refuses to read through a traversal', async () => {
    await expect(
      readDocumentFile(storage.path, '../../../etc/passwd'),
    ).rejects.toThrow(StoragePathError);
  });
});
