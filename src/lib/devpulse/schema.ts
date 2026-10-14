import { z } from 'zod';
import { repositoryKey } from './repository-key.ts';
import { LIFECYCLES } from './types.ts';

const repositorySchema = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/, 'repository must be "owner/repo"');

export const projectDefinitionSchema = z.strictObject({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  description: z.string(),
  repository: repositorySchema,
  published: z.boolean(),
  lifecycle: z.enum(LIFECYCLES),
  priority: z.enum(['highest', 'next', 'later', 'unset']).optional(),
  featuredMilestoneNumber: z.number().int().positive().optional(),
});

export const projectConfigSchema = z
  .strictObject({
    projects: z.array(projectDefinitionSchema),
  })
  .superRefine(({ projects }, ctx) => {
    for (const key of ['id', 'slug', 'repository'] as const) {
      const seen = new Set<string>();
      projects.forEach((project, index) => {
        const value = project[key];
        const normalized = key === 'repository' ? repositoryKey(value) : value;
        if (seen.has(normalized)) {
          ctx.addIssue({
            code: 'custom',
            path: ['projects', index, key],
            message: `duplicate ${key}: ${value}`,
          });
        }
        seen.add(normalized);
      });
    }
  });

const count = z.number().int().nonnegative();
const dateTime = z.string().datetime({ offset: true });

export const milestoneSnapshotSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  openIssues: count,
  closedIssues: count,
  dueOn: dateTime.nullable(),
  htmlUrl: z.string().url(),
});

export const issueClosureSchema = z.object({
  number: z.number().int().positive(),
  closedAt: dateTime,
  isPullRequest: z.boolean(),
});

export const projectSnapshotSchema = z.object({
  repository: repositorySchema,
  visibility: z.enum(['public', 'private']),
  milestones: z.array(milestoneSnapshotSchema),
  lastActivityAt: dateTime.nullable(),
  issueClosures: z.array(issueClosureSchema),
  fetchedAt: dateTime,
});

export const snapshotFileSchema = z.object({
  snapshots: z.array(projectSnapshotSchema),
});

/** GitHub REST API `GET /repos/{owner}/{repo}/milestones` の 1 件 */
export const rawMilestoneSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable().optional(),
  state: z.enum(['open', 'closed']),
  open_issues: count,
  closed_issues: count,
  due_on: dateTime.nullable().optional(),
  html_url: z.string().url(),
});

export const rawMilestonesSchema = z.array(rawMilestoneSchema);

/** GitHub REST API `GET /repos/{owner}/{repo}/issues?state=closed` の 1 件(PR を含み得る) */
export const rawIssueSchema = z.object({
  number: z.number().int().positive(),
  closed_at: dateTime.nullable().optional(),
  pull_request: z.unknown().optional(),
});

export const rawIssuesSchema = z.array(rawIssueSchema);
