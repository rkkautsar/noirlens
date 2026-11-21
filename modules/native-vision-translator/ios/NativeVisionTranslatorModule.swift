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
    }

    AsyncFunction("startCamera") { () async throws -> Void in
      try await CameraController.shared.start()
    }

    AsyncFunction("stopCamera") { () async -> Void in
      await CameraController.shared.stop()
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
