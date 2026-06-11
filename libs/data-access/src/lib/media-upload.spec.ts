/**
 * Unit tests for ForgeMediaUpload and its pure helpers. No Firebase Storage
 * instance is ever created: the uploadBytesResumable/getDownloadURL calls sit
 * behind protected seams that this suite stubs with a hand-rolled fake task.
 */
import type { FirebaseStorage, UploadTask, UploadTaskSnapshot } from 'firebase/storage';
import {
  buildMediaPath,
  ForgeMediaUpload,
  MAX_MEDIA_BYTES,
  mediaAccept,
  slugifyFilename,
  validateMediaFile,
  type MediaKind,
} from './media-upload';

const FAKE_STORAGE = {} as FirebaseStorage;

/** Minimal File stand-in (jsdom-free Node environment). */
function fakeFile(name: string, type: string, size = 1024): File {
  return { name, type, size } as File;
}

type ProgressFn = (snapshot: UploadTaskSnapshot) => void;
type ErrorFn = (error: Error) => void;
type CompleteFn = () => void;

/** Hand-rolled UploadTask: records callbacks so tests can drive the upload. */
class FakeUploadTask {
  next: ProgressFn = () => undefined;
  error: ErrorFn = () => undefined;
  complete: CompleteFn = () => undefined;
  cancelled = false;
  readonly snapshot = { ref: { fullPath: 'fake' } } as UploadTaskSnapshot;

  on(_event: string, next?: ProgressFn, error?: ErrorFn, complete?: CompleteFn): void {
    if (next) this.next = next;
    if (error) this.error = error;
    if (complete) this.complete = complete;
  }

  cancel(): boolean {
    this.cancelled = true;
    return true;
  }

  emitProgress(bytesTransferred: number, totalBytes: number): void {
    this.next({ bytesTransferred, totalBytes } as UploadTaskSnapshot);
  }
}

class TestUploader extends ForgeMediaUpload {
  readonly task = new FakeUploadTask();
  readonly startCalls: { path: string; file: File }[] = [];
  downloadUrlResult: Promise<string> = Promise.resolve('https://cdn.example/file.png');

  protected override startUpload(_storage: FirebaseStorage, path: string, file: File): UploadTask {
    this.startCalls.push({ path, file });
    return this.task as unknown as UploadTask;
  }

  protected override resolveDownloadUrl(): Promise<string> {
    return this.downloadUrlResult;
  }
}

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('slugifyFilename', () => {
  it('lowercases, strips diacritics and squashes separators, keeping the extension', () => {
    expect(slugifyFilename('Säfety Brief (v2).PNG')).toBe('safety-brief-v2.png');
    expect(slugifyFilename('  spaces   everywhere .Mp4')).toBe('spaces-everywhere.mp4');
  });

  it('falls back to "file" when nothing slug-safe remains', () => {
    expect(slugifyFilename('***.png')).toBe('file.png');
    expect(slugifyFilename('???')).toBe('file');
  });

  it('treats dotfiles and extensionless names sensibly', () => {
    expect(slugifyFilename('.hidden')).toBe('hidden');
    expect(slugifyFilename('README')).toBe('readme');
  });
});

describe('buildMediaPath', () => {
  it('builds tenants/{tenantId}/media/{kind}/{timestamp}-{slug}', () => {
    expect(buildMediaPath('acme', 'image', 'Site Photo.JPG', 1700000000000)).toBe(
      'tenants/acme/media/image/1700000000000-site-photo.jpg',
    );
    expect(buildMediaPath('globex', 'cover', 'Hero.png', 42)).toBe(
      'tenants/globex/media/cover/42-hero.png',
    );
  });

  it('defaults the timestamp to now', () => {
    const before = Date.now();
    const path = buildMediaPath('acme', 'video', 'clip.mp4');
    const stamp = Number(/\/video\/(\d+)-clip\.mp4$/.exec(path)?.[1]);
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(Date.now());
  });
});

describe('mediaAccept', () => {
  it('accepts images for image and cover uploads, videos for video uploads', () => {
    expect(mediaAccept('image')).toBe('image/*');
    expect(mediaAccept('cover')).toBe('image/*');
    expect(mediaAccept('video')).toBe('video/*');
  });
});

