// ── Utilities ─────────────────────────────────────────────────────────────────
export { retryWithBackoff } from './util/retry.js';
export type { RetryOptions } from './util/retry.js';

// ── Protocol: AG-UI events + SSE transport ───────────────────────────────────
export * from './protocol/events.js';
export * from './protocol/sse-channel.js';
export * from './protocol/run-agent-input.js';
export * from './protocol/platform-stream.js';
export { AgUiStateController } from './protocol/state-controller.js';

// ── AG-UI: tools + widgets ────────────────────────────────────────────────────
export { AgUiFrontendToolRegistry } from './ag-ui/tools/frontend-tool.js';
export type { AgUiFrontendTool, AgUiToolHandler } from './ag-ui/tools/frontend-tool.js';
export { MarkdownBody } from './ag-ui/components/MarkdownBody.js';
export type { MarkdownBodyProps } from './ag-ui/components/MarkdownBody.js';
export { ConnectionStatusBanner } from './ag-ui/components/ConnectionStatusBanner.js';
export type { ConnectionStatusBannerProps } from './ag-ui/components/ConnectionStatusBanner.js';

// ── AG-UI: agent subsystem ────────────────────────────────────────────────────
export * from './ag-ui/agent/agent-run-models.js';
export type { IAgentRunProvider } from './ag-ui/agent/i-agent-run-provider.js';
export { AgentRunController } from './ag-ui/agent/agent-run-controller.js';
export { AgUiContextRegistry } from './ag-ui/agent/context-registry.js';
export type { AgUiContextEntry } from './ag-ui/agent/context-registry.js';
export { AgUiActivityController } from './ag-ui/agent/activity-controller.js';
export { activityLabel, activityDescription, activityProgress } from './ag-ui/agent/activity-controller.js';
export type { AgUiActivity } from './ag-ui/agent/activity-controller.js';
export { AgUiGenerativeController } from './ag-ui/agent/generative-controller.js';
export type { AgUiGenerativeItem, AgUiTextItem, AgUiReasoningItem, AgUiComponentItem, AgUiHtmlItem, AgUiToolCallItem, AgUiToolCallStatus, AgUiHilGate } from './ag-ui/agent/generative-controller.js';
export { AgUiRunLifecycleController } from './ag-ui/agent/run-lifecycle-controller.js';
export type { AgUiRunState } from './ag-ui/agent/run-lifecycle-controller.js';
export { AgUiPlatformRunController } from './ag-ui/agent/platform-run-controller.js';
export type { AgUiPlatformRunStatus, AgUiRunMessage } from './ag-ui/agent/platform-run-controller.js';

// ── AG-UI: connectors ─────────────────────────────────────────────────────────
export { AgentivityPlatformConnector } from './ag-ui/connectors/agentivity-platform-connector.js';
export type { AgUiRunHandle, AgUiStartRunOptions, AgUiSendMessageOptions, AgUiRunThread, AgUiThreadMessage } from './ag-ui/connectors/agentivity-platform-connector.js';
export { AgUiGenericConnector } from './ag-ui/connectors/generic-connector.js';
export { AgentivityConnector } from './ag-ui/connectors/agentivity-connector.js';
export { LangGraphConnector } from './ag-ui/connectors/lang-graph-connector.js';
export { AgentivityRunStream } from './ag-ui/connectors/agentivity-run-stream.js';
export { isAgentivitySyncSignal, defaultAgentivitySignalDecoder, AGENTIVITY_SYNC_TOPICS } from './ag-ui/connectors/agentivity-signals.js';
export type { AgentivitySyncSignal, AgentivitySignalDecoder } from './ag-ui/connectors/agentivity-signals.js';

// ── AG-UI: agent run components ───────────────────────────────────────────────
export { RunStatusBadge } from './ag-ui/components/RunStatusBadge.js';
export { RunPanel } from './ag-ui/components/RunPanel.js';
export type { RunPanelProps } from './ag-ui/components/RunPanel.js';
export { ActivityView } from './ag-ui/components/ActivityView.js';
export type { ActivityViewProps } from './ag-ui/components/ActivityView.js';
export { GenerativeView } from './ag-ui/components/GenerativeView.js';
export type { GenerativeViewProps } from './ag-ui/components/GenerativeView.js';

// ── AG-UI: forms panel ────────────────────────────────────────────────────────
export * from './ag-ui/forms/form-models.js';
export type { IFormProvider } from './ag-ui/forms/i-form-provider.js';
export { FormController } from './ag-ui/forms/form-controller.js';
export { FormPanel } from './ag-ui/components/FormPanel.js';
export type { FormPanelProps } from './ag-ui/components/FormPanel.js';
export { useFormController } from './react/useFormController.js';
export type { UseFormControllerResult } from './react/useFormController.js';

