import vision from '../../modules/native-vision-translator';
import { CaptureQueue } from './captureQueue';
import { captures } from './captures';

const processor = new CaptureQueue(
  {
    recognize: (job) => vision.recognizeCapture(job.image, job.hint),
    start: (id) => captures.patch(id, { status: 'processing', error: null }),
    finish: (id, ocr) =>
      captures.patch(id, {
        status: 'done',
        text: ocr.text,
        language: ocr.sourceLanguage,
        blocks: ocr.blocks,
        confidence: ocr.confidence,
        error: null,
      }),
    fail: (id, message) => captures.fail(id, message),
    isDeleted: (id) => captures.get(id) === undefined,
  },
  2,
);

export function enqueueCapture(id: string): void {
  const record = captures.get(id);
  if (!record) {
    return;
  }
  processor.enqueue({ id: record.id, hint: record.hint, image: record.image });
}

/** Called after hydrate: unfinished captures resume without the camera. */
export function resumeCaptureProcessing(): void {
  for (const record of captures.pending()) {
    processor.enqueue({
      id: record.id,
      hint: record.hint,
      image: record.image,
    });
  }
}

/** Re-runs OCR for a stored capture with a different source hint ('' = auto). */
export function rerunCaptureOcr(id: string, hint: string): void {
  void captures
    .patch(id, {
      hint,
      status: 'pending',
      text: '',
      language: '',
      blocks: [],
      confidence: 0,
      error: null,
      attempts: 0,
    })
    .then(() => enqueueCapture(id));
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
