import type { ThemeName } from '../types';

export interface ReaderTheme {
  label: string;
  bg: string;
  text: string;
  muted: string;
  link: string;
  selection: string;
  ui: string;
  uiRaised: string;
  line: string;
}

export const READER_THEMES: Record<ThemeName, ReaderTheme> = {
  day: {
    label: '日间',
    bg: '#FCFAF5',
    text: '#23201B',
    muted: '#6E665C',
    link: '#9A4B2C',
    selection: 'rgba(154, 75, 44, 0.18)',
    ui: '#F6F2EA',
    uiRaised: '#FFFDF8',
    line: '#E4DDD1',
  },
  sepia: {
    label: '护眼',
    bg: '#F2E7D2',
    text: '#3A3025',
    muted: '#7C6C56',
    link: '#8A5424',
    selection: 'rgba(138, 84, 36, 0.2)',
    ui: '#EFE3CB',
    uiRaised: '#F8F0DF',
    line: '#DCCBAC',
  },
  night: {
    label: '夜间',
    bg: '#131312',
    text: '#C6C0B5',
    muted: '#807A71',
    link: '#C08A63',
    selection: 'rgba(192, 138, 99, 0.25)',
    ui: '#191917',
    uiRaised: '#212120',
    line: '#33322E',
  },
};

export const FONT_STACKS = {
  serif: '"Songti SC", "Noto Serif SC", "Source Han Serif SC", "SimSun", Georgia, serif',
  sans: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
};

export function applyTheme(theme: ThemeName) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', READER_THEMES[theme].ui);
}
