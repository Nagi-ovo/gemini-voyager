// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "VoyagerNativeCore",
  platforms: [.macOS(.v10_15)],
  products: [
    .library(name: "VoyagerNativeCore", targets: ["VoyagerNativeCore"]),
  ],
  targets: [
    .target(
      name: "VoyagerNativeCore",
      path: "Shared"
    ),
    .testTarget(
      name: "VoyagerNativeCoreTests",
      dependencies: ["VoyagerNativeCore"],
      path: "Tests"
    ),
  ]
)
