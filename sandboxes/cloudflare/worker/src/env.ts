import type { PiSandbox } from "./sandbox";

export interface Env {
  PI_SANDBOX: DurableObjectNamespace<PiSandbox>;
  STATE_BUCKET: R2Bucket;
  RELAY_SECRET: string;
}
