import type { ReactNode } from 'react';

/**
 * Builds a React node from a props map — the generative-UI equivalent of the
 * Flutter SDK's `AgUiComponentBuilder`.
 */
export type AgUiComponentBuilder = (props: Record<string, unknown>) => ReactNode;

/**
 * Maps component names to builders for generative UI. The agent "renders" a
 * component by calling a tool whose name matches a key here, or by emitting a
 * CUSTOM event — {@link ChatController} turns either into a `ChatMessage`
 * carrying `metadata.widgetType`/`widgetProps`, and `ChatMessageBubble`
 * resolves it through this registry.
 *
 * ```ts
 * const registry: AgUiWidgetRegistry = {
 *   WeatherCard: (props) => <WeatherCard city={props.city as string} />,
 *   ChoiceCard: (props) => <ChoiceCard {...props} />,
 * };
 * ```
 */
export type AgUiWidgetRegistry = Record<string, AgUiComponentBuilder>;
