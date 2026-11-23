import vision from '../../modules/native-vision-translator';
import { CaptureQueue } from './captureQueue';
import { captures } from './captures';

const processor = new CaptureQueue(
  {
    recognize: (job) => vision.recognizeCapture(job.image, job.hint),
    start: (job) =>
      captures.patchForRevision(job.id, job.revision, {
        status: 'processing',
        error: null,
      }),
    finish: (job, ocr) =>
      captures.patchForRevision(job.id, job.revision, {
        status: 'done',
        text: ocr.text,
        language: ocr.sourceLanguage,
        blocks: ocr.blocks,
        confidence: ocr.confidence,
        error: null,
      }),
    fail: (job, message) =>
      captures.failForRevision(job.id, job.revision, message),
    isDeleted: (id) => captures.get(id) === undefined,
  },
  2,
);

export function enqueueCapture(id: string): void {
  const record = captures.get(id);
  if (!record) {
    return;
  }
  processor.enqueue({
    id: record.id,
    hint: record.hint,
    image: record.image,
    revision: record.ocrRevision,
  });
}

/** Called after hydrate: unfinished captures resume without the camera. */
export function resumeCaptureProcessing(): void {
  for (const record of captures.pending()) {
    processor.enqueue({
      id: record.id,
      hint: record.hint,
      image: record.image,
      revision: record.ocrRevision,
    });
  }
}

/** Re-runs OCR for a stored capture with a different source hint ('' = auto). */
export function rerunCaptureOcr(id: string, hint: string): Promise<void> {
  return captures.beginOcrRerun(id, hint).then((revision) => {
    if (revision !== null) {
      enqueueCapture(id);
    }
  });
}

export function retryCapture(id: string): void {
  const record = captures.get(id);
  if (!record) {
    return;
  }
  void captures
    .patch(id, { status: 'pending', error: null, attempts: 0 })
    .then(() => enqueueCapture(id));
}
