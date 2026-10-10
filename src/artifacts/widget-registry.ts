import type { ReactNode } from 'react';

/**
 * Builds a React node from a props map — the generative-UI equivalent of the
 * Flutter SDK's `AgUiComponentBuilder`.
 *
 * A builder left as a plain function is taken for a widget that asks the person
 * something (a choice, a form): it can be answered while its question is open,
 * then renders dimmed and inert. Wrap a widget that only shows something in
 * {@link displayWidget} so that it never does.
 */
export type AgUiComponentBuilder = ((props: Record<string, unknown>) => ReactNode) & {
  /** `false` marks a display-only widget. See {@link displayWidget}. */
  interactive?: boolean;
};

/**
 * Maps component names to builders for generative UI. The agent "renders" a
 * component by calling a tool whose name matches a key here, or by emitting a
 * CUSTOM event — {@link ChatController} turns either into a `ChatMessage`
 * carrying `metadata.widgetType`/`widgetProps`, and `ChatMessageBubble`
 * resolves it through this registry.
 *
 * ```ts
 * const registry: AgUiWidgetRegistry = {
 *   WeatherCard: displayWidget((props) => <WeatherCard city={props.city as string} />),
 *   ChoiceCard: (props) => <ChoiceCard {...props} />,
 * };
 * ```
 */
export type AgUiWidgetRegistry = Record<string, AgUiComponentBuilder>;

/**
 * Marks a widget as display-only: a chart, a report card, a cover image — anything
 * the person looks at (or follows a link from) rather than answers.
 *
 * A display widget stays fully visible and usable for the whole conversation. Without
 * this, the chat treats the widget as a question: once it is not the one being asked,
 * it is dimmed and its links and buttons stop responding, which is wrong for a result
 * the person came for.
 */
export function displayWidget(builder: (props: Record<string, unknown>) => ReactNode): AgUiComponentBuilder {
  return Object.assign((props: Record<string, unknown>) => builder(props), { interactive: false });
}

/** Whether a registry entry was declared display-only with {@link displayWidget}. */
export function isDisplayWidget(builder: AgUiComponentBuilder | undefined): boolean {
  return builder?.interactive === false;
}
