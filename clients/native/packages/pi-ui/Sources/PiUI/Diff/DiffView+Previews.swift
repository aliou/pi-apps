import SwiftUI

// MARK: - Sample Diffs

private let sampleSwiftPatch = """
--- a/Sources/App/AuthController.swift
+++ b/Sources/App/AuthController.swift
@@ -12,8 +12,14 @@ class AuthController {
     private let tokenStore: TokenStore
     private let logger: Logger

-    func authenticate(email: String, password: String) -> Bool {
-        guard let user = userStore.find(email: email) else { return false }
-        return user.password == password
+    func authenticate(email: String, password: String) async throws -> AuthToken {
+        guard let user = userStore.find(email: email) else {
+            throw AuthError.userNotFound
+        }
+        guard user.verifyPassword(password) else {
+            throw AuthError.invalidCredentials
+        }
+        let token = try await tokenStore.create(for: user)
+        logger.info("User \\(user.id) authenticated")
+        return token
     }

     func logout(token: String) {
"""

private let sampleTypeScriptPatch = """
--- a/src/api/middleware.ts
+++ b/src/api/middleware.ts
@@ -1,9 +1,21 @@
-import { NextFunction, Request, Response } from "express";
+import { type NextFunction, type Request, type Response } from "express";
+import { z } from "zod";
+import { RateLimiter } from "../utils/rate-limiter";

-export function authMiddleware(req: Request, res: Response, next: NextFunction) {
-  const token = req.headers.authorization;
-  if (!token) {
-    return res.status(401).json({ error: "Unauthorized" });
+const rateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 100 });
+
+export async function authMiddleware(
+  req: Request,
+  res: Response,
+  next: NextFunction,
+) {
+  const header = req.headers.authorization;
+  if (!header?.startsWith("Bearer ")) {
+    return res.status(401).json({ error: "Missing bearer token" });
+  }
+  const token = header.slice(7);
+  if (!rateLimiter.check(req.ip)) {
+    return res.status(429).json({ error: "Too many requests" });
   }
-  next();
+  req.user = await verifyToken(token);
+  return next();
 }
"""

private let samplePythonPatch = """
--- a/app/models.py
+++ b/app/models.py
@@ -5,10 +5,18 @@ from sqlalchemy import Column, Integer, String
 class User(Base):
     __tablename__ = "users"

     id = Column(Integer, primary_key=True)
     name = Column(String(100), nullable=False)
-    email = Column(String(255))
+    email = Column(String(255), unique=True, index=True)
+    created_at = Column(DateTime, default=datetime.utcnow)
+    is_active = Column(Boolean, default=True)

-    def __repr__(self):
-        return f"<User {self.name}>"
+    def __repr__(self) -> str:
+        return f"<User id={self.id} name={self.name}>"
+
+    def deactivate(self) -> None:
+        self.is_active = False
+
+    @property
+    def display_name(self) -> str:
+        return self.name or self.email.split("@")[0]
"""

// MARK: - Previews

#Preview("Swift Diff") {
    DiffView(patches: [
        DiffPatchInput(
            patch: sampleSwiftPatch,
            filename: "Sources/App/AuthController.swift",
            language: "swift"
        )
    ])
    .frame(width: 700, height: 400)
    .background(.black)
}

#Preview("TypeScript Diff") {
    DiffView(patches: [
        DiffPatchInput(
            patch: sampleTypeScriptPatch,
            filename: "src/api/middleware.ts",
            language: "typescript"
        )
    ])
    .frame(width: 700, height: 500)
    .background(.black)
}

#Preview("Python Diff") {
    DiffView(patches: [
        DiffPatchInput(
            patch: samplePythonPatch,
            filename: "app/models.py",
            language: "python"
        )
    ])
    .frame(width: 700, height: 450)
    .background(.black)
}

#Preview("Multiple Files") {
    DiffView(patches: [
        DiffPatchInput(
            patch: sampleSwiftPatch,
            filename: "Sources/App/AuthController.swift",
            language: "swift"
        ),
        DiffPatchInput(
            patch: sampleTypeScriptPatch,
            filename: "src/api/middleware.ts",
            language: "typescript"
        ),
        DiffPatchInput(
            patch: samplePythonPatch,
            filename: "app/models.py",
            language: "python"
        )
    ])
    .frame(width: 700, height: 600)
    .background(.black)
}
