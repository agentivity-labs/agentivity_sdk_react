import { displayWidget, type AgUiWidgetRegistry } from './widget-registry.js';
import { BarChart } from './components/charts/BarChart.js';
import { LineChart, AreaChart } from './components/charts/LineChart.js';
import { PieChart } from './components/charts/PieChart.js';
import { RadarChart } from './components/charts/RadarChart.js';
import { MetricCard } from './components/data/MetricCard.js';
import { StatGrid } from './components/data/StatGrid.js';
import { KeyValue } from './components/data/KeyValue.js';
import { CodeBlock } from './components/code/CodeBlock.js';
import { JsonViewer } from './components/code/JsonViewer.js';
import { StatusCard } from './components/status/StatusCard.js';
import { Timeline } from './components/status/Timeline.js';
import { Latex } from './components/math/Latex.js';
import { Svg } from './components/svg/Svg.js';
import { ChoiceCard } from './components/interaction/ChoiceCard.js';
import { ConfirmCard } from './components/interaction/ConfirmCard.js';
import { DatePickerCard } from './components/interaction/DatePickerCard.js';
import { QuestionForm } from './components/interaction/QuestionForm.js';
import { RatingCard } from './components/interaction/RatingCard.js';
import { SummaryCard } from './components/interaction/SummaryCard.js';
import { SourceInput } from './components/interaction/SourceInput.js';
import { ImageGallery } from './components/media/ImageGallery.js';

/**
 * Returns the built-in type → builder map — port of `buildArtifactsRegistry`.
 *
 * Use {@link buildArtifactsBundle} to get a ready-to-use {@link AgUiWidgetRegistry}
 * instead of wiring this map manually.
 */
export function buildArtifactsRegistry(): AgUiWidgetRegistry {
  return {
    // Charts
    BarChart: displayWidget((props) => <BarChart props={props} />),
    LineChart: displayWidget((props) => <LineChart props={props} />),
    PieChart: displayWidget((props) => <PieChart props={props} />),
    AreaChart: displayWidget((props) => <AreaChart props={props} />),
    RadarChart: displayWidget((props) => <RadarChart props={props} />),

    // Data
    MetricCard: displayWidget((props) => <MetricCard props={props} />),
    StatGrid: displayWidget((props) => <StatGrid props={props} />),
    KeyValue: displayWidget((props) => <KeyValue props={props} />),

    // Code
    CodeBlock: displayWidget((props) => <CodeBlock props={props} />),
    JsonViewer: displayWidget((props) => <JsonViewer props={props} />),

    // Status
    StatusCard: displayWidget((props) => <StatusCard props={props} />),
    Timeline: displayWidget((props) => <Timeline props={props} />),

    // Math
    Latex: displayWidget((props) => <Latex props={props} />),

    // SVG
    Svg: displayWidget((props) => <Svg props={props} />),

    // Media
    ImageGallery: displayWidget((props) => <ImageGallery props={props} />),

    // Interaction
    QuestionForm: (props) => <QuestionForm props={props} />,
    ChoiceCard: (props) => <ChoiceCard props={props} />,
    ConfirmCard: (props) => <ConfirmCard props={props} />,
    RatingCard: (props) => <RatingCard props={props} />,
    DatePickerCard: (props) => <DatePickerCard props={props} />,
    SourceInput: (props) => <SourceInput props={props} />,
    // Recaps what was collected and asks nothing itself.
    SummaryCard: displayWidget((props) => <SummaryCard props={props} />),
  };
}
