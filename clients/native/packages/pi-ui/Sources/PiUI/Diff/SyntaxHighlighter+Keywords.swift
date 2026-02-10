import Foundation

// MARK: - Keyword Providers Extension

extension SyntaxHighlighter {
    // swiftlint:disable:next cyclomatic_complexity
    static func keywordsFor(language: String) -> [String] {
        switch language.lowercased() {
        case "swift":
            return swiftKeywords()
        case "python", "py":
            return pythonKeywords()
        case "javascript", "js", "jsx", "typescript", "ts", "tsx":
            return javascriptKeywords()
        case "go":
            return goKeywords()
        case "rust", "rs":
            return rustKeywords()
        case "ruby", "rb":
            return rubyKeywords()
        case "java", "kotlin", "kt":
            return javaKeywords()
        case "c", "cpp", "c++", "h", "hpp":
            return cppKeywords()
        case "bash", "sh", "zsh":
            return bashKeywords()
        case "json":
            return ["true", "false", "null"]
        case "markdown", "md":
            return []
        default:
            return defaultKeywords()
        }
    }

    private static func swiftKeywords() -> [String] {
        ["class", "struct", "enum", "protocol", "extension", "func", "init", "deinit",
         "var", "let", "static", "private", "public", "internal", "fileprivate", "open",
         "if", "else", "guard", "switch", "case", "default", "for", "while", "repeat",
         "in", "return", "break", "continue", "import", "typealias", "self", "Self",
         "super", "nil", "true", "false", "try", "catch", "throw", "throws", "async",
         "await", "override", "final", "mutating", "lazy", "weak", "unowned"]
    }

    private static func pythonKeywords() -> [String] {
        ["def", "class", "lambda", "if", "elif", "else", "for", "while", "break",
         "continue", "return", "yield", "import", "from", "as", "try", "except",
         "finally", "raise", "with", "async", "await", "pass", "assert", "and", "or",
         "not", "in", "is", "None", "True", "False", "self", "global", "nonlocal"]
    }

    private static func javascriptKeywords() -> [String] {
        ["if", "else", "switch", "case", "default", "for", "while", "do", "break",
         "continue", "return", "function", "var", "let", "const", "class", "extends",
         "import", "export", "from", "async", "await", "try", "catch", "finally", "throw",
         "new", "this", "super", "typeof", "instanceof", "true", "false", "null",
         "undefined", "interface", "type", "enum", "implements", "public", "private",
         "protected"]
    }

    private static func goKeywords() -> [String] {
        ["if", "else", "switch", "case", "default", "for", "range", "break", "continue",
         "return", "func", "var", "const", "type", "struct", "interface", "map", "chan",
         "package", "import", "go", "defer", "select", "true", "false", "nil"]
    }

    private static func rustKeywords() -> [String] {
        ["if", "else", "match", "loop", "while", "for", "in", "break", "continue",
         "return", "fn", "let", "mut", "const", "static", "struct", "enum", "trait",
         "impl", "type", "mod", "use", "pub", "crate", "super", "self", "Self",
         "async", "await", "move", "dyn", "ref", "unsafe", "true", "false"]
    }

    private static func rubyKeywords() -> [String] {
        ["if", "elsif", "else", "unless", "case", "when", "while", "until", "for",
         "break", "next", "return", "def", "class", "module", "end", "do", "begin",
         "rescue", "ensure", "raise", "yield", "self", "super", "true", "false", "nil"]
    }

    private static func javaKeywords() -> [String] {
        ["if", "else", "switch", "case", "default", "for", "while", "do", "break",
         "continue", "return", "class", "interface", "extends", "implements", "package",
         "import", "public", "private", "protected", "static", "final", "abstract",
         "new", "this", "super", "try", "catch", "finally", "throw", "true", "false",
         "null"]
    }

    private static func cppKeywords() -> [String] {
        ["if", "else", "switch", "case", "default", "for", "while", "do", "break",
         "continue", "return", "struct", "union", "enum", "typedef", "const",
         "static", "extern", "inline", "void", "int", "char", "float", "double",
         "class", "public", "private", "protected", "virtual", "override", "template",
         "namespace", "using", "new", "delete", "nullptr", "true", "false", "NULL"]
    }

    private static func bashKeywords() -> [String] {
        ["if", "then", "else", "elif", "fi", "case", "esac", "for", "while", "until",
         "do", "done", "in", "function", "return", "exit", "break", "continue",
         "local", "export", "true", "false"]
    }

    private static func defaultKeywords() -> [String] {
        ["if", "else", "for", "while", "return", "function", "var", "let", "const",
         "class", "import", "export", "true", "false", "null"]
    }
}
