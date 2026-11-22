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
  translate(params: {
    text: string;
    sourceLanguage: string;
  }): Promise<TranslatePayload>;
  checkLanguagePackStatus(langCode: string): Promise<LanguagePackStatusPayload>;
  prepareLanguagePack(langCode: string): Promise<LanguagePackStatusPayload>;
  getSupportedLanguages(): Promise<string[]>;
}

const webMock = {
  startCamera: async () => {},
  stopCamera: async () => {},
  setTorch: async () => {},
  recognizeLast: async () => {
    throw new Error('Camera is not available in the web preview.');
  },
  getCameraStatus: async () => ({
    authorized: false,
    running: false,
    hasDevice: false,
    adjustingFocus: false,
    adjustingExposure: false,
    settled: false,
  }),
  captureFrame: async () => {
    throw new Error('Camera is not available in the web preview.');
  },
  translate: async ({
    sourceLanguage,
  }: {
    text: string;
    sourceLanguage: string;
  }) => ({
    translatedText: '',
    sourceLanguage,
    targetLanguage: 'en',
    cached: false,
  }),
  checkLanguagePackStatus: async (language: string) => ({
    language,
    targetLanguage: 'en',
    status: 'unsupported' as const,
  }),
  prepareLanguagePack: async () => {
    throw new Error('Language packs are unavailable in the web preview.');
  },
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
