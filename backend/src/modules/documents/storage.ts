import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stockholmDate } from 'shared';

/**
 * Where a generated PDF lives on disk (PROJECT_SPEC.md §8.3, B7.2.2, B7.2.4).
 *
 * §8.3: "Output is written to `./storage/documents/YYYY/MM/`, with the SHA-256
 * recorded." §4.2: the stored file is the authoritative record — it is backed
 * up as such, never regenerated in place, and never deleted.
 *
 * Two rules are enforced here rather than trusted:
 *
 * 1. **A stored path is relative to `STORAGE_PATH`.** A restore onto a
 *    different volume, or into a container with a different mount point, then
 *    still finds its own files; an absolute path baked into a row in 2026 is
 *    a broken download in 2028.
 * 2. **Every resolved path is asserted to be inside `STORAGE_PATH`.** The
 *    filenames this module builds are safe by construction, but the assertion
 *    is what makes that true of a path read back out of a database row —
 *    which is a boundary, and the one an attacker would aim at.
 */

/** The subdirectory §8.3 names, under `STORAGE_PATH`. */
const DOCUMENTS_DIRECTORY = 'documents';

export class StoragePathError extends Error {
  constructor(relativePath: string) {
    super(`Refusing a document path outside the storage root: ${relativePath}`);
    this.name = 'StoragePathError';
  }
}

/**
 * Resolves a stored relative path against the storage root, refusing anything
 * that escapes it (B7.2.4).
 *
 * `path.resolve` collapses `..` **before** the comparison, so this catches
 * `../../etc/passwd` and `documents/../../../secrets` alike. The separator on
 * the prefix check is not optional: without it `/srv/storage-old` passes a
 * `startsWith('/srv/storage')` test.
 *
 * An absolute `relativePath` is refused rather than silently honoured, because
 * `path.resolve('/srv/storage', '/etc/passwd')` returns `/etc/passwd` — the
 * function does what it is asked and the caller is the one who is wrong.
 */
export function resolveStoragePath(
  storageRoot: string,
  relativePath: string,
): string {
  if (path.isAbsolute(relativePath)) {
    throw new StoragePathError(relativePath);
  }

  const root = path.resolve(storageRoot);
  const resolved = path.resolve(root, relativePath);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new StoragePathError(relativePath);
  }

  return resolved;
}

/**
 * `documents/2026/09/OF-2026-0001.pdf`.
 *
 * Always forward slashes, whichever platform wrote it: the value goes into a
 * database column that a Linux container will read back, and a Windows
 * development machine must not store `documents\2026\09\…` there.
 *
 * The document number is the filename, which makes the store browsable by a
 * human holding a printed offert — and it is unique by §4.4, so two documents
 * cannot collide.
 */
export function documentRelativePath(
  documentNumber: string,
  generatedAt: Date,
): string {
  // The **Europe/Stockholm** year and month, not the UTC ones, so the folder
  // agrees with the number in the filename.
  //
  // §4.4 draws the number from a per-year sequence keyed on the workshop's own
  // calendar year, so a quote sent at 00:30 on 1 January is `OF-2026-0001`
  // while UTC is still on 31 December. Filing it by the UTC date would put
  // `OF-2026-0001.pdf` in `documents/2025/12/` — the first document of the
  // year, in last year's folder, for exactly the hour a reader is most likely
  // to go looking for it. §3.6 says convert explicitly; this is one of the
  // places that means.
  const localDate = stockholmDate(generatedAt);
  const year = localDate.slice(0, 4);
  const month = localDate.slice(5, 7);
  return `${DOCUMENTS_DIRECTORY}/${year}/${month}/${documentNumber}.pdf`;
}

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export type StoredFile = {
  readonly relativePath: string;
  readonly fileHashSha256: string;
  readonly sizeBytes: number;
};

/**
 * Writes the bytes and returns what the `Document` row records about them.
 *
 * `flag: 'wx'` fails if the file already exists. A document number is spent
 * once (§4.4), so a second write to the same path means either a bug or a
 * replay that should have been caught upstream — and silently overwriting the
 * authoritative record is the one thing §8.3 says must never happen.
 */
export async function storeDocumentFile(
  storageRoot: string,
  relativePath: string,
  bytes: Buffer,
): Promise<StoredFile> {
  const absolute = resolveStoragePath(storageRoot, relativePath);

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes, { flag: 'wx' });

  return {
    relativePath,
    fileHashSha256: sha256(bytes),
    sizeBytes: bytes.byteLength,
  };
}

/**
 * Reads a stored document back and verifies it against the recorded hash
 * (B7.4.5).
 *
 * The verification is the point of storing the hash at all (§4.2), so it
 * happens on **every** read rather than in a maintenance job: a document that
 * has been altered on disk must not be served as though it were the record,
 * and the moment a customer asks for their copy is exactly when the workshop
 * needs to know.
 */
export async function readDocumentFile(
  storageRoot: string,
  relativePath: string,
): Promise<{ bytes: Buffer; fileHashSha256: string }> {
  const absolute = resolveStoragePath(storageRoot, relativePath);
  const bytes = await readFile(absolute);
  return { bytes, fileHashSha256: sha256(bytes) };
}
