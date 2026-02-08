// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "PiCore",
    platforms: [
        .macOS(.v26),
        .iOS(.v26)
    ],
    products: [
        .library(name: "PiCore", targets: ["PiCore"])
    ],
    targets: [
        .target(name: "PiCore")
    ]
)
