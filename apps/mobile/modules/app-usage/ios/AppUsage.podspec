Pod::Spec.new do |s|
  s.name           = 'AppUsage'
  s.version        = '1.0.0'
  s.summary        = 'Kidora app-usage native module'
  s.description    = 'Reports per-app foreground usage (Android). iOS uses Screen Time API.'
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
