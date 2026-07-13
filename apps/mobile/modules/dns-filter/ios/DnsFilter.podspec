Pod::Spec.new do |s|
  s.name           = 'DnsFilter'
  s.version        = '1.0.0'
  s.summary        = 'On-device DNS web filtering (Android VpnService; iOS stub)'
  s.description    = 'Kidora web filter. Android uses a DNS VpnService; iOS reports unavailable.'
  s.author         = 'Kidora'
  s.homepage       = 'https://github.com/Micka420-collab/kidora'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
