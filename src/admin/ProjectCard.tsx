import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type {
  GitHubProjectSnapshot,
  Lifecycle,
  ProjectDefinition,
  Tier,
} from '../lib/devpulse/types.ts';
import { PRIORITY_LABELS, type Priority } from '../lib/devpulse/types.ts';
import { cn } from '../lib/utils.ts';
import { formatTime, LIFECYCLES, TIER_LABEL, TIERS } from './model.ts';

export interface CardIssue {
  field: string;
  message: string;
}

interface Props {
  project: ProjectDefinition;
  snapshot: GitHubProjectSnapshot | null;
  issues: CardIssue[];
  isNew: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  dropTarget: boolean;
  onChange: (patch: Partial<ProjectDefinition>) => void;
  onChangeTier: (tier: Tier) => void;
  onChangeSlug: (slug: string) => void;
  onClearMilestone: () => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  dnd: {
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
}

function Field({
  label,
  htmlFor,
  errors,
  children,
}: {
  label: string;
  htmlFor?: string;
  errors?: CardIssue[];
  children: ReactNode;
}) {
  const invalid = Boolean(errors?.length);
  return (
    <div className="grid gap-1.5" data-invalid={invalid || undefined}>
      <Label htmlFor={htmlFor} className="text-muted-foreground">
        {label}
      </Label>
      {children}
      {invalid ? (
        <p role="alert" className="text-sm text-destructive">
          {errors?.map((e) => e.message).join(' / ')}
        </p>
      ) : null}
    </div>
  );
}

export function ProjectCard(props: Props) {
  const { project: p, snapshot, issues, isNew } = props;
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const forField = (...fields: string[]) =>
    issues.filter((e) => fields.includes(e.field));
  const milestones = snapshot?.milestones ?? [];
  const knownMilestone = milestones.some(
    (m) => m.number === p.featuredMilestoneNumber,
  );

  return (
    <li draggable data-id={p.id} {...props.dnd} className="list-none">
      <Card
        className={cn(
          'gap-4 py-4 transition-colors',
          !p.published && 'border-dashed bg-muted/40',
          issues.length > 0 && 'border-destructive',
          props.dropTarget && 'ring-2 ring-ring',
        )}
      >
        <div className="flex flex-wrap items-center gap-3 px-4">
          <GripVertical
            aria-hidden="true"
            className="size-4 shrink-0 cursor-grab text-muted-foreground"
          />
          <div className="flex min-w-48 flex-1 flex-col">
            <strong className="leading-tight font-semibold">{p.name}</strong>
            <span className="text-sm text-muted-foreground">
              {p.repository}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={p.published ? 'default' : 'secondary'}>
              {p.published ? '公開' : '非公開'}
            </Badge>
            <Badge variant="outline">{p.lifecycle}</Badge>
            <Badge variant="outline">
              同期: {formatTime(snapshot?.fetchedAt)}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                !snapshot &&
                  'border-amber-500/60 text-amber-700 dark:text-amber-400',
              )}
            >
              {snapshot ? 'GitHub: public' : 'GitHub: 未確認'}
            </Badge>
            {isNew ? <Badge>新規</Badge> : null}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`${p.name} を上へ`}
              disabled={!props.canMoveUp}
              onClick={() => props.onMove(-1)}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`${p.name} を下へ`}
              disabled={!props.canMoveDown}
              onClick={() => props.onMove(1)}
            >
              <ArrowDown />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 px-4">
          <div className="flex h-9 items-center gap-2">
            <Checkbox
              id={id('published')}
              checked={p.published}
              onCheckedChange={(v) => props.onChange({ published: v === true })}
            />
            <Label htmlFor={id('published')}>公開する</Label>
          </div>
          <Field label="Tier" htmlFor={id('tier')} errors={forField('tier')}>
            <NativeSelect
              id={id('tier')}
              value={p.tier}
              onChange={(e) => props.onChangeTier(e.target.value as Tier)}
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="着手優先度"
            htmlFor={id('priority')}
            errors={forField('priority')}
          >
            <NativeSelect
              id={id('priority')}
              value={p.priority ?? 'unset'}
              onChange={(e) =>
                props.onChange({ priority: e.target.value as Priority })
              }
            >
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="lifecycle"
            htmlFor={id('lifecycle')}
            errors={forField('lifecycle')}
          >
            <NativeSelect
              id={id('lifecycle')}
              value={p.lifecycle}
              onChange={(e) =>
                props.onChange({ lifecycle: e.target.value as Lifecycle })
              }
            >
              {LIFECYCLES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <details open={issues.length > 0 || undefined} className="group px-4">
          <summary className="w-fit cursor-pointer rounded-sm text-sm font-medium outline-none select-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50">
            詳細を編集
          </summary>
          <div className="mt-4 grid gap-4">
            <Field label="名前" htmlFor={id('name')} errors={forField('name')}>
              <Input
                id={id('name')}
                value={p.name}
                onChange={(e) => props.onChange({ name: e.target.value })}
              />
            </Field>
            <Field
              label="説明"
              htmlFor={id('description')}
              errors={forField('description')}
            >
              <Textarea
                id={id('description')}
                rows={2}
                value={p.description}
                onChange={(e) =>
                  props.onChange({ description: e.target.value })
                }
              />
            </Field>
            <Field
              label="代表 Milestone"
              htmlFor={id('milestone')}
              errors={forField('featuredMilestoneNumber')}
            >
              <NativeSelect
                id={id('milestone')}
                value={p.featuredMilestoneNumber?.toString() ?? ''}
                onChange={(e) =>
                  e.target.value === ''
                    ? props.onClearMilestone()
                    : props.onChange({
                        featuredMilestoneNumber: Number(e.target.value),
                      })
                }
              >
                <option value="">(自動選択)</option>
                {milestones.map((m) => (
                  <option key={m.number} value={m.number}>
                    #{m.number} {m.title} ({m.state})
                  </option>
                ))}
                {p.featuredMilestoneNumber !== undefined && !knownMilestone ? (
                  <option value={p.featuredMilestoneNumber}>
                    #{p.featuredMilestoneNumber} (スナップショットに無し)
                  </option>
                ) : null}
              </NativeSelect>
            </Field>
            <Field
              label="slug (作成後は変更不可)"
              htmlFor={id('slug')}
              errors={forField('slug', 'id', 'repository')}
            >
              {isNew ? (
                <Input
                  id={id('slug')}
                  value={p.slug}
                  onChange={(e) => props.onChangeSlug(e.target.value)}
                />
              ) : (
                <code id={id('slug')} className="text-sm">
                  {p.slug}
                </code>
              )}
            </Field>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={props.onRemove}
              >
                <Trash2 />
                登録から削除…
              </Button>
            </div>
          </div>
        </details>

        {issues.length > 0 ? (
          <p className="flex items-center gap-1.5 px-4 text-sm text-destructive">
            <TriangleAlert className="size-4" />
            検証エラーが {issues.length} 件あります
          </p>
        ) : null}
      </Card>
    </li>
  );
}
