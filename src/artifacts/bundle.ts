import type { AgUiWidgetRegistry } from './widget-registry.js';
import { buildArtifactsRegistry } from './registry.js';

/**
 * One-line integration between the artifact widgets and the AG-UI widget
 * registry — port of `AgArtifactsBundle`.
 *
 * ```tsx
 * <ChatDiscussion controller={controller} onSend={...} widgetRegistry={buildArtifactsBundle()} />
 * ```
 *
 * ### Adding custom components
 *
 * ```ts
 * const registry = buildArtifactsBundle({
 *   OrderCard: (props) => <OrderCard orderId={props.id as string} />,
 * });
 * ```
 *
 * Custom entries in `extra` **override** built-in entries when keys collide,
 * so you can replace any default widget with your own implementation.
 */
export function buildArtifactsBundle(extra: AgUiWidgetRegistry = {}): AgUiWidgetRegistry {
  return { ...buildArtifactsRegistry(), ...extra };
}
