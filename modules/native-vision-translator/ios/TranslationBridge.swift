import ExpoModulesCore
import SwiftUI
import Translation
import UIKit

/**
 Bridges Apple's on-device Translation framework (iOS 18+).

 A `TranslationSession` is only available inside a SwiftUI `translationTask`
 view in this deployment range, so both pack downloads and translations are
 performed by a 1x1 transparent host. The host is presented for the duration
 of the work and dismissed before the awaiting promise resolves. No network
 calls are made by this app.
 */
@MainActor
enum TranslationBridge {
  private static let defaultTarget = Locale.Language(identifier: "en")

  static func status(
    for languageCode: String,
    targetLanguage: String = "en"
  ) async -> [String: Any] {
    let source = language(from: languageCode)
    let target = language(from: targetLanguage)
    let availability = LanguageAvailability()
    let status = await availability.status(from: source, to: target)
    return [
      "language": languageCode,
      "targetLanguage": normalizedCode(targetLanguage),
      "status": statusString(status)
    ]
  }

  static func supportedLanguages() async -> [String] {
    let availability = LanguageAvailability()
    let languages = await availability.supportedLanguages
    return languages.map(\.minimalIdentifier)
  }

  static func translate(
    text: String,
    sourceLanguage: String,
    targetLanguage: String = "en"
  ) async throws -> [String: Any] {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return identity(trimmed, language: sourceLanguage, target: targetLanguage)
    }

    let code = normalizedCode(sourceLanguage)
    let targetCode = normalizedCode(targetLanguage)
    let source = language(from: code)
    let target = language(from: targetCode)
    if code.hasPrefix("en") && targetCode.hasPrefix("en") || code == "und" {
      return identity(trimmed, language: code, target: targetCode)
    }

    let availability = LanguageAvailability()
    let status = await availability.status(from: source, to: target)

    // `.supported` can lag behind an installed pack (and is the common state
    // right after a download), so let the session try and report a concrete
    // error instead of refusing before asking the framework.
    switch status {
    case .installed, .supported:
      break
    case .unsupported:
      throw Exception(
        name: "LanguagePairUnsupported",
        description: "on-device translation from \(code) to \(targetCode) is not supported.",
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
      guard
        let translated = try await presentHost(
          text: trimmed,
          source: source,
          target: target
        )
      else {
        throw Exception(
          name: "TranslationFailed",
          description: "The translation returned no text.",
          code: "ERR_TRANSLATION_FAILED"
        )
      }
      return [
        "translatedText": translated,
        "sourceLanguage": code,
        "targetLanguage": targetCode,
        "cached": false
      ]
    } catch let error as Exception {
      throw error
    } catch let error as TranslationError {
      if TranslationError.notInstalled ~= error {
        throw Exception(
          name: "LanguagePackNotInstalled",
          description: "The \(code) to \(targetCode) offline pack is not installed.",
          code: "ERR_LANGUAGE_PACK_MISSING"
        )
      }
      if TranslationError.unsupportedLanguagePairing ~= error ||
        TranslationError.unsupportedSourceLanguage ~= error ||
        TranslationError.unsupportedTargetLanguage ~= error
      {
        throw Exception(
          name: "LanguagePairUnsupported",
          description: "on-device translation from \(code) to \(targetCode) is not supported.",
          code: "ERR_LANGUAGE_UNSUPPORTED"
        )
      }
      throw Exception(
        name: "TranslationFailed",
        description: error.errorDescription ?? "The translation failed.",
        code: "ERR_TRANSLATION_FAILED"
      )
    } catch {
      throw Exception(
        name: "TranslationFailed",
        description: error.localizedDescription,
        code: "ERR_TRANSLATION_FAILED"
      )
    }
  }

