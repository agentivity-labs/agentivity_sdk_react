import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BarChart } from '../src/artifacts/components/charts/BarChart.js';
import { PieChart } from '../src/artifacts/components/charts/PieChart.js';
import { MetricCard } from '../src/artifacts/components/data/MetricCard.js';
import { StatGrid } from '../src/artifacts/components/data/StatGrid.js';
import { StatusCard } from '../src/artifacts/components/status/StatusCard.js';
import { JsonViewer } from '../src/artifacts/components/code/JsonViewer.js';
import { ChoiceCard } from '../src/artifacts/components/interaction/ChoiceCard.js';
import { buildArtifactsRegistry } from '../src/artifacts/registry.js';
import { ArtifactViewer } from '../src/artifacts/components/ArtifactViewer.js';

describe('artifact widgets smoke test', () => {
  it('renders BarChart with title and labels', () => {
    render(<BarChart props={{ title: 'Revenue', labels: ['Q1', 'Q2'], datasets: [{ data: [10, 20] }] }} />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Q1')).toBeInTheDocument();
  });

  it('renders PieChart with a legend', () => {
    render(<PieChart props={{ title: 'Share', sections: [{ label: 'A', value: 60 }, { label: 'B', value: 40 }] }} />);
    expect(screen.getByText('Share')).toBeInTheDocument();
    expect(screen.getByText(/A · 60%/)).toBeInTheDocument();
  });

  it('renders MetricCard with value and trend', () => {
    render(<MetricCard props={{ title: 'ARR', value: '€1.2M', delta: '+18%', trend: 'up' }} />);
    expect(screen.getByText('€1.2M')).toBeInTheDocument();
    expect(screen.getByText('+18%')).toBeInTheDocument();
  });

  it('StatGrid renders one MetricCard per entry', () => {
    render(<StatGrid props={{ metrics: [{ title: 'A', value: '1' }, { title: 'B', value: '2' }] }} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders StatusCard for a success status', () => {
    render(<StatusCard props={{ title: 'Deploy', status: 'success', message: 'Done in 38s' }} />);
    expect(screen.getByText('Done in 38s')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('renders JsonViewer with expandable nodes', () => {
    render(<JsonViewer props={{ title: 'Response', data: { status: 'ok', count: 3 } }} />);
    expect(screen.getByText(/"status":/)).toBeInTheDocument();
  });

  it('ChoiceCard calls __onSubmit with the selected label', () => {
    const onSubmit = vi.fn();
    render(<ChoiceCard props={{ title: 'Pick', options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }], __onSubmit: onSubmit }} />);
    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.click(screen.getByText('Confirmer'));
    expect(onSubmit).toHaveBeenCalledWith('Choix : Alpha');
  });

  it('buildArtifactsRegistry contains all 22 built-in types', () => {
    const registry = buildArtifactsRegistry();
    expect(Object.keys(registry)).toHaveLength(22);
    expect(registry['BarChart']).toBeDefined();
    expect(registry['QuestionForm']).toBeDefined();
  });

  it('ArtifactViewer routes to the right widget by type', () => {
    render(<ArtifactViewer type="MetricCard" props={{ title: 'X', value: '42' }} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('ArtifactViewer shows a fallback for an unknown type', () => {
    render(<ArtifactViewer type="Nonexistent" props={{}} />);
    expect(screen.getByText(/Unknown artifact type: Nonexistent/)).toBeInTheDocument();
  });
});
