import {
  BashExecutionItem,
  ChatMessage,
  ChatMessageActions,
  ChatMessageMarkdown,
  Conversation,
  ConversationContent,
  CustomEventItem,
  EventNotice,
  LiveAssistantDraft,
  RawEntryFallback,
  Reasoning,
  Response,
  SessionEventPill,
  SessionTimeline,
  SessionTimelineGroup,
  SessionTurnDivider,
  ThinkingLevelBadge,
  ThinkingTimeline,
  Tool,
  ToolCallCard,
  ToolCallDetails,
  ToolCallStreamDelta,
  ToolDiffPreview,
  ToolResultRenderer,
} from "../components/session-ui";

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W9NsAAAAASUVORK5CYII=";

// Real snippets from pi-mono sessions
const s1User =
  "look at the coding agent, its rpc doc and the actual rcp commands / events. is the doc up to date with the code and vice versa ?";
const s1Assistant =
  "I'll read the RPC doc and find the actual RPC commands/events in the coding agent code.";
const s1Thinking =
  "Let me also check the event types and the RPC client:";
const s1ToolArgs = {
  path: "/Users/alioudiallo/code/src/github.com/aliou/pi-mono/packages/coding-agent/README.md",
};
const s1ToolResult =
  "Pi is a minimal terminal coding harness. Adapt pi to your workflows, not the other way around...";

const s2User =
  "Difficult would it be to add to the TUI package a way to render charts?";
const s2Assistant =
  "Let me look at another component that uses box-drawing to understand the patterns better:";
const s2Thinking =
  "Difficulty: moderate. The screenshot looks like a stepped line chart using Unicode box-drawing characters.";
const s2Bash = `find /Users/alioudiallo/code/src/github.com/aliou/pi-mono/packages/tui/src -type f -name "*.ts" | head -30\n\n/Users/alioudiallo/code/src/github.com/aliou/pi-mono/packages/tui/src/terminal-image.ts\n/Users/alioudiallo/code/src/github.com/aliou/pi-mono/packages/tui/src/autocomplete.ts\n/Users/alioudiallo/code/src/github.com/aliou/pi-mono/packages/tui/src/tui.ts\n...`;

const s3BashCommand =
  "cd /Users/alioudiallo/code/src/github.com/aliou/pi-mono && grep -n 'pasteToEditor|setEditorText|getEditorText|setEditorComponent|setToolsExpanded|getToolsExpanded|setWorkingMessage|setFooter|setHeader|setWidget|setTitle|setStatus|custom|notify|select|confirm|input|editor|theme|getAllThemes|getTheme|setTheme' packages/coding-agent/src/core/extensions/types.ts | head -60";
const s3BashOutput = `105:\tselect(title: string, options: string[], opts?: ExtensionUIDialogOptions): Promise<string | undefined>;
108:\tconfirm(title: string, message: string, opts?: ExtensionUIDialogOptions): Promise<boolean>;
111:\tinput(title: string, placeholder?: string, opts?: ExtensionUIDialogOptions): Promise<string | undefined>;
114:\tnotify(message: string, type?: "info" | "warning" | "error"): void;
166:\tpasteToEditor(text: string): void;
169:\tsetEditorText(text: string): void;
172:\tgetEditorText(): string;
210:\tsetEditorComponent(...)
227:\tgetToolsExpanded(): boolean;
230:\tsetToolsExpanded(expanded: boolean): void;`;

export default function UIShowcasePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-fg">UI Components Showcase</h1>
        <p className="mt-1 text-sm text-muted">
          Real example content from pi-mono sessions. Components still not wired to live UI.
        </p>
      </header>

      <SessionTimeline>
        <SessionTurnDivider label="Session example A · RPC docs vs code" />
        <SessionTimelineGroup title="Meta">
          <SessionEventPill label="Repo: ~/code/src/github.com/aliou/pi-mono" />
          <ThinkingLevelBadge level="medium" />
          <CustomEventItem title="ad:terminal-title" value="π: pi-mono (thinking...)" />
        </SessionTimelineGroup>

        <SessionTimelineGroup title="Conversation">
          <Conversation>
            <ChatMessage role="user">
              <p className="text-sm whitespace-pre-wrap">{s1User}</p>
            </ChatMessage>

            <ChatMessage role="assistant">
              <ConversationContent>
                <ThinkingTimeline blocks={[s1Thinking]} />

                <ToolCallCard name="read" status="success">
                  <ToolCallDetails
                    args={JSON.stringify(s1ToolArgs, null, 2)}
                    output={s1ToolResult}
                    path={s1ToolArgs.path}
                    toolName="read"
                  />
                </ToolCallCard>

                <ToolCallCard name="bash" status="running">
                  <ToolCallStreamDelta delta="Scanning src for rpc-related files..." />
                </ToolCallCard>

                <Response text={s1Assistant} />
                <ChatMessageActions />
              </ConversationContent>
            </ChatMessage>

            <LiveAssistantDraft text="Comparing docs in packages/coding-agent/docs/rpc.md against runtime event types..." />
          </Conversation>
        </SessionTimelineGroup>

        <SessionTurnDivider label="Session example B · TUI chart rendering" />
        <SessionTimelineGroup title="Conversation">
          <Conversation>
            <ChatMessage role="user">
              <p className="text-sm whitespace-pre-wrap">{s2User}</p>
            </ChatMessage>

            <ChatMessage role="assistant">
              <ConversationContent>
                <ThinkingTimeline blocks={[s2Thinking]} />

                <ToolCallCard name="read" status="success">
                  <ToolResultRenderer
                    blocks={[
                      { type: "text", text: "Read image file [image/png]" },
                      { type: "image", data: tinyPngBase64, mimeType: "image/png" },
                    ]}
                  />
                </ToolCallCard>

                <ToolCallCard name="bash" status="success">
                  <ToolCallDetails
                    args={JSON.stringify(
                      {
                        command:
                          'find /Users/alioudiallo/code/src/github.com/aliou/pi-mono/packages/tui/src -type f -name "*.ts" | head -30',
                      },
                      null,
                      2,
                    )}
                    output={s2Bash}
                    toolName="bash"
                  />
                </ToolCallCard>

                <Response text={s2Assistant} />
              </ConversationContent>
            </ChatMessage>
          </Conversation>
        </SessionTimelineGroup>

        <SessionTurnDivider label="Session example C · Extension UI API grep" />
        <SessionTimelineGroup title="bashExecution + raw event samples">
          <BashExecutionItem command={s3BashCommand} exitCode={0} output={s3BashOutput} />

          <ToolCallCard name="edit" status="success">
            <ToolDiffPreview
              diff={`- old docs line\n+ new docs line for rpc event names\n+ add tool_execution_update mention`}
            />
          </ToolCallCard>

          <RawEntryFallback
            entry={{
              type: "custom_message",
              customType: "ad-process:update",
              content: "Process 'grep-rpc-types' completed successfully",
              details: { processId: "proc_3", success: true, exitCode: 0 },
            }}
          />
        </SessionTimelineGroup>
      </SessionTimeline>

      <SessionTimelineGroup title="AI-elements-inspired wrappers">
        <Reasoning>
          <ChatMessageMarkdown text="I will verify docs and event unions, then report mismatches and proposed updates." />
        </Reasoning>
        <Tool>
          <p className="text-sm text-fg">Tool wrapper body</p>
        </Tool>
        <EventNotice>Replay finished. Live updates active.</EventNotice>
        <EventNotice variant="warn">Auto-retry in 5s after transient failure.</EventNotice>
      </SessionTimelineGroup>
    </div>
  );
}
