extension Client {
    /// Derived from the tool execution event lifecycle.
    /// - running: received toolExecutionStart, no toolExecutionEnd yet
    /// - success: received toolExecutionEnd with isError == false  
    /// - error: received toolExecutionEnd with isError == true
    public enum ToolCallStatus: String, Sendable, Hashable {
        case running
        case success
        case error
    }
}
