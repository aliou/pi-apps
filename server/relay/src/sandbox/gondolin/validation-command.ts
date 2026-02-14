export function buildValidationInstallCommand(source: string): string[] {
  return ["/bin/sh", "-lc", 'pi install "$1"', "--", source];
}
