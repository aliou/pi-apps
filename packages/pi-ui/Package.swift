// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "pi-ui",
    platforms: [
        .macOS(.v26),
        .iOS(.v26)
    ],
    products: [
        .library(name: "PiUI", targets: ["PiUI"])
    ],
    dependencies: [
        .package(url: "https://github.com/gonzalezreal/textual", from: "0.2.0"),
        .package(path: "../pi-core")
    ],
    targets: [
        .target(
            name: "PiUI",
            dependencies: [
                .product(name: "Textual", package: "textual"),
                .product(name: "PiCore", package: "pi-core")
            ]
        )
    ]
)
