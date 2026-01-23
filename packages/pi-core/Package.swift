// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "PiCore",
    platforms: [
        .macOS(.v26),
        .iOS(.v26)
    ],
    products: [
        .library(
            name: "PiCore",
            targets: ["PiCore"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.2.1")
    ],
    targets: [
        .target(
            name: "PiCore",
            dependencies: [
                .product(name: "Subprocess", package: "swift-subprocess", condition: .when(platforms: [.macOS]))
            ]
        ),
        .testTarget(
            name: "PiCoreTests",
            dependencies: ["PiCore"]
        )
    ]
)
