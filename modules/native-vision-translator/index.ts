import { requireNativeModule, requireNativeView, type NativeModule } from 'expo';
import type { ComponentType } from 'react';
import { Platform, View, type ViewProps } from 'react-native';

export type LanguagePackStatus = 'installed' | 'supported' | 'unsupported';

export interface OcrBlockPayload {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrPayload {
  text: string;
  sourceLanguage: string;
  blocks: OcrBlockPayload[];
  confidence: number;
  /** Width/height of the upright frame that the blocks refer to. */
  imageWidth: number;
  imageHeight: number;
  sourceHash: string;
  previewJpegBase64?: string;
}

export interface TranslatePayload {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  cached: boolean;
}

export interface CaptureStillPayload {
  /** Flat filename under the native captures directory. */
  image: string;
  thumb: string;
  width: number;
  height: number;
}

export interface CameraStatus {
  authorized: boolean;
  running: boolean;
  hasDevice: boolean;
  adjustingFocus: boolean;
  adjustingExposure: boolean;
  settled: boolean;
}

export interface LanguagePackStatusPayload {
  language: string;
  targetLanguage: string;
  status: LanguagePackStatus;
}

export interface EcoCameraViewProps extends ViewProps {
  ecoMode?: boolean;
  scanlineLevel?: number;
}

export interface NativeVisionTranslatorModule extends NativeModule {
  startCamera(): Promise<void>;
  stopCamera(): Promise<void>;
  setTorch(enabled: boolean): Promise<void>;
  recognizeLast(language: string): Promise<OcrPayload>;
  getCameraStatus(): Promise<CameraStatus>;
  captureFrame(sourceLanguage: string, crop?: OcrCrop): Promise<OcrPayload>;
  /** Capture a still without OCR; writes the JPEG + thumbnail to disk. */
  captureStill(): Promise<CaptureStillPayload>;
  capturesDirectory(): Promise<string>;
  captureFileUri(name: string): Promise<string>;
  recognizeCapture(image: string, language: string): Promise<OcrPayload>;
  deleteCaptureFiles(names: string[]): Promise<void>;
  translate(params: {
    text: string;
    sourceLanguage: string;
    targetLanguage?: string;
  }): Promise<TranslatePayload>;
  romanize(text: string, language: string): Promise<string>;
  speak(text: string, language: string): Promise<boolean>;
  stopSpeaking(): Promise<void>;
  checkLanguagePackStatus(
    langCode: string,
    targetLanguage?: string,
  ): Promise<LanguagePackStatusPayload>;
  prepareLanguagePack(
    langCode: string,
    targetLanguage?: string,
  ): Promise<LanguagePackStatusPayload>;
  getSupportedLanguages(): Promise<string[]>;
}

const WEB_MOCK_OCR: OcrPayload = {
  text: 'Bánh mì thịt\nBánh mì kẹp thịt heo, pâté và rau củ muối\n45.000đ',
  sourceLanguage: 'vi',
  confidence: 0.95,
  blocks: [
    {
      text: 'Bánh mì thịt',
      confidence: 0.96,
      x: 0.14,
      y: 0.22,
      width: 0.72,
      height: 0.11,
    },
    {
      text: 'Bánh mì kẹp thịt heo, pâté và rau củ muối',
      confidence: 0.92,
      x: 0.08,
      y: 0.42,
      width: 0.84,
      height: 0.1,
    },
    {
      text: '45.000đ',
      confidence: 0.9,
      x: 0.42,
      y: 0.62,
      width: 0.3,
      height: 0.08,
    },
  ],
  imageWidth: 1000,
  imageHeight: 1000,
  sourceHash: 'web-mock',
};

const WEB_MOCK_TRANSLATION =
  'Bánh mì thịt\nBaguette with pork, pâté and pickled vegetables\n45,000 VND';

const WEB_MOCK_CAPTURE =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">' +
      '<rect width="1200" height="900" fill="#141416"/>' +
      '<rect x="80" y="300" width="1040" height="40" rx="4" fill="#F5F2EA"/>' +
      '<rect x="80" y="380" width="760" height="28" rx="4" fill="#9C988E"/>' +
      '<rect x="80" y="450" width="560" height="28" rx="4" fill="#9C988E"/>' +
      '<text x="80" y="720" font-family="monospace" font-size="28" fill="#D9B36C">CAPTURE</text>' +
      '</svg>',
  );

const webMock = {
  startCamera: async () => {},
  stopCamera: async () => {},
  setTorch: async () => {},
  recognizeLast: async () => WEB_MOCK_OCR,
  getCameraStatus: async () => ({
    authorized: true,
    running: true,
    hasDevice: true,
    adjustingFocus: false,
    adjustingExposure: false,
    settled: true,
  }),
  captureFrame: async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 600);
    });
    return WEB_MOCK_OCR;
  },
  captureStill: async () => ({
    image: WEB_MOCK_CAPTURE,
    thumb: WEB_MOCK_CAPTURE,
    width: 1200,
    height: 900,
  }),
  capturesDirectory: async () => '',
  captureFileUri: async (name: string) => name,
  recognizeCapture: async (_image: string, _language: string) => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
    return WEB_MOCK_OCR;
  },
  deleteCaptureFiles: async (_names: string[]) => {},
  romanize: async (text: string, _language: string) => text,
  speak: async (_text: string, _language: string) => false,
  stopSpeaking: async () => {},
  translate: async ({
    sourceLanguage,
  }: {
    text: string;
    sourceLanguage: string;
    targetLanguage?: string;
  }) => ({
    translatedText: WEB_MOCK_TRANSLATION,
    sourceLanguage,
    targetLanguage: 'en',
    cached: false,
  }),
  checkLanguagePackStatus: async (language: string) => ({
    language,
    targetLanguage: 'en',
    status: 'installed' as const,
  }),
  prepareLanguagePack: async (language: string) => ({
    language,
    targetLanguage: 'en',
    status: 'installed' as const,
  }),
  getSupportedLanguages: async () => [],
} as unknown as NativeVisionTranslatorModule;

const NativeVisionTranslator =
  Platform.OS === 'web'
    ? webMock
    : requireNativeModule<NativeVisionTranslatorModule>(
        'NativeVisionTranslator',
      );

export default NativeVisionTranslator;

export const EcoCameraView: ComponentType<EcoCameraViewProps> =
  Platform.OS === 'web'
    ? (View as unknown as ComponentType<EcoCameraViewProps>)
    : requireNativeView('NativeVisionTranslator');
