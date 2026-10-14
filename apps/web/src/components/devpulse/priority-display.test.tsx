// @vitest-environment happy-dom

import {
  buildProjectViews,
  projectConfigSchema,
  snapshotFileSchema,
} from '@devpulse/domain';
import projectsJson from '@devpulse/domain/fixtures/projects.sample.json';
import snapshotsJson from '@devpulse/domain/fixtures/snapshots.sample.json';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ProjectDashboard } from './ProjectDashboard.tsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it('shows shared configured priorities and ignores legacy browser settings', () => {
  localStorage.setItem(
    'devpulse:priorities:v1',
    JSON.stringify({ devpulse: 'highest' }),
  );
  const projects = projectConfigSchema.parse(projectsJson).projects;
  projects[0].priority = 'later';
  projects[1].priority = 'highest';
  const views = buildProjectViews(
    projects,
    snapshotFileSchema.parse(snapshotsJson).snapshots,
    { now: new Date('2026-10-13T03:00:00Z') },
  );
  render(<ProjectDashboard views={views} />);
  expect(screen.queryByRole('combobox')).toBeNull();
  const first = screen
    .getByRole('link', { name: 'Sample Empty' })
    .closest('li');
  expect(document.querySelector('.devpulse-cards > li')).toBe(first);
  if (!first) throw new Error('Project card missing');
  expect(
    within(first).getByRole('link', { name: 'Sample Empty' }),
  ).toBeTruthy();
  expect(within(first).getByText('着手優先度: 最優先')).toBeTruthy();
  const devpulse = screen.getByRole('link', { name: 'DevPulse' }).closest('li');
  if (!devpulse) throw new Error('DevPulse card missing');
  expect(within(devpulse).getByText('着手優先度: 後回し')).toBeTruthy();
});
