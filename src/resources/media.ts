import type { RequestOptions } from '../client';
import type { APIPromise } from '../core/api-promise';
import { APIConnectionError } from '../core/errors';
import { APIResource } from '../core/resource';
import { path } from '../core/utils';
import type { MediaItem, MediaUpload, MediaUploadPart, MediaUploadStartParams } from '../types';

/**
 * Anything that holds a file's bytes. In Node, `await fs.openAsBlob(filePath)` gives you a
 * `Blob` without reading the whole file into memory.
 */
export type Uploadable = Blob | ArrayBuffer | ArrayBufferView;

export interface MediaUploadParams {
  /** Required unless `file` is a `File`, which carries its own name. */
  fileName?: string | undefined;
  /** Defaults to the `Blob`'s own type. */
  mimeType?: string | undefined;
}

export interface MultipartUploadParams extends MediaUploadParams {
  /** How many parts to upload at once. Default 4. */
  concurrency?: number | undefined;
}

export class Media extends APIResource {
  readonly uploads: MediaUploads = new MediaUploads(this._client);

  /** The workspace's media library. */
  list(options?: RequestOptions): APIPromise<MediaItem[]> {
    return this._client.get('/media', undefined, options);
  }

  /**
   * Upload a file in one request: images up to 10 MB, video and PDFs up to 100 MB,
   * subtitles up to 5 MB. For larger video, use `uploadMultipart()`.
   */
  upload(
    file: Uploadable,
    params: MediaUploadParams = {},
    options?: RequestOptions,
  ): APIPromise<MediaItem> {
    const blob = toBlob(file, params.mimeType);
    const fileName = params.fileName ?? (file instanceof File ? file.name : undefined);
    if (!fileName) throw new TypeError('`fileName` is required unless `file` is a File.');

    const form = new FormData();
    form.append('file', blob, fileName);
    return this._client.post('/media', form, options);
  }

  /**
   * Upload a large video through an upload session: start it, PUT every part to its
   * signed URL, then complete it. The session is aborted if any step fails.
   */
  async uploadMultipart(
    file: Uploadable,
    params: MultipartUploadParams = {},
    options?: RequestOptions,
  ): Promise<MediaItem> {
    const blob = toBlob(file, params.mimeType);
    const fileName = params.fileName ?? (file instanceof File ? file.name : undefined);
    const mimeType = params.mimeType ?? blob.type;
    if (!fileName) throw new TypeError('`fileName` is required unless `file` is a File.');
    if (!mimeType) throw new TypeError('`mimeType` is required when the Blob has no type.');

    const session = await this.uploads.start({ fileName, mimeType, size: blob.size }, options);
    const concurrency = Math.max(1, Math.min(params.concurrency ?? 4, 100));

    try {
      const partNumbers = Array.from({ length: session.partCount }, (_, i) => i + 1);
      // Signed URLs expire after an hour, so sign each batch just before uploading it.
      for (let i = 0; i < partNumbers.length; i += concurrency) {
        const batch = partNumbers.slice(i, i + concurrency);
        const parts = await this.uploads.signParts(session.id, { partNumbers: batch }, options);
        await Promise.all(parts.map((part) => this.#putPart(blob, session, part, options?.signal)));
      }
      return await this.uploads.complete(session.id, options);
    } catch (error) {
      await this.uploads.abort(session.id).catch(() => undefined);
      throw error;
    }
  }

  /** Delete a file from the media library. */
  delete(mediaId: string, options?: RequestOptions): APIPromise<void> {
    return this._client.delete(path`/media/${mediaId}`, options);
  }

  async #putPart(
    blob: Blob,
    session: MediaUpload,
    part: MediaUploadPart,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const start = (part.partNumber - 1) * session.partSize;
    const body = blob.slice(start, start + session.partSize);
    // Presigned storage URL: no API key, raw bytes as the body.
    const response = await this._client.fetchExternal(part.url, { method: 'PUT', body, signal });
    if (!response.ok) {
      throw new APIConnectionError(
        `Uploading part ${part.partNumber} failed with status ${response.status}.`,
      );
    }
  }
}

/** Low-level upload-session calls. `media.uploadMultipart()` drives them for you. */
export class MediaUploads extends APIResource {
  start(params: MediaUploadStartParams, options?: RequestOptions): APIPromise<MediaUpload> {
    return this._client.post('/media/uploads', params, options);
  }

  /** Signed PUT URLs for up to 100 parts. Valid for an hour, so ask as you go. */
  signParts(
    uploadId: string,
    params: { partNumbers: number[] },
    options?: RequestOptions,
  ): APIPromise<MediaUploadPart[]> {
    return this._client.post(path`/media/uploads/${uploadId}/parts`, params, options);
  }

  /** Finish the session. Returns the new media item, whose `id` goes in `mediaIds`. */
  complete(uploadId: string, options?: RequestOptions): APIPromise<MediaItem> {
    return this._client.post(path`/media/uploads/${uploadId}/complete`, undefined, options);
  }

  abort(uploadId: string, options?: RequestOptions): APIPromise<void> {
    return this._client.delete(path`/media/uploads/${uploadId}`, options);
  }
}

function toBlob(file: Uploadable, type: string | undefined): Blob {
  if (file instanceof Blob) return type && type !== file.type ? new Blob([file], { type }) : file;
  // Copy into a fresh ArrayBuffer: a view may sit on a SharedArrayBuffer, which Blob rejects.
  const bytes =
    file instanceof ArrayBuffer
      ? new Uint8Array(file)
      : new Uint8Array(file.buffer, file.byteOffset, file.byteLength).slice();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], type ? { type } : {});
}
