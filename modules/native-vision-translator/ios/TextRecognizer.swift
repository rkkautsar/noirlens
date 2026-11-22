import CoreImage
import CryptoKit
import ExpoModulesCore
import Foundation
import NaturalLanguage
import Vision

/**
 On-device OCR with paragraph grouping.

 Input buffers are landscape (the sensor's native orientation), so Vision is
 told `.right`: it rotates the image upright before recognizing and returns
 bounding boxes in that upright coordinate space. The matching preview/JPEG is
 rotated with `CIImage.oriented(.right)`, so normalized boxes overlay exactly.
 */
enum TextRecognizer {
  private struct Line {
    let text: String
    let confidence: Float
    let box: CGRect
  }

  private struct Block {
    let text: String
    let confidence: Float
    let box: CGRect
  }

  private static let preferredLanguageCodes = [
    "th-TH", "ko-KR", "ja-JP", "zh-Hans", "zh-Hant",
    "de-DE", "fr-FR", "es-ES", "vi-VN", "id-ID",
    "en-US",
  ]
  private static let ciContext = CIContext(options: [.useSoftwareRenderer: false])
  private static let punctuationNoise = CharacterSet(
    charactersIn: "0123456789.,:;+-*/%$€£¥₩₹()[]{}#*·•°'\"`~^_=<>|\\"
  )

  static func recognize(
    pixelBuffer: CVPixelBuffer,
    previewJpegBase64: String?,
    languageHint: String,
    cropRect: CGRect? = nil
  ) throws -> [String: Any] {
    // The upright frame is the landscape buffer rotated 90 degrees. Crop it
    // to the reticle so off-preview UI (URL bars, browser chrome) never
    // reaches OCR.
    let upright = CIImage(cvPixelBuffer: pixelBuffer).oriented(.right)
    let cropped = cropRect.map { upright.cropped(to: $0) } ?? upright
    guard let image = ciContext.createCGImage(cropped, from: cropped.extent) else {
      throw Exception(
        name: "TextRecognitionFailed",
        description: "The captured frame could not be prepared for OCR.",
        code: "ERR_OCR_FAILED"
      )
    }
    let width = image.width
    let height = image.height

    // Prefer an explicit list covering every language pack the app can
    // translate. Vision's auto-detection can latch onto a short English
    // watermark on an otherwise German/Japanese sign and then apply English
    // correction to the wrong glyphs. Fall back to auto-detection only when
    // the explicit pass finds nothing.
    let hint = languageHint.trimmingCharacters(in: .whitespacesAndNewlines)
    let forced = !hint.isEmpty
    let preferred = supportedPreferredLanguages()
    let english = preferred.first { $0.lowercased().hasPrefix("en") }
    // Vision runs ONE recognition model per request, chosen by the first
    // language. A single list therefore silently drops every script whose
    // model is not first (Korean under the Thai/CJK/Latin model, etc.).
    // AUTO must try each script group with its own model first.
    let autoGroups = scriptGroups(preferred: preferred, english: english)
    let forcedLanguagesList = forced
      ? forcedLanguages(hint: hint, preferred: preferred)
      : []
    // Small foreign print is often below the conservative auto floor. When
    // the user has explicitly chosen the source language, keep it.
    let confidenceFloor: Float = forced ? 0.35 : 0.40

    var lines: [Line] = []
    if forced, !forcedLanguagesList.isEmpty {
      do {
        lines = try runPass(
          image,
          automatic: false,
          languages: forcedLanguagesList,
          confidenceFloor: confidenceFloor
        ).filter { !isUrlNoise($0.text) }
      } catch {
        NSLog("[NoirLens] OCR forced pass failed: %@", error.localizedDescription)
      }
      // A forced hint that reads nothing in its own script (e.g. German
      // selected at a Korean bottle) must not hide the sign.
      if scriptScore(lines, for: forcedLanguagesList.first ?? "") < 4 {
        lines = try autoWithSticky(
          image,
          groups: autoGroups,
          confidenceFloor: confidenceFloor
        )
      }
    } else {
      lines = try autoWithSticky(
        image,
        groups: autoGroups,
        confidenceFloor: confidenceFloor
      )
    }

    if lines.isEmpty {
      // The reticle crop can miss small, low-contrast print. Retry the same
      // crop with a grayscale/contrast upscale before auto mode.
      let retryLanguages = forced && !forcedLanguagesList.isEmpty
        ? forcedLanguagesList
        : (autoGroups.first ?? [])
      do {
        if !retryLanguages.isEmpty,
           let enhanced = enhancedImage(cropped),
           let enhancedCG = ciContext.createCGImage(enhanced, from: enhanced.extent) {
          lines = try runPass(
            enhancedCG,
            automatic: false,
            languages: retryLanguages,
            confidenceFloor: confidenceFloor
          ).filter { !isUrlNoise($0.text) }
        }
      } catch {
        NSLog("[NoirLens] OCR enhanced pass failed: %@", error.localizedDescription)
      }
    }

    if lines.isEmpty {
      do {
        lines = try runPass(
          image,
          automatic: true,
          languages: [],
          confidenceFloor: 0.50
        ).filter { !isUrlNoise($0.text) }
      } catch {
        throw Exception(
          name: "TextRecognitionFailed",
          description: "On-device text recognition failed.",
          code: "ERR_OCR_FAILED"
        )
      }
    }

    // Google Maps screenshots and screen captures carry URL/query metadata
    // that Vision happily OCRs. It is page chrome, not sign text.
    lines = lines.filter { !isUrlNoise($0.text) }

    let rawText = lines.map(\.text).joined(separator: "\n")
    let language = hint.isEmpty ? dominantLanguage(in: rawText) : hint

    guard !lines.isEmpty else {
      return payload(
        text: "",
        language: "und",
        blocks: [],
        width: width,
        height: height,
        previewJpegBase64: previewJpegBase64
      )
    }

    let vertical = isVerticalLayout(lines, language: language)
    let grouped = vertical
      ? groupColumns(lines)
      : groupParagraphs(lines, language: language)

    let blocks = grouped.map { group -> Block in
      let confidence =
        group.reduce(Float(0)) { $0 + $1.confidence } / Float(group.count)
      return Block(
        text: joinedText(group, language: language, vertical: vertical),
        confidence: confidence,
        box: union(group.map(\.box))
      )
    }

    let text = blocks.map(\.text).joined(separator: "\n")
    NSLog(
      "[NoirLens] OCR language=%@ lines=%d blocks=%d chars=%d",
      language,
      lines.count,
      blocks.count,
      text.count
    )

    return payload(
      text: text,
      language: language,
      blocks: blocks,
      width: width,
      height: height,
      previewJpegBase64: previewJpegBase64
    )
  }

