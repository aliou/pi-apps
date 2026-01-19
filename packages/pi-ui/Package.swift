// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "pi-ui",
    platforms: [
        .macOS(.v15),
        .iOS(.v18)
    ],
    products: [
        .library(name: "PiUI", targets: ["PiUI"])
    ],
    dependencies: [
        .package(url: "https://github.com/gonzalezreal/textual", from: "0.2.0")
    ],
    targets: [
        .target(
            name: "PiUI",
            dependencies: [
                .product(name: "Textual", package: "textual")
            ]
        )
    ]
)
