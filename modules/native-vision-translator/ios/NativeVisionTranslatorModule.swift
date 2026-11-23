import ExpoModulesCore

struct TranslateParams: Record {
  @Field var text: String = ""
  @Field var sourceLanguage: String = ""
}

struct CropRect: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var width: Double = 0
  @Field var height: Double = 0
}

public final class NativeVisionTranslatorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeVisionTranslator")

    View(EcoCameraView.self) {
      Prop("ecoMode") { (view: EcoCameraView, ecoMode: Bool) in
        view.ecoMode = ecoMode
      }
      Prop("scanlineLevel") { (view: EcoCameraView, level: Double) in
        view.scanlineLevel = CGFloat(level)
      }
    }

    AsyncFunction("startCamera") { () async throws -> Void in
      try await CameraController.shared.start()
    }

    AsyncFunction("stopCamera") { () async -> Void in
      await CameraController.shared.stop()
    }

    AsyncFunction("setTorch") { (enabled: Bool) in
      CameraController.shared.setTorch(enabled)
    }

    AsyncFunction("recognizeLast") { (language: String) throws -> [String: Any] in
      try CameraController.shared.recognizeLast(language: language)
    }

    AsyncFunction("getCameraStatus") { () async -> [String: Any] in
      await CameraController.shared.status()
    }

    AsyncFunction("captureFrame") { (sourceLanguage: String, crop: CropRect?) async throws -> [String: Any] in
      let frame = try await CameraController.shared.captureFrame(crop: crop)
      guard let pixelBuffer = frame.pixelBuffer else {
        throw cameraException(
          name: "NoFrame",
          description: "The captured frame had no image buffer.",
          code: "ERR_NO_FRAME"
        )
      }
      return try TextRecognizer.recognize(
        pixelBuffer: pixelBuffer,
        previewJpegBase64: frame.previewJpegBase64,
        languageHint: sourceLanguage,
        cropRect: frame.cropRect
      )
    }

    // ICU transliteration bundled with iOS: kana/Cyrillic/Arabic/Thai to
    // Latin, Han to Mandarin pinyin. No model download. Already-Latin text is
    // returned untouched so Vietnamese accents are not stripped, and Japanese
    // only romanizes kana (kanji readings need a dictionary, not pinyin).
    AsyncFunction("romanize") { (text: String, language: String) async -> String in
      let hasNonLatin = text.unicodeScalars.contains { $0.value >= 0x0370 }
      if !hasNonLatin {
        return text
      }
      let lang = language.lowercased()
      if lang.hasPrefix("ja") {
        var s = text
        for name in ["Hiragana-Latin", "Katakana-Latin"] {
          s = s.applyingTransform(StringTransform(name), reverse: false) ?? s
        }
        return s.applyingTransform(.stripDiacritics, reverse: false) ?? s
      }
      let latin = text.applyingTransform(.toLatin, reverse: false) ?? text
      return latin.applyingTransform(.stripDiacritics, reverse: false) ?? latin
    }

    AsyncFunction("translate") { (params: TranslateParams) async throws -> [String: Any] in
      try await TranslationBridge.translate(
        text: params.text,
        sourceLanguage: params.sourceLanguage
      )
    }

    AsyncFunction("checkLanguagePackStatus") { (langCode: String) async -> [String: Any] in
      await TranslationBridge.status(for: langCode)
    }

    AsyncFunction("prepareLanguagePack") { (langCode: String) async throws -> [String: Any] in
      try await TranslationBridge.prepare(languageCode: langCode)
    }

    AsyncFunction("getSupportedLanguages") { () async -> [String] in
      await TranslationBridge.supportedLanguages()
    }
  }
}