  // MARK: - Observation parsing

  private static func parse(
    _ observation: VNRecognizedTextObservation,
    confidenceFloor: Float
  ) -> Line? {
    guard let candidate = observation.topCandidates(1).first else {
      return nil
    }

    let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
    // Short CJK/Hangul/Thai/Arabic labels are meaningful (a dish name, a
    // product line); a one-letter Latin fragment is noise.
    let scripted = text.unicodeScalars.contains { scalar in
      let v = scalar.value
      return (0x3040...0x30FF).contains(v)
        || (0x4E00...0x9FFF).contains(v)
        || (0xAC00...0xD7AF).contains(v)
        || (0x0E00...0x0E7F).contains(v)
        || (0x0600...0x06FF).contains(v)
        || (0x0400...0x04FF).contains(v)
    }
    let floor: Float = text.count >= 4
      ? confidenceFloor
      : (scripted ? 0.45 : 0.72)
    let minimumCharacters = scripted ? 1 : 2
    guard
      candidate.confidence >= floor,
      text.count >= minimumCharacters,
      !isNoise(text)
    else {
      return nil
    }

    let box = observation.boundingBox
    return Line(
      text: text,
      confidence: candidate.confidence,
      box: CGRect(
        x: box.minX,
        y: 1 - box.maxY,
        width: box.width,
        height: box.height
      )
    )
  }

