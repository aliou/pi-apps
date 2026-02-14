import type { FuzzTarget } from "./types";
import { dnsTarget } from "./dns";
import { virtioTarget } from "./virtio";
import { networkTarget } from "./network";
import { tarTarget } from "./tar";
import { sshExecTarget } from "./ssh-exec";

export const targets: Record<string, FuzzTarget> = {
  [dnsTarget.name]: dnsTarget,
  [virtioTarget.name]: virtioTarget,
  [networkTarget.name]: networkTarget,
  [tarTarget.name]: tarTarget,
  [sshExecTarget.name]: sshExecTarget,
};
