import ExpoModulesCore
import SwiftUI
import Translation
import UIKit

/**
 Bridges Apple's on-device Translation framework (iOS 18+).

 Translation itself runs through a programmatic `TranslationSession` that
 requires the language pair to be installed. Downloads can only be requested
 from a session created by SwiftUI's `.translationTask`, so
 `prepareLanguagePack` presents a 1x1 transparent host that asks the system to
 fetch the pack. No network calls are made by this app.
 */
enum TranslationBridge {
  private static let target = Locale.Language(identifier: "en")

  static func status(for languageCode: String) async -> [String: Any] {
    let source = language(from: languageCode)
    let availability = LanguageAvailability()
    let status = await availability.status(from: source, to: target)
    return [
      "language": languageCode,
      "targetLanguage": "en",
      "status": statusString(status)
    ]
  }

  static func supportedLanguages() -> [String] {
    LanguageAvailability().supportedLanguages.map(\.minimalIdentifier)
  }

  static func translate(
    text: String,
    sourceLanguage: String
  ) async throws -> [String: Any] {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return identity(trimmed, language: sourceLanguage)
    }

    let code = normalizedCode(sourceLanguage)
    if code.hasPrefix("en") || code == "und" {
      return identity(trimmed, language: code)
    }

    let source = Locale.Language(identifier: code)
    let availability = LanguageAvailability()
    let status = await availability.status(from: source, to: target)

    switch status {
    case .installed:
      break
    case .supported:
      throw Exception(
        name: "LanguagePackNotInstalled",
        description: "The \(code) to English offline pack is not installed.",
        code: "ERR_LANGUAGE_PACK_MISSING"
      )
    case .unsupported:
      throw Exception(
        name: "LanguagePairUnsupported",
        description: "on-device translation from \(code) to English is not supported.",
        code: "ERR_LANGUAGE_UNSUPPORTED"
      )
    @unknown default:
      throw Exception(
        name: "LanguagePairUnsupported",
        description: "The language pair could not be evaluated.",
        code: "ERR_LANGUAGE_UNSUPPORTED"
      )
    }

    do {
      let session = try TranslationSession(installedSource: source, target: target)
      let response = try await session.translate(trimmed)
      return [
        "translatedText": response.targetText,
        "sourceLanguage": code,
        "targetLanguage": "en",
        "cached": false
      ]
    } catch {
      throw Exception(
        name: "TranslationFailed",
        description: error.localizedDescription,
        code: "ERR_TRANSLATION_FAILED"
      )
    }
  }

  static func prepare(languageCode: String) async throws -> [String: Any] {
    let code = normalizedCode(languageCode)
    let source = Locale.Language(identifier: code)

    let availability = LanguageAvailability()
    let before = await availability.status(from: source, to: target)

    switch before {
    case .installed:
      return [
        "language": code,
        "targetLanguage": "en",
        "status": "installed"
      ]
    case .unsupported:
      throw Exception(
        name: "LanguagePairUnsupported",
        description: "on-device translation from \(code) to English is not supported.",
        code: "ERR_LANGUAGE_UNSUPPORTED"
      )
    case .supported:
      break
    @unknown default:
      throw Exception(
        name: "LanguagePairUnsupported",
        description: "The language pair could not be evaluated.",
        code: "ERR_LANGUAGE_UNSUPPORTED"
      )
    }

    try await presentDownloadPrompt(source: source)

    let after = await availability.status(from: source, to: target)
    return [
      "language": code,
      "targetLanguage": "en",
      "status": statusString(after)
    ]
  }

  // MARK: - Helpers

  private static func identity(
    _ text: String,
    language: String
  ) -> [String: Any] {
    [
      "translatedText": text,
      "sourceLanguage": language,
      "targetLanguage": "en",
      "cached": false
    ]
  }

  private static func normalizedCode(_ code: String) -> String {
    let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? "und" : trimmed
  }

  private static func language(from code: String) -> Locale.Language {
    let normalized = normalizedCode(code)
    return Locale.Language(identifier: normalized == "und" ? "en" : normalized)
  }

  private static func statusString(_ status: LanguageAvailability.Status) -> String {
    switch status {
    case .installed:
      return "installed"
    case .supported:
      return "supported"
    case .unsupported:
      return "unsupported"
    @unknown default:
      return "unsupported"
    }
  }

  @MainActor
  private static func presentDownloadPrompt(source: Locale.Language) async throws {
    guard let root = topViewController() else {
      throw Exception(
        name: "NoPresentationContext",
        description: "The language pack prompt could not be presented.",
        code: "ERR_NO_PRESENTATION_CONTEXT"
      )
    }

    let coordinator = PackDownloadCoordinator()
    try await coordinator.start(source: source, target: target, from: root)
  }

  @MainActor
  private static func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }

    var controller = scene?.windows.first(where: \.isKeyWindow)?.rootViewController
      ?? scene?.windows.first?.rootViewController

    while let presented = controller?.presentedViewController {
      controller = presented
    }
    return controller
  }
}

@MainActor
private final class PackDownloadCoordinator {
  private var host: UIHostingController<PackDownloadView>?
  private var continuation: CheckedContinuation<Void, Error>?
  private var selfReference: PackDownloadCoordinator?

  func start(
    source: Locale.Language,
    target: Locale.Language,
    from root: UIViewController
  ) async throws {
    try await withCheckedThrowingContinuation {
      (continuation: CheckedContinuation<Void, Error>) in
      self.selfReference = self
      self.continuation = continuation

      let view = PackDownloadView(source: source, target: target) {
        @MainActor [weak self] result in
        self?.finish(result)
      }
      let host = UIHostingController(rootView: view)
      host.modalPresentationStyle = .overFullScreen
      host.view.backgroundColor = .clear
      self.host = host
      root.present(host, animated: false)
    }
  }

  private func finish(_ result: Result<Void, Error>) {
    host?.dismiss(animated: false)
    host = nil
    selfReference = nil

    let continuation = self.continuation
    self.continuation = nil
    continuation?.resume(with: result)
  }
}

private struct PackDownloadView: View {
  let source: Locale.Language
  let target: Locale.Language
  let completion: @MainActor (Result<Void, Error>) -> Void

  @State private var configuration: TranslationSession.Configuration?

  var body: some View {
    Color.clear
      .frame(width: 1, height: 1)
      .translationTask(configuration) { session in
        do {
          try await session.prepareTranslation()
          await MainActor.run {
            completion(.success(Void()))
          }
        } catch {
          await MainActor.run {
            completion(.failure(error))
          }
        }
      }
      .onAppear {
        configuration = TranslationSession.Configuration(source: source, target: target)
      }
  }
}