  private static func isUrlNoise(_ text: String) -> Bool {
    let lower = text.lowercased()
    if lower.contains("http://") || lower.contains("https://") || lower.contains("www.") {
      return true
    }
    if lower.contains("google.com/maps") || lower.contains("maps_sv") || lower.contains("cb_client") {
      return true
    }
    let percentEncoded = lower.range(of: "%[0-9a-f]{2}", options: .regularExpression) != nil
    if percentEncoded && (lower.contains("=") || lower.contains("&") || lower.contains("?")) {
      return true
    }
    if lower.contains("%3f") || lower.contains("%3d") || lower.contains("%26") || lower.contains("%2f") {
      return true
    }
    return false
  }

  private static func isNoise(_ text: String) -> Bool {
    let allowed = punctuationNoise
      .union(.whitespacesAndNewlines)
      .union(.punctuationCharacters)
    return text.unicodeScalars.allSatisfy { allowed.contains($0) }
  }

  // MARK: - Recognition passes

  /// A forced source language must also lead OCR, not only label the result.
  /// English is kept as a secondary model for embedded Latin text.
  private static func scriptGroups(
    preferred: [String],
    english: String?
  ) -> [[String]] {
    let en = english.map { [$0] } ?? []
    let groups: [[String]] = [
      ["ko-KR"] + en,
      ["ja-JP", "zh-Hans", "zh-Hant"] + en,
      ["th-TH"] + en,
      ["de-DE", "fr-FR", "es-ES", "vi-VN", "id-ID"] + en,
    ]
    return groups
      .map { group in group.filter { preferred.contains($0) } }
      .filter { !$0.isEmpty }
  }

  /// Number of characters in the script of `language`, used to reject a pass
  /// that only read incidental Latin text (a model that drops the sign's
  /// actual script).
  private static func scriptScore(_ lines: [Line], for language: String) -> Int {
    let prefix = String(language.lowercased().prefix(2))
    let ranges: [ClosedRange<UInt32>]
    switch prefix {
    case "ko":
      ranges = [0xAC00...0xD7AF, 0x1100...0x11FF, 0x3130...0x318F]
    case "ja":
      ranges = [0x3040...0x30FF, 0x4E00...0x9FFF]
    case "zh":
      ranges = [0x4E00...0x9FFF, 0x3400...0x4DBF]
    case "th":
      ranges = [0x0E00...0x0E7F]
    case "ru", "uk":
      ranges = [0x0400...0x04FF]
    case "ar":
      ranges = [0x0600...0x06FF, 0x0750...0x077F]
    default:
      ranges = [0x0041...0x024F]
    }
    return lines.reduce(0) { total, line in
      total + line.text.unicodeScalars.reduce(0) { sum, scalar in
        ranges.contains { $0.contains(scalar.value) } ? sum + 1 : sum
      }
    }
  }

  private static let stickyLock = NSLock()
  private static var lastScriptPrimary: String?

  private static func lineArea(_ lines: [Line]) -> CGFloat {
    lines.reduce(0) { total, line in
      total + line.box.width * line.box.height
    }
  }

  /// The last script that produced a scan is the most likely one for the next
  /// scan (same restaurant, same sign). Try it alone first; only fan out to
  /// every model when it cannot cover the frame.
  private static func autoWithSticky(
    _ image: CGImage,
    groups: [[String]],
    confidenceFloor: Float
  ) throws -> [Line] {
    stickyLock.lock()
    let sticky = lastScriptPrimary
    stickyLock.unlock()

    if let sticky,
       let group = groups.first(where: {
         ($0.first ?? "").lowercased().hasPrefix(
           String(sticky.lowercased().prefix(2))
         )
       }) {
      if let candidate = try? runPass(
        image,
        automatic: false,
        languages: group,
        confidenceFloor: confidenceFloor
      ).filter({ !isUrlNoise($0.text) }),
        !candidate.isEmpty,
        candidate.contains { $0.text.count >= 4 && $0.box.height >= 0.02 } {
        return candidate
      }
    }

    let (lines, primary) = try autoPasses(
      image,
      groups: groups,
      confidenceFloor: confidenceFloor
    )
    if let primary {
      stickyLock.lock()
      lastScriptPrimary = primary
      stickyLock.unlock()
    }
    return lines
  }