  static func prepare(
    languageCode: String,
    targetLanguage: String = "en"
  ) async throws -> [String: Any] {
    let code = normalizedCode(languageCode)
    let targetCode = normalizedCode(targetLanguage)
    let source = language(from: code)
    let target = language(from: targetCode)

    let availability = LanguageAvailability()
    let before = await availability.status(from: source, to: target)

    switch before {
    case .installed:
      return [
        "language": code,
        "targetLanguage": targetCode,
        "status": "installed"
      ]
    case .unsupported:
      throw Exception(
        name: "LanguagePairUnsupported",
        description: "on-device translation from \(code) to \(targetCode) is not supported.",
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

    _ = try await presentHost(text: nil, source: source, target: target)

    // A completed prepareTranslation downloaded or confirmed the pack; the
    // availability query can still report .supported for a moment, so trust
    // the completed preparation rather than stranding the user.
    return [
      "language": code,
      "targetLanguage": targetCode,
      "status": "installed"
    ]
  }

  // MARK: - Helpers

  private static func identity(
    _ text: String,
    language: String,
    target: String
  ) -> [String: Any] {
    [
      "translatedText": text,
      "sourceLanguage": language,
      "targetLanguage": normalizedCode(target),
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

  /// `text == nil` requests the pack download prompt instead of a translation.
  @MainActor
  private static func presentHost(
    text: String?,
    source: Locale.Language,
    target: Locale.Language
  ) async throws -> String? {
    var root = topViewController()
    // A sheet being dismissed (e.g. History -> result) still hosts the top
    // controller for a few frames. Presenting into that transition makes
    // UIKit drop the presentation, so wait for a controller that is fully
    // attached, not presenting, and not moving through a transition.
    var waited = 0
    while !isReadyForPresentation(root), waited < 20 {
      try? await Task.sleep(nanoseconds: 100_000_000)
      root = topViewController()
      waited += 1
    }
    guard let presenter = root, isReadyForPresentation(presenter) else {
      throw Exception(
        name: "PresentationBusy",
        description: "A sheet is still closing; the translation host could not be presented.",
        code: "ERR_PRESENTATION_BUSY"
      )
    }

    let coordinator = TranslationHostCoordinator()
    return try await coordinator.run(
      text: text,
      source: source,
      target: target,
      from: presenter
    )
  }

  @MainActor
  private static func isReadyForPresentation(_ controller: UIViewController?) -> Bool {
    guard let controller,
          controller.presentedViewController == nil,
          controller.transitionCoordinator == nil,
          !controller.isBeingDismissed,
          controller.view.window != nil
    else {
      return false
    }
    return true
  }

  @MainActor
  private static func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }

    var controller = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
      ?? scene?.windows.first?.rootViewController

    while let presented = controller?.presentedViewController {
      controller = presented
    }
    return controller
  }
}

@MainActor
private final class TranslationHostCoordinator {
  private var host: UIHostingController<TranslationHostView>?
  private var continuation: CheckedContinuation<String?, Error>?
  private var selfReference: TranslationHostCoordinator?
  private var attachmentCheck: Task<Void, Never>?

  func run(
    text: String?,
    source: Locale.Language,
    target: Locale.Language,
    from root: UIViewController
  ) async throws -> String? {
    try await withCheckedThrowingContinuation {
      (continuation: CheckedContinuation<String?, Error>) in
      self.selfReference = self
      self.continuation = continuation

      let view = TranslationHostView(
        source: source,
        target: target,
        text: text
      ) { @MainActor [weak self] result in
        self?.finish(result)
      }
      let host = UIHostingController(rootView: view)
      host.modalPresentationStyle = .overFullScreen
      host.view.backgroundColor = .clear
      self.host = host
      root.present(host, animated: false)
      // UIKit does not guarantee the present completion when it rejects an
      // overlapping presentation, so verify attachment independently and
      // fail the continuation rather than leaving it unresolved.
      self.attachmentCheck = Task { @MainActor [weak self] in
        try? await Task.sleep(nanoseconds: 800_000_000)
        guard let self, self.host === host else { return }
        if host.presentingViewController == nil && host.view.window == nil {
          self.finish(
            .failure(
              Exception(
                name: "PresentationFailed",
                description: "UIKit rejected the translation host presentation.",
                code: "ERR_PRESENTATION_FAILED"
              )
            )
          )
        }
      }
    }
  }

  private func finish(_ result: Result<String?, Error>) {
    attachmentCheck?.cancel()
    attachmentCheck = nil
    host?.dismiss(animated: false)
    host = nil
    selfReference = nil

    let continuation = self.continuation
    self.continuation = nil
    continuation?.resume(with: result)
  }
}

private struct TranslationHostView: View {
  let source: Locale.Language
  let target: Locale.Language
  /// nil requests the pack download prompt without translating.
  let text: String?
  let completion: @MainActor (Result<String?, Error>) -> Void

  @State private var configuration: TranslationSession.Configuration?

  var body: some View {
    Color.clear
      .frame(width: 1, height: 1)
      .translationTask(configuration) { session in
        do {
          if let text {
            let response = try await session.translate(text)
            await MainActor.run {
              completion(.success(response.targetText))
            }
          } else {
            try await session.prepareTranslation()
            await MainActor.run {
              completion(.success(nil))
            }
          }
        } catch {
          await MainActor.run {
            completion(.failure(error))
          }
        }
      }
      .onAppear {
        configuration = TranslationSession.Configuration(
          source: source,
          target: target
        )
      }
  }
}
