import AVFoundation
import CoreImage
import ExpoModulesCore
import UIKit

struct CapturedFrame {
  let sampleBuffer: CMSampleBuffer
  let previewJpegBase64: String?

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
final class CameraController: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  static let shared = CameraController()

  let session = AVCaptureSession()

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

  private override init() {
    super.init()
  }

  // MARK: - Lifecycle

  func start() async throws {
    try await ensureCameraPermission()

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      sessionQueue.async {
        do {
          try self.configureIfNeeded()
          self.replaceLatestSampleBuffer(nil)
          if !self.session.isRunning {
            self.session.startRunning()
          }
          guard self.session.isRunning else {
            throw cameraException(
              name: "CameraUnavailable",
              description: "The capture session could not start.",
              code: "ERR_CAMERA_UNAVAILABLE"
            )
          }
          self.notifyPreviewRotation()
          continuation.resume()
        } catch {
          continuation.resume(throwing: error)
        }
      }
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

  func captureFrame() async throws -> CapturedFrame {
    guard let sampleBuffer = await waitForSampleBuffer(timeout: 1.2) else {
      await stop()
      throw cameraException(
        name: "NoFrame",
        description: "The camera did not deliver a frame in time.",
        code: "ERR_NO_FRAME"
      )
    }

    // The sensor is no longer needed once a frame is in hand. Powering down
    // before OCR and translation is what keeps the read phase at ~0 W.
    await stop()

    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      throw cameraException(
        name: "NoFrame",
        description: "The captured frame had no image buffer.",
        code: "ERR_NO_FRAME"
      )
    }

    return CapturedFrame(
      sampleBuffer: sampleBuffer,
      previewJpegBase64: makePreviewJPEG(pixelBuffer: pixelBuffer)
    )
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
    if device.isLowLightBoostSupported {
      device.isLowLightBoostEnabled = false
    }

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

  private func makePreviewJPEG(pixelBuffer: CVPixelBuffer) -> String? {
    let upright = CIImage(cvPixelBuffer: pixelBuffer).oriented(.right)
    guard let cgImage = ciContext.createCGImage(upright, from: upright.extent) else {
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