  private static func autoPasses(
    _ image: CGImage,
    groups: [[String]],
    confidenceFloor: Float
  ) throws -> ([Line], String?) {
    // AUTO runs the script models side by side: latency is one pass instead
    // of four, and the energy is a short ANE burst on a single frame, far
    // below the camera/display cost. The first group whose pass actually
    // contains that script wins; otherwise the first non-empty result is kept.
    let lock = NSLock()
    var results = [[Line]?](repeating: nil, count: groups.count)
    DispatchQueue.concurrentPerform(iterations: groups.count) { index in
      let group = groups[index]
      guard !group.isEmpty else {
        return
      }
      do {
        let candidate = try runPass(
          image,
          automatic: false,
          languages: group,
          confidenceFloor: confidenceFloor
        ).filter { !isUrlNoise($0.text) }
        lock.lock()
        results[index] = candidate
        lock.unlock()
      } catch {
        NSLog(
          "[NoirLens] OCR group pass failed (%@): %@",
          group.first ?? "?",
          error.localizedDescription
        )
      }
    }

    // The pass covering the most pixel area is the actual sign; a tiny
    // footnote or sticker can no longer outrank the large text.
    var best: (area: CGFloat, primary: String, lines: [Line])?
    for (index, group) in groups.enumerated() {
      guard let candidate = results[index], !candidate.isEmpty else {
        continue
      }
      let area = lineArea(candidate)
      if best == nil || area > best!.area {
        best = (area, group.first ?? "", candidate)
      }
    }
    guard let best else {
      return ([], nil)
    }
    return (best.lines, best.primary)
  }

  private static func forcedLanguages(hint: String, preferred: [String]) -> [String] {
    let normalized = hint.lowercased()
    let prefix = normalized.contains("-")
      ? normalized
      : String(normalized.prefix(2))
    let primary = preferred.first { $0.lowercased().hasPrefix(prefix) }
    guard let primary else {
      return preferred
    }
    var languages = [primary]
    if let english = preferred.first(where: { $0.lowercased().hasPrefix("en") }),
       english != primary {
      languages.append(english)
    }
    return languages
  }


  private static func supportedPreferredLanguages() -> [String] {
    let probe = VNRecognizeTextRequest()
    guard
      let supported = try? VNRecognizeTextRequest.supportedRecognitionLanguages(
        for: .accurate,
        revision: probe.revision
      )
    else {
      return []
    }
    let supportedSet = Set(supported)
    let filtered = preferredLanguageCodes.filter { supportedSet.contains($0) }
    NSLog("[NoirLens] OCR preferred languages available=%d", filtered.count)
    return filtered
  }

  private static func enhancedImage(_ image: CIImage) -> CIImage? {
    let mono = image.applyingFilter("CIColorControls", parameters: [
      kCIInputSaturationKey: 0,
      kCIInputContrastKey: 1.35,
      kCIInputBrightnessKey: 0.02,
    ])
    let width = mono.extent.width
    guard width > 0 else {
      return nil
    }
    let scale = width < 1000 ? 2.0 : 1.0
    return mono.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
  }

  private static func runPass(
    _ image: CGImage,
    automatic: Bool,
    languages: [String],
    confidenceFloor: Float
  ) throws -> [Line] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.automaticallyDetectsLanguage = automatic
    if !automatic {
      request.recognitionLanguages = languages
    }

    let handler = VNImageRequestHandler(
      cgImage: image,
      orientation: .up,
      options: [:]
    )
    try handler.perform([request])

