// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "PiUI",
    platforms: [
        .macOS(.v26),
        .iOS(.v26)
    ],
    products: [
        .library(name: "PiUI", targets: ["PiUI"])
    ],
    dependencies: [
        .package(url: "https://github.com/gonzalezreal/textual", from: "0.3.1"),
        .package(url: "https://github.com/ChimeHQ/SwiftTreeSitter", from: "0.8.0"),
        .package(url: "https://github.com/CodeEditApp/CodeEditLanguages", exact: "0.1.21")
    ],
    targets: [
        .target(
            name: "PiUI",
            dependencies: [
                .product(name: "Textual", package: "textual"),
                .product(name: "SwiftTreeSitter", package: "SwiftTreeSitter", condition: .when(platforms: [.macOS])),
                .product(name: "CodeEditLanguages", package: "CodeEditLanguages", condition: .when(platforms: [.macOS]))
            ]
        )
    ]
)