describe('validateMediaFile', () => {
  it('accepts matching contentType per kind', () => {
    expect(validateMediaFile(fakeFile('a.png', 'image/png'), 'image')).toBeNull();
    expect(validateMediaFile(fakeFile('a.jpg', 'image/jpeg'), 'cover')).toBeNull();
    expect(validateMediaFile(fakeFile('a.mp4', 'video/mp4'), 'video')).toBeNull();
  });

  it('rejects contentType that does not match the kind', () => {
    expect(validateMediaFile(fakeFile('a.zip', 'application/zip'), 'image')).toMatch(/image/i);
    expect(validateMediaFile(fakeFile('a.mp4', 'video/mp4'), 'cover')).toMatch(/image/i);
    expect(validateMediaFile(fakeFile('a.png', 'image/png'), 'video')).toMatch(/video/i);
    expect(validateMediaFile(fakeFile('a', ''), 'image')).toMatch(/image/i);
  });

  it('rejects files at or over the 200MB rules limit (size < limit, like storage.rules)', () => {
    expect(validateMediaFile(fakeFile('a.png', 'image/png', MAX_MEDIA_BYTES - 1), 'image')).toBe(
      null,
    );
    expect(validateMediaFile(fakeFile('a.png', 'image/png', MAX_MEDIA_BYTES), 'image')).toMatch(
      /200\s?MB/,
    );
  });
});

describe('ForgeMediaUpload', () => {
  function start(uploader: TestUploader, kind: MediaKind = 'image', file?: File) {
    return uploader.upload(FAKE_STORAGE, {
      tenantId: 'acme',
      kind,
      file: file ?? fakeFile('Site Photo.JPG', 'image/jpeg'),
    });
  }

  it('uploads to the tenant media path and reports progress', () => {
    const uploader = new TestUploader();
    const handle = start(uploader);

    expect(uploader.startCalls).toHaveLength(1);
    expect(uploader.startCalls[0].path).toMatch(
      /^tenants\/acme\/media\/image\/\d+-site-photo\.jpg$/,
    );
    expect(handle.state()).toBe('running');
    expect(handle.progress()).toBe(0);

    uploader.task.emitProgress(50, 200);
    expect(handle.progress()).toBe(25);
    uploader.task.emitProgress(200, 200);
    expect(handle.progress()).toBe(100);
    expect(handle.downloadUrl()).toBeNull();
  });

  it('resolves the download URL and flips to success on completion', async () => {
    const uploader = new TestUploader();
    const handle = start(uploader);

    uploader.task.complete();
    await flushMicrotasks();

    expect(handle.state()).toBe('success');
    expect(handle.progress()).toBe(100);
    expect(handle.downloadUrl()).toBe('https://cdn.example/file.png');
    expect(handle.error()).toBeNull();
  });

  it('surfaces upload errors through the error/state signals', () => {
    const uploader = new TestUploader();
    const handle = start(uploader);

    uploader.task.error(new Error('storage/unauthorized'));

    expect(handle.state()).toBe('error');
    expect(handle.error()).toBe('storage/unauthorized');
    expect(handle.downloadUrl()).toBeNull();
  });

  it('surfaces getDownloadURL failures as errors', async () => {
    const uploader = new TestUploader();
    uploader.downloadUrlResult = Promise.reject(new Error('boom'));
    const handle = start(uploader);

    uploader.task.complete();
    await flushMicrotasks();

    expect(handle.state()).toBe('error');
    expect(handle.error()).toBe('boom');
  });

  it('cancel() forwards to the underlying task', () => {
    const uploader = new TestUploader();
    const handle = start(uploader);

    handle.cancel();
    expect(uploader.task.cancelled).toBe(true);
  });

  it('rejects invalid files immediately without starting an upload', () => {
    const uploader = new TestUploader();
    const handle = start(uploader, 'video', fakeFile('a.zip', 'application/zip'));

    expect(uploader.startCalls).toHaveLength(0);
    expect(handle.state()).toBe('error');
    expect(handle.error()).toMatch(/video/i);
    expect(() => handle.cancel()).not.toThrow();
  });
});
