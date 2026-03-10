import { PaperclipIcon, XIcon } from "@phosphor-icons/react";

export interface ComposerAttachment {
  id: string;
  file: File;
  uploadStatus: "pending" | "uploaded" | "failed";
  sandboxPath?: string;
  error?: string;
}

interface AttachmentsPickerProps {
  attachments: ComposerAttachment[];
  onPick: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

export function AttachmentsPicker({
  attachments,
  onPick,
  onRemove,
  disabled,
}: AttachmentsPickerProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-fg">
        <PaperclipIcon className="size-3.5" />
        Attach
        <input
          type="file"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            onPick(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </label>

      {attachments.length > 0 && (
        <div className="flex max-w-[320px] items-center gap-1 overflow-x-auto">
          {attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted"
            >
              {attachment.file.name}
              <button
                type="button"
                onClick={() => onRemove(attachment.id)}
                className="text-muted hover:text-fg"
                aria-label={`Remove ${attachment.file.name}`}
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