// ── AG-UI: assistant panel ────────────────────────────────────────────────────
export * from './ag-ui/assistant/assistant-models.js';
export type { IAssistantProvider } from './ag-ui/assistant/i-assistant-provider.js';
export { AssistantController } from './ag-ui/assistant/assistant-controller.js';
export { AssistantPanel } from './ag-ui/components/AssistantPanel.js';
export type { AssistantPanelProps } from './ag-ui/components/AssistantPanel.js';

// ── Client: API errors + core HTTP ───────────────────────────────────────────
export * from './client/api-contract.js';
export { AgentivityHttpCore } from './client/http-core.js';
export type { RequestOptions } from './client/http-core.js';

// ── Client: domain models ────────────────────────────────────────────────────
export * from './client/domain/execution-models.js';
export * from './client/domain/entity-models.js';

// ── Client: API surfaces ─────────────────────────────────────────────────────
export { EntitiesApi } from './client/api/entities-api.js';
export { RunsApi } from './client/api/runs-api.js';
export { VoiceApi } from './client/api/voice-api.js';
export { UploadsApi } from './client/api/uploads-api.js';
export type { UploadedFile } from './client/api/uploads-api.js';
export { DataTablesApi } from './client/api/datatables-api.js';
export { parseDataTableRow } from './client/domain/datatable-models.js';
export type { DataTableRow } from './client/domain/datatable-models.js';

// ── Client: top-level facade ─────────────────────────────────────────────────
export { AgentivityClient } from './client/agentivity-client.js';
export { AgentivityPlatformClient } from './client/platform-client.js';
export { ConversationsApi } from './client/api/conversations-api.js';
export { AgenticFoldersApi } from './client/api/agentic-folders-api.js';
export * from './client/domain/chat-models.js';
export * from './client/domain/agent-models.js';
export * from './client/domain/team-folder-models.js';
export * from './client/domain/workflow-models.js';

// ── Client: extras (platform client) ─────────────────────────────────────────
export { ChatContextApi } from './client/extras/chat-context-api.js';
export { AgUiBundlesApi } from './client/extras/ag-ui-bundles-api.js';
export { SvgIconsApi } from './client/extras/svg-icons-api.js';
export * from './client/extras/ag-ui-bundle-models.js';

// ── Chat: state (AG-UI event-driven) ─────────────────────────────────────────
export * from './chat/chat-models.js';
export { ChatController } from './chat/chat-controller.js';
export type { ActiveChatMember, TeamMemberStatus, WorkflowStepStatus } from './chat/chat-controller.js';

// ── Chat: components ──────────────────────────────────────────────────────────
export { ChatDiscussion } from './chat/components/ChatDiscussion.js';
export type { ChatDiscussionProps } from './chat/components/ChatDiscussion.js';
export { ChatInput } from './chat/components/ChatInput.js';
export type { ChatInputProps } from './chat/components/ChatInput.js';
export { ChatMessageBubble } from './chat/components/ChatMessageBubble.js';
export type { ChatMessageBubbleProps } from './chat/components/ChatMessageBubble.js';
export { ChatActiveMemberIndicator } from './chat/components/ChatActiveMemberIndicator.js';
export type { ChatActiveMemberIndicatorProps } from './chat/components/ChatActiveMemberIndicator.js';
export { MemberAvatar, resolveMemberAvatar } from './chat/components/member-avatar.js';
export type { AgUiChatMember, AgUiMemberAvatar } from './chat/components/member-avatar.js';
export { TeamRoster } from './chat/components/TeamRoster.js';
export type { TeamRosterProps } from './chat/components/TeamRoster.js';
export { TeamGraph } from './chat/components/TeamGraph.js';
export type { TeamGraphProps } from './chat/components/TeamGraph.js';
export type { AgUiTeamMember } from './chat/components/team-member.js';
export { teamMembersFromStructure, teamHubMemberId, teamAvatarResolver, teamMemberShortName } from './chat/components/team-member.js';
export { TEAM_GROUP_PALETTE, teamGroupKey, teamGroupColors, groupColorOverrides, orderByGroup } from './chat/components/team-groups.js';
export { parseTeamStructure, teamManager } from './client/domain/team-definition-models.js';
export type { TeamStructure, TeamMemberPosition, TeamConnectionDefinition } from './client/domain/team-definition-models.js';
export { WorkflowGraph } from './chat/components/WorkflowGraph.js';
export type { WorkflowGraphProps } from './chat/components/WorkflowGraph.js';
export { parseWorkflowGraph } from './client/domain/workflow-graph-models.js';
export type { WorkflowGraphStructure, WorkflowGraphNode, WorkflowGraphEdge, WorkflowNodeKind } from './client/domain/workflow-graph-models.js';