    let observations = request.results ?? []
    let lines = observations.compactMap { parse($0, confidenceFloor: confidenceFloor) }
    let characters = lines.reduce(0) { $0 + $1.text.count }
    NSLog(
      "[NoirLens] OCR pass automatic=%d languages=%d lines=%d chars=%d",
      automatic ? 1 : 0,
      languages.count,
      lines.count,
      characters
    )
    return lines
  }

  // MARK: - Language

  private static func dominantLanguage(in text: String) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return "und"
    }

    let recognizer = NLLanguageRecognizer()
    recognizer.processString(trimmed)

    // AUTO is limited to the languages this app can actually translate. Short
    // German signs are easily mistaken for Romanian/Polish by the generic
    // detector, so pick the best traveler-language hypothesis instead of the
    // best arbitrary non-English one.
    let hypotheses = recognizer.languageHypotheses(withMaximum: 16)
    let traveler = hypotheses
      .filter { isTravelerLanguage($0.key) }
      .max(by: { $0.value < $1.value })
    let englishProbability = hypotheses[.english] ?? 0

    // Strong orthographic signals (umlauts, kana, Hangul, Thai, Han) and
    // common German function words should win over generic probabilities.
    if let scriptHint = scriptHint(for: trimmed) {
      return scriptHint
    }

    if let germanHint = germanSignalLanguage(for: trimmed) {
      return germanHint
    }

    // Genuinely English text: no traveler language is plausible, so let the
    // result card explain that this app translates into English.
    if englishProbability >= 0.5, (traveler?.value ?? 0) < 0.15 {
      return "en"
    }

    if let traveler, traveler.value >= 0.02 {
      return traveler.key.rawValue
    }

    if let detected = recognizer.dominantLanguage?.rawValue,
       detected.hasPrefix("en") || isTravelerLanguageCode(detected) {
      return detected
    }

    // Unsupported language (Romanian, Polish, ...): do not offer a pack the
    // app cannot download. The user can still force a traveler language.
    return "und"
  }

  private static func scriptHint(for text: String) -> String? {
    var hasKana = false
    var hasHangul = false
    var hasThai = false
    var hasHan = false

    for scalar in text.unicodeScalars {
      switch scalar.value {
      case 0x3040...0x30FF:
        hasKana = true
      case 0xAC00...0xD7AF:
        hasHangul = true
      case 0x0E00...0x0E7F:
        hasThai = true
      case 0x4E00...0x9FFF:
        hasHan = true
      default:
        break
      }
    }

    if hasThai { return "th" }
    if hasHangul { return "ko" }
    if hasKana { return "ja" }
    if hasHan { return "zh-Hans" }
    if text.contains(where: { "äöüßÄÖÜ".contains($0) }) { return "de" }
    return nil
  }

  private static let travelerLanguagePrefixes = [
    "de", "ja", "ko", "zh", "es", "fr", "th", "vi", "id",
  ]

  private static func isTravelerLanguage(_ language: NLLanguage) -> Bool {
    isTravelerLanguageCode(language.rawValue)
  }

  private static func isTravelerLanguageCode(_ code: String) -> Bool {
    travelerLanguagePrefixes.contains { code.hasPrefix($0) }
  }

  /// Short German signs without umlauts are often assigned to Romanian or
  /// Polish by NLLanguage. A handful of high-signal function words is enough
  /// to recover German without hard-coding a full dictionary.
  private static func germanSignalLanguage(for text: String) -> String? {
    let words = Set(
      text
        .lowercased()
        .split(whereSeparator: { !$0.isLetter })
        .map(String.init)
    )
    let signalWords: Set<String> = [
      "und", "der", "die", "das", "ein", "eine", "einen", "einem",
      "nicht", "mit", "für", "frei", "uhr", "straße", "platz",
      "entladen", "beladen", "aussteigen", "einsteigen", "halten",
      "montag", "dienstag", "mittwoch", "donnerstag", "freitag",
      "samstag", "sonntag",
    ]
    let hits = words.intersection(signalWords).count
    return hits >= 2 ? "de" : nil
  }

  private static func isCJK(_ language: String) -> Bool {
    language.hasPrefix("ja")
      || language.hasPrefix("ko")
      || language.hasPrefix("zh")
      || language.hasPrefix("yue")
  }

  private static func isVerticalLayout(_ lines: [Line], language: String) -> Bool {
    guard isCJK(language), !lines.isEmpty else {
      return false
    }
    let verticalCount = lines.filter { $0.box.height > $0.box.width * 1.6 }.count
    return verticalCount * 2 > lines.count
  }

  // MARK: - Grouping

  private static func groupParagraphs(
    _ lines: [Line],
    language: String
  ) -> [[Line]] {
    let medianHeight = median(lines.map(\.box.height), fallback: 0.02)
    var rows: [[Line]] = []

    for line in lines.sorted(by: { $0.box.midY < $1.box.midY }) {
      if let index = rows.lastIndex(where: { row in
        guard let reference = row.first else {
          return false
        }
        return abs(reference.box.midY - line.box.midY) <= medianHeight * 0.7
      }) {
        rows[index].append(line)
      } else {
        rows.append([line])
      }
    }

    rows = rows
      .map { $0.sorted { $0.box.minX < $1.box.minX } }
      .sorted { union($0.map(\.box)).minY < union($1.map(\.box)).minY }

    var paragraphs: [[Line]] = []
    for row in rows {
      if let index = paragraphs.indices.last {
        let previousBox = union(paragraphs[index].map(\.box))
        let rowBox = union(row.map(\.box))
        let gap = rowBox.minY - previousBox.maxY
        if gap <= medianHeight * 0.9 && gap >= -medianHeight * 1.2 {
          paragraphs[index].append(contentsOf: row)
          continue
        }
      }
      paragraphs.append(row)
    }

    return paragraphs
  }

  private static func groupColumns(_ lines: [Line]) -> [[Line]] {
    let medianWidth = median(lines.map(\.box.width), fallback: 0.02)
    var columns: [[Line]] = []

    for line in lines.sorted(by: { $0.box.midX > $1.box.midX }) {
      if let index = columns.lastIndex(where: { column in
        guard let reference = column.first else {
          return false
        }
        return abs(reference.box.midX - line.box.midX) <= medianWidth * 0.7
      }) {
        columns[index].append(line)
      } else {
        columns.append([line])
      }
    }

    return columns.map { $0.sorted { $0.box.minY < $1.box.minY } }
  }

  private static func joinedText(
    _ lines: [Line],
    language: String,
    vertical: Bool
  ) -> String {
    let separator = vertical || isCJK(language) ? "" : " "
    return lines.map(\.text).joined(separator: separator)
  }

  // MARK: - Payload

  private static func payload(
    text: String,
    language: String,
    blocks: [Block],
    width: Int,
    height: Int,
    previewJpegBase64: String?
  ) -> [String: Any] {
    let averageConfidence: Double
    if blocks.isEmpty {
      averageConfidence = 0
    } else {
      let total = blocks.reduce(Float(0)) { $0 + $1.confidence }
      averageConfidence = Double(total / Float(blocks.count))
    }

    var result: [String: Any] = [
      "text": text,
      "sourceLanguage": language,
      "blocks": blocks.map { block in
        [
          "text": block.text,
          "confidence": Double(block.confidence),
          "x": Double(block.box.minX),
          "y": Double(block.box.minY),
          "width": Double(block.box.width),
          "height": Double(block.box.height)
        ] as [String: Any]
      },
      "confidence": averageConfidence,
      "imageWidth": width,
      "imageHeight": height,
      "sourceHash": sourceHash(text: text, language: language)
    ]

    if let previewJpegBase64 {
      result["previewJpegBase64"] = previewJpegBase64
    }

    return result
  }

  private static func sourceHash(text: String, language: String) -> String {
    guard !text.isEmpty else {
      return ""
    }
    let normalized = text
      .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
    let digest = SHA256.hash(data: Data("\(language)|\(normalized)".utf8))
    return digest.map { String(format: "%02x", $0) }.joined()
  }

  // MARK: - Math

  private static func union(_ boxes: [CGRect]) -> CGRect {
    guard let first = boxes.first else {
      return .zero
    }
    return boxes.dropFirst().reduce(first) { $0.union($1) }
  }

  private static func median(_ values: [CGFloat], fallback: CGFloat) -> CGFloat {
    guard !values.isEmpty else {
      return fallback
    }
    return values.sorted()[values.count / 2]
  }
}
