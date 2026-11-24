import CoreImage
import ExpoModulesCore
import Foundation
import UIKit

/**
 Private on-device storage for Collect captures. Metadata lives in the app's
 JS store; this only owns the JPEG files under Documents/captures. Names are
 stored relative to that directory so the app container UUID changing after a
 reinstall cannot orphan the records.
 */
enum CaptureFiles {
  private static let folder = "captures"
  private static let context = CIContext(options: [.useSoftwareRenderer: false])
  private static let directoryLock = NSLock()
  private static var cachedDirectory: URL?

  static func directory() throws -> URL {
    directoryLock.lock()
    defer { directoryLock.unlock() }
    if let cachedDirectory {
      return cachedDirectory
    }
    let documents = FileManager.default.urls(
      for: .documentDirectory,
      in: .userDomainMask
    )[0]
    var directory = documents.appendingPathComponent(folder, isDirectory: true)
    try FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true
    )
    // Captures are private to the device; never let iCloud back them up.
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    // Fail closed: a capture that could be backed up would break the promise
    // that frames never leave the device.
    try directory.setResourceValues(values)
    cachedDirectory = directory
    return directory
  }

  /// Files older than `seconds`, used for startup-only orphan sweeping. The
  /// grace window keeps a capture that is being written right now safe.
  static func list(olderThan seconds: TimeInterval) -> [String] {
    guard
      let directory = try? directory(),
      let urls = try? FileManager.default.contentsOfDirectory(
        at: directory,
        includingPropertiesForKeys: [.contentModificationDateKey],
        options: [.skipsHiddenFiles]
      )
    else {
      return []
    }
    let cutoff = Date().addingTimeInterval(-max(0, seconds))
    return urls.compactMap { url in
      guard url.pathExtension == "jpg" else {
        return nil
      }
      let values = try? url.resourceValues(
        forKeys: [.contentModificationDateKey]
      )
      guard let modified = values?.contentModificationDate else {
        return nil
      }
      return modified < cutoff ? url.lastPathComponent : nil
    }
  }

  static func directoryUri() -> String {
    (try? directory().absoluteString) ?? ""
  }

  /// Rejects traversal: names are flat filenames written by `save`.
  static func url(for name: String) -> URL? {
    guard
      !name.isEmpty,
      !name.contains("/"),
      !name.contains(".."),
      let directory = try? directory()
    else {
      return nil
    }
    return directory.appendingPathComponent(name)
  }

  static func uri(for name: String) -> String {
    url(for: name)?.absoluteString ?? ""
  }

  static func save(
    jpegBase64: String
  ) throws -> (image: String, thumb: String, width: Int, height: Int) {
    guard
      let data = Data(base64Encoded: jpegBase64),
      let decoded = UIImage(data: data),
      let image = decoded.cgImage
    else {
      throw Exception(
        name: "CaptureSaveFailed",
        description: "The captured frame could not be encoded.",
        code: "ERR_CAPTURE_SAVE"
      )
    }
    let directory = try directory()
    let id = UUID().uuidString
    let imageName = "\(id).jpg"
    let thumbName = "\(id)-thumb.jpg"
    let imageURL = directory.appendingPathComponent(imageName)
    let thumbURL = directory.appendingPathComponent(thumbName)
    do {
      try data.write(to: imageURL, options: .atomic)
      guard let thumbData = thumbnailJPEG(image) else {
        throw Exception(
          name: "CaptureSaveFailed",
          description: "The capture thumbnail could not be encoded.",
          code: "ERR_CAPTURE_SAVE"
        )
      }
      try thumbData.write(to: thumbURL, options: .atomic)
    } catch {
      try? FileManager.default.removeItem(at: imageURL)
      try? FileManager.default.removeItem(at: thumbURL)
      throw error
    }
    return (imageName, thumbName, image.width, image.height)
  }

  static func delete(names: [String]) throws {
    for name in names {
      guard let url = url(for: name) else {
        continue
      }
      do {
        try FileManager.default.removeItem(at: url)
      } catch {
        let nsError = error as NSError
        if nsError.domain == NSCocoaErrorDomain
          && nsError.code == NSFileNoSuchFileError {
          continue
        }
        throw error
      }
    }
  }

  private static func thumbnailJPEG(
    _ image: CGImage,
    maxPixel: CGFloat = 480
  ) -> Data? {
    let width = CGFloat(image.width)
    let height = CGFloat(image.height)
    let scale = min(1, maxPixel / max(width, height))
    guard scale < 1 else {
      return UIImage(cgImage: image).jpegData(compressionQuality: 0.6)
    }
    let resized = CIImage(cgImage: image).transformed(
      by: CGAffineTransform(scaleX: scale, y: scale)
    )
    guard
      let thumb = context.createCGImage(resized, from: resized.extent)
    else {
      return nil
    }
    return UIImage(cgImage: thumb).jpegData(compressionQuality: 0.6)
  }
}
