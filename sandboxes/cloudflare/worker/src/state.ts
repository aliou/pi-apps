import type { Container } from "@cloudflare/containers";

const KEY_PREFIX = "sandboxes";

function stateKey(sessionId: string): string {
  return `${KEY_PREFIX}/${sessionId}/state.tar.gz`;
}

/**
 * Upload state tarball to R2.
 */
export async function saveState(
  bucket: R2Bucket,
  sessionId: string,
  body: ArrayBuffer | ReadableStream,
): Promise<void> {
  await bucket.put(stateKey(sessionId), body, {
    httpMetadata: { contentType: "application/gzip" },
    customMetadata: { savedAt: new Date().toISOString() },
  });
}

/**
 * Check if state exists in R2.
 */
export async function stateExists(
  bucket: R2Bucket,
  sessionId: string,
): Promise<boolean> {
  const head = await bucket.head(stateKey(sessionId));
  return head !== null;
}

/**
 * Restore state from R2 into a running container via the bridge's /restore
 * endpoint. Downloads the tar from R2 and streams it to the bridge.
 */
export async function restoreState(
  bucket: R2Bucket,
  sessionId: string,
  container: Container<Env>,
): Promise<void> {
  const object = await bucket.get(stateKey(sessionId));
  if (!object) {
    throw new Error(`No state found in R2 for session ${sessionId}`);
  }

  const response = await container.containerFetch(
    "http://localhost:4000/restore",
    {
      method: "POST",
      headers: { "Content-Type": "application/gzip" },
      body: object.body,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Restore failed: ${response.status} ${await response.text()}`,
    );
  }
}

/**
 * Delete state from R2.
 */
export async function deleteState(
  bucket: R2Bucket,
  sessionId: string,
): Promise<void> {
  await bucket.delete(stateKey(sessionId));
}
