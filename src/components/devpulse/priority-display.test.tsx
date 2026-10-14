// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import projectsJson from '../../data/devpulse/projects.sample.json';
import snapshotsJson from '../../data/devpulse/snapshots.sample.json';
import {
  buildProjectViews,
  projectConfigSchema,
  snapshotFileSchema,
} from '../../lib/devpulse/index.ts';
import { ProjectDashboard } from './ProjectDashboard.tsx';
import { PRIORITIES_STORAGE_KEY } from './priorities.ts';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it('keeps priority selection, badge and ordering consistent after edits and reload', async () => {
  const projects = projectConfigSchema.parse(projectsJson).projects;
  projects[0].priority = 'highest';
  projects[1].priority = 'next';
  const views = buildProjectViews(
    projects,
    snapshotFileSchema.parse(snapshotsJson).snapshots,
    { now: new Date('2026-10-13T03:00:00Z') },
  );
  const user = userEvent.setup();
  const { unmount } = render(<ProjectDashboard views={views} />);
  const select = screen.getByRole('combobox', {
    name: 'DevPulseの着手優先度',
  });
  expect(
    within(select)
      .getByRole('option', { selected: true })
      .getAttribute('value'),
  ).toBe('highest');
  const card = select.closest('li');
  if (!card) throw new Error('Project card missing');
  expect(within(card).getByText('着手優先度: 最優先')).toBeTruthy();

  await user.selectOptions(select, 'unset');
  expect(within(card).getByText('着手優先度: 未設定')).toBeTruthy();
  expect(document.querySelector('.devpulse-cards > li')).not.toBe(card);
  expect(
    JSON.parse(localStorage.getItem(PRIORITIES_STORAGE_KEY) ?? '{}'),
  ).toEqual({
    devpulse: 'unset',
  });

  unmount();
  render(<ProjectDashboard views={views} />);
  const restored = screen.getByRole('combobox', {
    name: 'DevPulseの着手優先度',
  });
  expect(
    within(restored)
      .getByRole('option', { selected: true })
      .getAttribute('value'),
  ).toBe('unset');
  const restoredCard = restored.closest('li');
  if (!restoredCard) throw new Error('Restored project card missing');
  expect(within(restoredCard).getByText('着手優先度: 未設定')).toBeTruthy();
  expect(document.querySelector('.devpulse-cards > li')).not.toBe(
    restored.closest('li'),
  );
});
