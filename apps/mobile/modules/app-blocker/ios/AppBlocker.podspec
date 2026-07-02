Pod::Spec.new do |s|
  s.name           = 'AppBlocker'
  s.version        = '1.0.0'
  s.summary        = 'Kidora native app blocker'
  s.description    = 'Blocks apps via an AccessibilityService (Android). iOS uses Screen Time / ManagedSettings.'
  s.author         = 'Kidora'
  s.homepage       = 'https://kidora.app'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
