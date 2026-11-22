import AVFoundation
import CoreImage
import ExpoModulesCore
import UIKit

struct CapturedFrame {
  let sampleBuffer: CMSampleBuffer
  let previewJpegBase64: String?
  let cropRect: CGRect?

  var pixelBuffer: CVPixelBuffer? {
    CMSampleBufferGetImageBuffer(sampleBuffer)
  }
}

/**
 Owns the single `AVCaptureSession` used by the app.

 The session is configured once at 1280x720 / 30fps, never 4K and never
 multi-camera. `stop()` calls `stopRunning()`, which powers down the sensor,
 voice-coil autofocus and ISP until the next arm. Frame buffers are delivered
 on a background queue. The low-power edge HUD is derived on the GPU at 15 fps,
 while the untouched pixel buffer is handed to Vision on capture.
 */
final class CameraController: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
  static let shared = CameraController()

  private var _session = AVCaptureSession()
  private let sessionLock = NSLock()

  var session: AVCaptureSession {
    sessionLock.lock()
    defer { sessionLock.unlock() }
    return _session
  }

  func currentSession() -> AVCaptureSession { session }

  private let sessionQueue = DispatchQueue(label: "app.noirlens.camera.session")
  private let videoQueue = DispatchQueue(
    label: "app.noirlens.camera.video",
    qos: .userInitiated
  )
  private let stateLock = NSLock()
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

  private var device: AVCaptureDevice?
  private var videoOutput: AVCaptureVideoDataOutput?
  private var configured = false
  private var latestSampleBuffer: CMSampleBuffer?
  private weak var edgeSink: EcoCameraView?
  private var ecoMode = false
  private var lastEdgeFrameAt: CFTimeInterval = 0
  private var previewViewSize: CGSize = .zero
  private var lastRuntimeError: Error?
  private var lastInterruptionReason: AVCaptureSession.InterruptionReason?
  private var sessionObservers: [NSObjectProtocol] = []

  private override init() {
    super.init()
  }

  // MARK: - Lifecycle

  func start() async throws {
    try await ensureCameraPermission()
    let active = await MainActor.run {
      UIApplication.shared.applicationState == .active
    }
    guard active else {
      throw cameraException(
        name: "CameraUnavailable",
        description: "The app was not active when the camera was asked to start.",
        code: "ERR_CAMERA_UNAVAILABLE"
      )
    }
    lastRuntimeError = nil
    lastInterruptionReason = nil

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      sessionQueue.async {
        do {
          let activeNow = DispatchQueue.main.sync {
            UIApplication.shared.applicationState == .active
          }
          guard activeNow else {
            throw cameraException(
              name: "CameraUnavailable",
              description: "The app is not active; the camera cannot start in the background.",
              code: "ERR_CAMERA_INACTIVE"
            )
          }
          try self.configureIfNeeded()
          if let device = self.device {
            // Restore continuous AF/AE after the previous capture's one-shot
            // center focus, so the preview keeps hunting while framing.
            self.configureDevice(device)
          }
          self.replaceLatestSampleBuffer(nil)
          if !self.startRunning() {
            // The singleton session can be left in a state that never
            // reports running after a stop while its preview layer is
            // attached. Rebuild it once instead of retrying the same object.
            self.rebuildSession()
            try self.configureIfNeeded()
            if let device = self.device {
              self.configureDevice(device)
            }
            self.replaceLatestSampleBuffer(nil)
            guard self.startRunning() else {
              throw cameraException(
                name: "CameraUnavailable",
                description: self.startFailureDescription(),
                code: "ERR_CAMERA_UNAVAILABLE"
              )
            }
          }
          self.notifyPreviewRotation()
          continuation.resume()
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  private func startFailureDescription() -> String {
    if let error = lastRuntimeError {
      let ns = error as NSError
      return "AVFoundation error: \(ns.domain) \(ns.code): \(ns.localizedDescription)"
    }
    if let reason = lastInterruptionReason {
      return "AVFoundation interrupted the session (reason \(reason.rawValue))."
    }
    return "The capture session could not start."
  }

  private func observeSession(_ session: AVCaptureSession) {
    for observer in sessionObservers {
      NotificationCenter.default.removeObserver(observer)
    }
    sessionObservers = [
      NotificationCenter.default.addObserver(
        forName: .AVCaptureSessionRuntimeError,
        object: session,
        queue: .main
      ) { [weak self] note in
        let error = note.userInfo?[AVCaptureSessionErrorKey] as? Error
        self?.lastRuntimeError = error
        NSLog("[NoirLens] AVCaptureSession runtime error: \(String(describing: error))")
      },
      NotificationCenter.default.addObserver(
        forName: .AVCaptureSessionWasInterrupted,
        object: session,
        queue: .main
      ) { [weak self] note in
        let raw = note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int
        if let raw, let reason = AVCaptureSession.InterruptionReason(rawValue: raw) {
          self?.lastInterruptionReason = reason
        }
        NSLog("[NoirLens] AVCaptureSession interrupted: \(String(describing: note.userInfo))")
      },
    ]
  }

  private func startRunning() -> Bool {
    var attempts = 0
    while !session.isRunning, attempts < 3 {
      if attempts > 0 {
        Thread.sleep(forTimeInterval: 0.2)
      }
      session.startRunning()
      attempts += 1
    }
    return session.isRunning
  }

  /// Replaces the capture session when it is unrecoverable. The preview layer
  /// must be re-pointed at the new session on the main thread.
  private func rebuildSession() {
    sessionLock.lock()
    let old = _session
    sessionLock.unlock()
    if old.isRunning {
      old.stopRunning()
    }
    let next = AVCaptureSession()
    sessionLock.lock()
    _session = next
    sessionLock.unlock()
    configured = false
    device = nil
    videoOutput = nil
    replaceLatestSampleBuffer(nil)
    DispatchQueue.main.async { [weak self] in
      self?.edgeSink?.updateSession(next)
    }
  }

  func stop() async {
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      sessionQueue.async {
        if self.session.isRunning {
          self.session.stopRunning()
        }
        self.replaceLatestSampleBuffer(nil)
        continuation.resume()
      }
    }
  }

  func status() async -> [String: Any] {
    await withCheckedContinuation { (continuation: CheckedContinuation<[String: Any], Never>) in
      sessionQueue.async {
        let authorized = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
        let adjustingFocus = self.device?.isAdjustingFocus ?? false
        let adjustingExposure = self.device?.isAdjustingExposure ?? false
        let running = self.session.isRunning
        continuation.resume(returning: [
          "authorized": authorized,
          "running": running,
          "hasDevice": self.device != nil,
          "adjustingFocus": adjustingFocus,
          "adjustingExposure": adjustingExposure,
          "settled": authorized && running && !adjustingFocus && !adjustingExposure
        ])
      }
    }
  }

  // MARK: - Capture

  func captureFrame(crop: CropRect? = nil) async throws -> CapturedFrame {
    // Re-focus and re-expose at the reticle center, then take a fresh frame.
    // The auto arm can fire while AF is still settling; this gives every
    // capture a dedicated, sharp frame instead of whatever was on screen.
    await prepareForCapture()
    replaceLatestSampleBuffer(nil)

    guard let sampleBuffer = await waitForSampleBuffer(timeout: 1.5) else {
      throw cameraException(
        name: "NoFrame",
        description: "The camera did not deliver a frame in time.",
        code: "ERR_NO_FRAME"
      )
    }

    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      throw cameraException(
        name: "NoFrame",
        description: "The captured frame had no image buffer.",
        code: "ERR_NO_FRAME"
      )
    }

    let cropRect = imageCropRect(for: crop, pixelBuffer: pixelBuffer)
    return CapturedFrame(
      sampleBuffer: sampleBuffer,
      previewJpegBase64: makePreviewJPEG(pixelBuffer: pixelBuffer, cropRect: cropRect),
      cropRect: cropRect
    )
  }

  func updatePreviewSize(_ size: CGSize) {
    stateLock.lock()
    previewViewSize = size
    stateLock.unlock()
  }

  private func imageCropRect(
    for crop: CropRect?,
    pixelBuffer: CVPixelBuffer
  ) -> CGRect? {
    guard let crop, crop.width > 0, crop.height > 0 else {
      return nil
    }

    stateLock.lock()
    let viewSize = previewViewSize
    stateLock.unlock()

    guard viewSize.width > 0, viewSize.height > 0 else {
      return nil
    }

    // The upright image is the landscape buffer rotated right.
    let uprightWidth = CGFloat(CVPixelBufferGetHeight(pixelBuffer))
    let uprightHeight = CGFloat(CVPixelBufferGetWidth(pixelBuffer))
    guard uprightWidth > 0, uprightHeight > 0 else {
      return nil
    }

    // The preview layer is resizeAspectFill; map the reticle's view rect
    // through the same scale and center crop before OCR.
    let scale = max(viewSize.width / uprightWidth, viewSize.height / uprightHeight)
    let displayWidth = uprightWidth * scale
    let displayHeight = uprightHeight * scale
    let offsetX = (displayWidth - viewSize.width) / 2
    let offsetY = (displayHeight - viewSize.height) / 2

    let viewRect = CGRect(
      x: CGFloat(crop.x) * viewSize.width,
      y: CGFloat(crop.y) * viewSize.height,
      width: CGFloat(crop.width) * viewSize.width,
      height: CGFloat(crop.height) * viewSize.height
    )
    let imageRect = CGRect(
      x: (viewRect.minX + offsetX) / scale,
      y: (viewRect.minY + offsetY) / scale,
      width: viewRect.width / scale,
      height: viewRect.height / scale
    )
    let clipped = imageRect.intersection(
      CGRect(x: 0, y: 0, width: uprightWidth, height: uprightHeight)
    )
    return clipped.isNull ? nil : clipped
  }

  private func prepareForCapture() async {
    sessionQueue.async {
      guard let device = self.device else {
        return
      }
      guard (try? device.lockForConfiguration()) != nil else {
        return
      }
      if device.isFocusPointOfInterestSupported {
        device.focusPointOfInterest = CGPoint(x: 0.5, y: 0.5)
      }
      if device.isExposurePointOfInterestSupported {
        device.exposurePointOfInterest = CGPoint(x: 0.5, y: 0.5)
      }
      if device.isFocusModeSupported(.autoFocus) {
        device.focusMode = .autoFocus
      }
      if device.isExposureModeSupported(.autoExpose) {
        device.exposureMode = .autoExpose
      }
      device.unlockForConfiguration()
    }

    try? await Task.sleep(nanoseconds: 120_000_000)

    let deadline = Date().addingTimeInterval(1.2)
    while Date() < deadline {
      let ready = sessionQueue.sync { () -> Bool in
        guard self.session.isRunning, let device = self.device else {
          return false
        }
        return !device.isAdjustingFocus && !device.isAdjustingExposure
      }
      if ready {
        return
      }
      try? await Task.sleep(nanoseconds: 50_000_000)
    }
  }

  // MARK: - Edge sink

  func attach(_ view: EcoCameraView) {
    stateLock.lock()
    edgeSink = view
    stateLock.unlock()
  }

  func detach(_ view: EcoCameraView) {
    stateLock.lock()
    if edgeSink === view {
      edgeSink = nil
    }
    stateLock.unlock()
  }

  func setEcoMode(_ enabled: Bool) {
    stateLock.lock()
    ecoMode = enabled
    stateLock.unlock()
  }

  private func notifyPreviewRotation() {
    stateLock.lock()
    let sink = edgeSink
    stateLock.unlock()

    guard let sink else {
      return
    }
    DispatchQueue.main.async {
      sink.updatePreviewRotation()
    }
  }

  // MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    replaceLatestSampleBuffer(sampleBuffer)
    renderEdgePreviewIfNeeded(sampleBuffer)
  }

  // MARK: - Session configuration

  private func ensureCameraPermission() async throws {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      return
    case .notDetermined:
      let granted = await AVCaptureDevice.requestAccess(for: .video)
      if !granted {
        throw cameraException(
          name: "CameraPermissionDenied",
          description: "Camera access was denied. Enable it in Settings.",
          code: "ERR_CAMERA_PERMISSION_DENIED"
        )
      }
    default:
      throw cameraException(
        name: "CameraPermissionDenied",
        description: "Camera access was denied. Enable it in Settings.",
        code: "ERR_CAMERA_PERMISSION_DENIED"
      )
    }
  }

  private func configureIfNeeded() throws {
    if configured {
      return
    }

    guard
      let device = AVCaptureDevice.default(
        .builtInWideAngleCamera,
        for: .video,
        position: .back
      )
    else {
      throw cameraException(
        name: "CameraUnavailable",
        description: "No back camera is available on this device.",
        code: "ERR_CAMERA_UNAVAILABLE"
      )
    }

    configureDevice(device)

    let input: AVCaptureDeviceInput
    do {
      input = try AVCaptureDeviceInput(device: device)
    } catch {
      throw cameraException(
        name: "CameraUnavailable",
        description: "The camera input could not be created.",
        code: "ERR_CAMERA_UNAVAILABLE"
      )
    }

    let output = AVCaptureVideoDataOutput()
    output.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String:
        kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
    ]
    output.alwaysDiscardsLateVideoFrames = true
    output.setSampleBufferDelegate(self, queue: videoQueue)

    session.beginConfiguration()
    defer { session.commitConfiguration() }

    session.sessionPreset = .hd1280x720

    guard session.canAddInput(input) else {
      throw cameraException(
        name: "CameraUnavailable",
        description: "The camera input could not be added.",
        code: "ERR_CAMERA_UNAVAILABLE"
      )
    }
    session.addInput(input)

    guard session.canAddOutput(output) else {
      session.removeInput(input)
      throw cameraException(
        name: "CameraUnavailable",
        description: "The video data output could not be added.",
        code: "ERR_CAMERA_UNAVAILABLE"
      )
    }
    session.addOutput(output)

    self.device = device
    self.videoOutput = output
    self.configured = true
    self.observeSession(session)
    self.notifyPreviewRotation()
  }

  private func configureDevice(_ device: AVCaptureDevice) {
    guard (try? device.lockForConfiguration()) != nil else {
      return
    }
    defer { device.unlockForConfiguration() }

    if device.isFocusModeSupported(.continuousAutoFocus) {
      device.focusMode = .continuousAutoFocus
    }
    if device.isExposureModeSupported(.continuousAutoExposure) {
      device.exposureMode = .continuousAutoExposure
    }
    if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
      device.whiteBalanceMode = .continuousAutoWhiteBalance
    }

    // Scene-change monitoring and low-light boost keep the ISP awake between
    // frames; neither is useful for a single-frame read.
    device.isSubjectAreaChangeMonitoringEnabled = false

    if device.activeFormat.isVideoHDRSupported {
      device.automaticallyAdjustsVideoHDREnabled = false
      device.isVideoHDREnabled = false
    }
  }

  // MARK: - Frame buffer plumbing

  private func replaceLatestSampleBuffer(_ buffer: CMSampleBuffer?) {
    stateLock.lock()
    latestSampleBuffer = buffer
    stateLock.unlock()
  }

  private func currentSampleBuffer() -> CMSampleBuffer? {
    stateLock.lock()
    let buffer = latestSampleBuffer
    stateLock.unlock()
    return buffer
  }

  private func waitForSampleBuffer(timeout: TimeInterval) async -> CMSampleBuffer? {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if let buffer = currentSampleBuffer() {
        return buffer
      }
      try? await Task.sleep(nanoseconds: 25_000_000)
    }
    return currentSampleBuffer()
  }

  // MARK: - Edge HUD

  private func renderEdgePreviewIfNeeded(_ sampleBuffer: CMSampleBuffer) {
    stateLock.lock()
    let eco = ecoMode
    let sink = edgeSink
    stateLock.unlock()

    guard eco, let sink else {
      return
    }
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }

    let now = CACurrentMediaTime()
    guard now - lastEdgeFrameAt >= (1.0 / 15.0) else {
      return
    }
    lastEdgeFrameAt = now

    let upright = CIImage(cvPixelBuffer: pixelBuffer).oriented(.right)
    let edges = upright.applyingFilter(
      "CIEdges",
      parameters: [kCIInputIntensityKey: 1.4]
    )
    let warmWhite = CIColor(red: 1.0, green: 0.973, blue: 0.906, alpha: 1.0)
    let tinted = edges.applyingFilter(
      "CIColorMonochrome",
      parameters: [
        kCIInputColorKey: warmWhite,
        kCIInputIntensityKey: 1.0
      ]
    )

    guard let image = ciContext.createCGImage(tinted, from: tinted.extent) else {
      return
    }

    DispatchQueue.main.async {
      sink.displayEdges(image)
    }
  }

  private func makePreviewJPEG(
    pixelBuffer: CVPixelBuffer,
    cropRect: CGRect?
  ) -> String? {
    let upright = CIImage(cvPixelBuffer: pixelBuffer).oriented(.right)
    let cropped = cropRect.map { upright.cropped(to: $0) } ?? upright
    guard let cgImage = ciContext.createCGImage(cropped, from: cropped.extent) else {
      return nil
    }
    guard let data = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.55) else {
      return nil
    }
    return data.base64EncodedString()
  }
}

func cameraException(name: String, description: String, code: String) -> Exception {
  Exception(name: name, description: description, code: code)
}
