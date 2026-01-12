// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "PiCore",
    platforms: [
        .macOS(.v14),
        .iOS(.v17)
    ],
    products: [
        .library(
            name: "PiCore",
            targets: ["PiCore"]
        )
    ],
    targets: [
        .target(
            name: "PiCore"
        ),
        .testTarget(
            name: "PiCoreTests",
            dependencies: ["PiCore"]
        )
    ]
)
