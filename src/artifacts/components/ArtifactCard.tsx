import { useState, type ReactNode } from 'react';
import { useArtifactsTheme } from '../../react/ArtifactsThemeProvider.js';
import { effectiveCardPadding, effectiveHeaderFontSize, effectiveLabelFontSize } from '../theme.js';
import { isDarkColor } from '../color-utils.js';

export interface ArtifactCardProps {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  /** Optional type badge shown next to the title (e.g. "Bar Chart"). */
  type?: string;
  /** When set, a copy button copies this string to the clipboard. */
  copyValue?: string;
  actions?: ReactNode;
  /** Per-card padding override (CSS shorthand). Defaults to the theme's `cardPadding`. */
  padding?: string;
  className?: string;
}

/**
 * Shared card shell for all artifact widgets — port of `AgArtifactCard`. All
 * visual properties (radius, background, border, shadow, typography) are
 * driven by {@link ArtifactsThemeData} via {@link useArtifactsTheme}.
 */
export function ArtifactCard({ title, children, icon, type, copyValue, actions, padding, className }: ArtifactCardProps) {
  const theme = useArtifactsTheme();
  const bg = theme.cardBackground ?? 'var(--ag-surface, #ffffff)';
  const borderColor = theme.cardBorderColor ?? 'var(--ag-outline-variant, #e2e8f0)';
  const badgeBg = theme.badgeBackground ?? 'var(--ag-primary-container, #dbeafe)';
  const badgeFg = theme.badgeForeground ?? 'var(--ag-primary, #2563eb)';
  const onBg = theme.cardBackground && isDarkColor(theme.cardBackground) ? '#ffffff' : '#000000';

  return (
    <div
      className={className}
      style={{
        background: bg,
        border: `${theme.cardBorderWidth}px solid ${borderColor}`,
        borderRadius: theme.cardRadius,
        boxShadow: theme.cardShadow,
        boxSizing: 'border-box',
        maxWidth: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 6, minWidth: 0 }}>
        {icon}
        <span
          style={{
            fontSize: effectiveHeaderFontSize(theme),
            fontWeight: 600,
            color: onBg,
            opacity: 0.85,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {type && (
          <span
            style={{
              fontSize: effectiveLabelFontSize(theme),
              fontWeight: 500,
              color: badgeFg,
              background: badgeBg,
              borderRadius: 3,
              padding: '2px 6px',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {type}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {actions}
        {copyValue != null && <CopyButton value={copyValue} onBg={onBg} accent={badgeFg} />}
      </div>
      <div style={{ height: 1, background: borderColor }} />
      <div style={{ padding: padding ?? effectiveCardPadding(theme) }}>{children}</div>
    </div>
  );
}

function CopyButton({ value, onBg, accent }: { value: string; onBg: string; accent: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied — silently ignore, matching the Flutter SDK's
      // fire-and-forget Clipboard.setData behavior.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={copied ? 'Copied' : 'Copy'}
      style={{ border: 'none', background: 'none', cursor: 'pointer', color: copied ? accent : onBg, opacity: copied ? 1 : 0.4, fontSize: 13, lineHeight: 1 }}
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}
