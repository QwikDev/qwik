export interface ShowcaseMetric {
  label: string;
  value: string;
  detail: string;
}

export interface FeatureCard {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  accent: 'cyan' | 'lime' | 'amber' | 'violet';
}

export interface ExperimentPreset {
  id: string;
  label: string;
  latencyMs: number;
  intensity: 'soft' | 'balanced' | 'surge';
  layout: 'grid' | 'stack';
  tone: string;
  description: string;
}

export interface LabEvent {
  id: string;
  label: string;
  detail: string;
  time: string;
  tone: 'info' | 'success' | 'warning';
}

export interface BlogEntrySection {
  heading: string;
  paragraphs: string[];
  quote?: string;
  code?: string;
}

export interface BlogEntry {
  slug: string;
  title: string;
  summary: string;
  excerpt: string;
  readTime: string;
  status: 'Fresh' | 'Stable' | 'Field Note';
  publishedAt: string;
  tags: string[];
  category: string;
  heroMetric: string;
  sections: BlogEntrySection[];
}
