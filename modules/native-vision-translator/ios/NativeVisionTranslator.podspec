Pod::Spec.new do |s|
  s.name           = 'NativeVisionTranslator'
  s.version        = '0.1.0'
  s.summary        = 'Battery-first camera OCR and on-device translation for NoirLens'
  s.description    = 'AVCaptureSession lifecycle, Noir preview overlay (dim + scanlines), Vision OCR and Apple Translation bridging.'
  s.author         = 'NoirLens'
  s.homepage       = 'https://github.com/noirlens/noirlens'
  s.platforms      = { :ios => '18.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version = '5.0'

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'AVFoundation', 'CoreImage', 'Vision', 'Translation'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
