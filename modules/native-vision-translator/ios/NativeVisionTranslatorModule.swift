import ExpoModulesCore
import Foundation
import NaturalLanguage

struct TranslateParams: Record {
  @Field var text: String = ""
  @Field var sourceLanguage: String = ""
  @Field var targetLanguage: String = "en"
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

    AsyncFunction("startCamera") { () async throws -> Int in
      try await CameraController.shared.start()
    }

    AsyncFunction("stopCamera") { () async -> Void in
      await CameraController.shared.stop()
    }

    AsyncFunction("stopCameraIfCurrent") { (generation: Int) async -> Void in
      await CameraController.shared.stopIfCurrent(generation: generation)
    }

    AsyncFunction("setTorch") { (enabled: Bool) in
      CameraController.shared.setTorch(enabled)
    }

    AsyncFunction("recognizeLast") { (language: String) throws -> [String: Any] in
      try CameraController.shared.recognizeLast(language: language)
    }

    AsyncFunction("personalNameRanges") { (text: String) -> [[String: Int]] in
      guard !text.isEmpty else {
        return []
      }
      let tagger = NLTagger(tagSchemes: [.nameType])
      tagger.string = text
      var ranges: [[String: Int]] = []
      let full = text.startIndex..<text.endIndex
      tagger.enumerateTags(
        in: full,
        unit: .word,
        scheme: .nameType,
        options: [.omitPunctuation, .omitWhitespace, .joinNames]
      ) { tag, tokenRange in
        guard tag == .personalName else {
          return true
        }
        let range = NSRange(tokenRange, in: text)
        ranges.append([
          "start": range.location,
          "end": range.location + range.length,
        ])
        return true
      }
      return ranges
    }

    AsyncFunction("getCameraStatus") { () async -> [String: Any] in
      await CameraController.shared.status()
    }

    AsyncFunction("captureFrame") {
      (sourceLanguage: String, crop: CropRect?, cameraToken: Int?) async throws
        -> [String: Any] in
      let frame = try await CameraController.shared.captureFrame(
        crop: crop,
        generation: cameraToken
      )
      guard let pixelBuffer = frame.pixelBuffer else {
        throw cameraException(
          name: "NoFrame",
          description: "The captured frame had no image buffer.",
          code: "ERR_NO_FRAME"
        )
      }
      return try TextRecognizer.recognize(
        pixelBuffer: pixelBuffer,
        previewJpegBase64: nil,
        previewUri: frame.previewUri,
        languageHint: sourceLanguage,
        cropRect: frame.cropRect
      )
    }

    // ICU transliteration bundled with iOS: kana/Cyrillic/Arabic/Thai to
    // Latin, Han to Mandarin pinyin. No model download. Already-Latin text is
    // returned untouched so Vietnamese accents are not stripped, and Japanese
    // only romanizes kana (kanji readings need a dictionary, not pinyin).
    AsyncFunction("captureStill") {
      (cameraToken: Int?) async throws -> [String: Any] in
      let frame = try await CameraController.shared.captureFrame(
        includePreview: false,
        generation: cameraToken
      )
      guard let jpeg = frame.jpegData else {
        throw cameraException(
          name: "NoFrame",
          description: "The captured frame had no image data.",
          code: "ERR_NO_FRAME"
        )
      }
      let saved = try CaptureFiles.save(jpegData: jpeg)
      return [
        "image": saved.image,
        "thumb": saved.thumb,
        "width": saved.width,
        "height": saved.height,
      ]
    }

    AsyncFunction("capturesDirectory") { () -> String in
      CaptureFiles.directoryUri()
    }

    AsyncFunction("captureFileUri") { (name: String) -> String in
      CaptureFiles.uri(for: name)
    }

    AsyncFunction("listCaptureFiles") { (minAgeSeconds: Double) -> [String] in
      CaptureFiles.list(olderThan: minAgeSeconds)
    }

    AsyncFunction("recognizeCapture") {
      (image: String, language: String) async throws -> [String: Any] in
      guard
        let url = CaptureFiles.url(for: image),
        let data = try? Data(contentsOf: url)
      else {
        throw cameraException(
          name: "CaptureMissing",
          description: "The saved capture is no longer on disk.",
          code: "ERR_CAPTURE_MISSING"
        )
      }
      return try TextRecognizer.recognize(jpegData: data, languageHint: language)
    }

    AsyncFunction("deleteCaptureFiles") { (names: [String]) throws in
      try CaptureFiles.delete(names: names)
    }

    AsyncFunction("romanize") { (text: String, language: String) async -> String in
      // Only the scripts the OCR supports get a reading; Latin text (including
      // Vietnamese diacritics above U+0370) passes through untouched.
      func isSupported(_ value: UInt32) -> Bool {
        return (0xAC00...0xD7AF).contains(value) || (0x4E00...0x9FFF).contains(value)
          || (0x3400...0x4DBF).contains(value) || (0x3040...0x30FF).contains(value)
          || (0x0400...0x04FF).contains(value) || (0x0600...0x06FF).contains(value)
          || (0x0E00...0x0E7F).contains(value)
      }
      guard text.unicodeScalars.contains(where: { isSupported($0.value) }) else {
        return text
      }
      let hasHan = text.unicodeScalars.contains {
        (0x4E00...0x9FFF).contains($0.value) || (0x3400...0x4DBF).contains($0.value)
      }
      let lang = language.lowercased()
      if lang.hasPrefix("ja") {
        var s = text
        for name in ["Hiragana-Latin", "Katakana-Latin"] {
          s = s.applyingTransform(StringTransform(name), reverse: false) ?? s
        }
        return s
      }
      let latin = text.applyingTransform(.toLatin, reverse: false) ?? text
      // Pinyin tone marks are only stripped when Han was transliterated; a
      // Latin run's accents are preserved.
      return hasHan
        ? (latin.applyingTransform(.stripDiacritics, reverse: false) ?? latin)
        : latin
    }

    AsyncFunction("translate") { (params: TranslateParams) async throws -> [String: Any] in
      try await TranslationBridge.translate(
        text: params.text,
        sourceLanguage: params.sourceLanguage,
        targetLanguage: params.targetLanguage
      )
    }

    AsyncFunction("checkLanguagePackStatus") {
      (langCode: String, targetLanguage: String?) async -> [String: Any] in
      await TranslationBridge.status(
        for: langCode,
        targetLanguage: targetLanguage ?? "en"
      )
    }

    AsyncFunction("checkLanguagePackStatuses") {
      (languages: [String], targetLanguage: String?) async -> [[String: Any]] in
      await TranslationBridge.statuses(
        for: languages,
        targetLanguage: targetLanguage ?? "en"
      )
    }

    AsyncFunction("prepareLanguagePack") {
      (langCode: String, targetLanguage: String?) async throws -> [String: Any] in
      try await TranslationBridge.prepare(
        languageCode: langCode,
        targetLanguage: targetLanguage ?? "en"
      )
    }

    AsyncFunction("speak") { (text: String, language: String) async -> Bool in
      await SpeechBridge.shared.speak(text: text, language: language)
    }

    AsyncFunction("stopSpeaking") { () async -> Void in
      await SpeechBridge.shared.stop()
    }

    AsyncFunction("getSupportedLanguages") { () async -> [String] in
      await TranslationBridge.supportedLanguages()
    }
  }
}