// Icons: a reference (the backend's NodeIconDef shape), its renderer, and the catalog a picker reads.
export { MATERIAL_TYPE, materialIcon, parseIconRef } from './icons/icon-ref.js';
export type { IconRef } from './icons/icon-ref.js';
export { Icon, iconGlyph } from './icons/Icon.js';
export type { IconProps } from './icons/Icon.js';
export { parseIconInfo, iconRefOf } from './icons/icon-catalog-models.js';
export type { IconInfo } from './icons/icon-catalog-models.js';
export { IconsApi } from './client/api/icons-api.js';

// ── Artifacts: widget registry + bundle ──────────────────────────────────────
export type { AgUiComponentBuilder, AgUiWidgetRegistry } from './artifacts/widget-registry.js';
export { buildArtifactsRegistry } from './artifacts/registry.js';
export { buildArtifactsBundle } from './artifacts/bundle.js';

// ── Artifacts: theme ──────────────────────────────────────────────────────────
export * from './artifacts/theme.js';
export * from './artifacts/theme-presets.js';
export * from './artifacts/color-utils.js';

// ── Artifacts: shell ──────────────────────────────────────────────────────────
export { ArtifactCard } from './artifacts/components/ArtifactCard.js';
export type { ArtifactCardProps } from './artifacts/components/ArtifactCard.js';
export { ArtifactViewer } from './artifacts/components/ArtifactViewer.js';
export type { ArtifactViewerProps } from './artifacts/components/ArtifactViewer.js';

// ── Artifacts: charts ─────────────────────────────────────────────────────────
export { BarChart } from './artifacts/components/charts/BarChart.js';
export type { ChartProps } from './artifacts/components/charts/BarChart.js';
export { LineChart, AreaChart } from './artifacts/components/charts/LineChart.js';
export { PieChart } from './artifacts/components/charts/PieChart.js';
export { RadarChart } from './artifacts/components/charts/RadarChart.js';

// ── Artifacts: data ───────────────────────────────────────────────────────────
export { MetricCard } from './artifacts/components/data/MetricCard.js';
export { StatGrid } from './artifacts/components/data/StatGrid.js';
export { KeyValue } from './artifacts/components/data/KeyValue.js';

// ── Artifacts: code ───────────────────────────────────────────────────────────
export { CodeBlock } from './artifacts/components/code/CodeBlock.js';
export { JsonViewer } from './artifacts/components/code/JsonViewer.js';

// ── Artifacts: status ─────────────────────────────────────────────────────────
export { StatusCard } from './artifacts/components/status/StatusCard.js';
export { Timeline } from './artifacts/components/status/Timeline.js';

// ── Artifacts: math & SVG ─────────────────────────────────────────────────────
export { Latex } from './artifacts/components/math/Latex.js';
export { Svg } from './artifacts/components/svg/Svg.js';

// ── Artifacts: interaction ────────────────────────────────────────────────────
export { ChoiceCard } from './artifacts/components/interaction/ChoiceCard.js';
export { ConfirmCard } from './artifacts/components/interaction/ConfirmCard.js';
export { DatePickerCard } from './artifacts/components/interaction/DatePickerCard.js';
export { QuestionForm } from './artifacts/components/interaction/QuestionForm.js';
export { RatingCard } from './artifacts/components/interaction/RatingCard.js';
export { SummaryCard } from './artifacts/components/interaction/SummaryCard.js';
export { SourceInput } from './artifacts/components/interaction/SourceInput.js';

// ── Shared ────────────────────────────────────────────────────────────────────
export * from './shared/json-helpers.js';

// ── React ─────────────────────────────────────────────────────────────────────
export { AgentivityProvider, useAgentivityClient, useOptionalAgentivityClient } from './react/AgentivityProvider.js';
export type { AgentivityProviderProps } from './react/AgentivityProvider.js';
export { useRunStream } from './react/useRunStream.js';
export type { UseRunStreamResult } from './react/useRunStream.js';
export { useChatController } from './react/useChatController.js';
export type { UseChatControllerResult } from './react/useChatController.js';
export { useExecutionStatuses } from './react/useExecutionStatuses.js';
export type { UseExecutionStatusesOptions, ExecutionStepStatuses } from './react/useExecutionStatuses.js';
export { isExecutionLive, parseExecutionStatuses } from './client/domain/execution-status-models.js';
export type { ExecutionStepState, ExecutionStatuses } from './client/domain/execution-status-models.js';
export { ArtifactsThemeProvider, useArtifactsTheme } from './react/ArtifactsThemeProvider.js';
export type { ArtifactsThemeProviderProps } from './react/ArtifactsThemeProvider.js';
export { useAgUiState } from './react/useAgUiState.js';
