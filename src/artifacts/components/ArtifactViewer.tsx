import { buildArtifactsRegistry } from '../registry.js';

export interface ArtifactViewerProps {
  type: string;
  props: Record<string, unknown>;
}

/**
 * Auto-routing artifact viewer — port of `AgArtifactViewer`. Resolves `type`
 * to the correct widget and passes `props` to it.
 *
 * ```tsx
 * const registry: AgUiWidgetRegistry = {
 *   Artifact: (props) => <ArtifactViewer type={props.type as string} props={props} />,
 * };
 * ```
 */
export function ArtifactViewer({ type, props }: ArtifactViewerProps) {
  const builder = buildArtifactsRegistry()[type];
  if (builder) return <>{builder(props)}</>;
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 5,
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.3)',
        fontSize: 11,
        color: '#ef4444',
      }}
    >
      Unknown artifact type: {type}
    </div>
  );
}
