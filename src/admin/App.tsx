import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  History,
  Plus,
  RefreshCw,
  Save,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import type {
  GitHubProjectSnapshot,
  ProjectDefinition,
} from '../lib/devpulse/types.ts';
import { cn } from '../lib/utils.ts';
import { api, sendJson } from './api.ts';
import {
  type Candidate,
  diffLines,
  dropBefore,
  type FieldIssue,
  formatTime,
  type HistoryEntry,
  moveToTier,
  moveWithinTier,
  newProjectFrom,
  projectKey,
  type Snapshots,
  splitIssues,
  TIER_LABEL,
  TIERS,
} from './model.ts';
import { type CardIssue, ProjectCard } from './ProjectCard.tsx';

interface Saved {
  revision: number;
  updatedAt: string;
  updatedBy: string;
  projects: ProjectDefinition[];
}

interface ErrorBody {
  errors?: FieldIssue[];
  revision?: number;
}

type Banner = { kind: 'ok' | 'warn' | 'error'; text: string };

interface Restoring {
  revision: number;
  errors: FieldIssue[];
  lines: string[];
}

const REFLECT_NOTE =
  'API・同期・Home には即時反映されます。サイドバーと詳細ページは次回ビルドで反映されます。';

const BANNER_STYLE = {
  ok: { icon: CircleCheck, className: 'border-emerald-500/50' },
  warn: { icon: TriangleAlert, className: 'border-amber-500/60' },
  error: { icon: CircleAlert, className: 'border-destructive' },
} as const;

export function App() {
  const [revision, setRevision] = useState(0);
  const [updatedAt, setUpdatedAt] = useState('');
  const [updatedBy, setUpdatedBy] = useState('');
  const [original, setOriginal] = useState<ProjectDefinition[]>([]);
  const [projects, setProjects] = useState<ProjectDefinition[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshots>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLimit, setHistoryLimit] = useState(0);
  const [errors, setErrors] = useState<Record<string, CardIssue[]>>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const [conflict, setConflict] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [restoring, setRestoring] = useState<Restoring | null>(null);
  const [candidate, setCandidate] = useState('');
  const [dropKey, setDropKey] = useState<string | null>(null);
  const dragging = useRef<ProjectDefinition | null>(null);

  const diff = useMemo(
    () => diffLines(original, projects),
    [original, projects],
  );
  const dirty = diff.length > 0;

  const applySaved = useCallback((saved: Saved) => {
    setRevision(saved.revision);
    setUpdatedAt(saved.updatedAt);
    setUpdatedBy(saved.updatedBy);
    setOriginal(saved.projects);
    setProjects(saved.projects);
    setErrors({});
  }, []);

  const loadHistory = useCallback(async (): Promise<string | null> => {
    const res = await api<{ entries: HistoryEntry[]; limit: number }>(
      '/api/admin/history',
    );
    setHistory(res.ok && res.body ? res.body.entries : []);
    setHistoryLimit(res.ok && res.body ? res.body.limit : 0);
    return res.ok
      ? null
      : `変更履歴を取得できませんでした (HTTP ${res.status})。`;
  }, []);

  const load = useCallback(async () => {
    const cfg = await api<Saved>('/api/admin/config');
    if (!cfg.ok || !cfg.body) {
      setBanner({
        kind: 'error',
        text: `設定を読み込めませんでした (HTTP ${cfg.status})。`,
      });
      return;
    }
    applySaved(cfg.body);
    setConflict(false);
    const snaps = await api<{ snapshots: GitHubProjectSnapshot[] }>(
      '/api/snapshots',
    );
    setSnapshots(
      Object.fromEntries(
        (snaps.ok ? (snaps.body?.snapshots ?? []) : []).map((s) => [
          s.repository.toLowerCase(),
          s,
        ]),
      ),
    );
    const cand = await api<{ candidates: Candidate[] }>(
      '/api/admin/candidates',
    );
    setCandidates(cand.ok && cand.body ? cand.body.candidates : []);
    const historyError = await loadHistory();
    const notes = [
      cand.ok
        ? null
        : '追加候補を取得できませんでした (GitHub API の応答エラー)。',
      historyError,
    ].filter(Boolean);
    setBanner(notes.length ? { kind: 'warn', text: notes.join(' ') } : null);
  }, [loadHistory, applySaved]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (
    target: ProjectDefinition,
    patch: Partial<ProjectDefinition>,
  ) =>
    setProjects((all) =>
      all.map((p) => (p === target ? { ...p, ...patch } : p)),
    );

  const remove = (target: ProjectDefinition) => {
    const name = `${target.name} (${target.repository})`;
    if (
      !window.confirm(
        `${name} を登録から削除します。\n公開停止 (published: false) とは異なり、元に戻すには再度追加が必要です。\n(保存するまで確定しません)\n\n削除しますか?`,
      )
    )
      return;
    setProjects((all) => all.filter((p) => p !== target));
  };

  const reload = () => {
    if (dirty && !window.confirm('未保存の変更を破棄して再読み込みしますか?'))
      return;
    setBanner(null);
    void load();
  };

  const saveFailed = (status: number, body: ErrorBody | null) => {
    if (status === 409) {
      setConflict(true);
      setBanner({
        kind: 'error',
        text: `別の場所で設定が更新されました (最新 revision ${body?.revision})。再読み込みして変更をやり直してください。この画面の未保存の変更は反映されていません。`,
      });
    } else {
      setBanner({
        kind: 'error',
        text: `保存に失敗しました (HTTP ${status})。`,
      });
    }
  };

  const withHistoryNote = async (banner: Banner) => {
    const note = await loadHistory();
    // 保存・復元の成功表示は、履歴取得の失敗で消さない。
    setBanner(note ? { ...banner, text: `${banner.text} ${note}` } : banner);
  };

  const save = async () => {
    setDiffOpen(false);
    const res = await api<Saved & ErrorBody>(
      '/api/admin/config',
      sendJson('PUT', { revision, projects }),
    );
    if (res.ok && res.body) {
      applySaved(res.body);
      await withHistoryNote({
        kind: 'ok',
        text: `保存しました (revision ${res.body.revision})。${REFLECT_NOTE}`,
      });
    } else if (res.status === 422 && res.body?.errors) {
      const { byProject, general } = splitIssues(res.body.errors, projects);
      setErrors(byProject);
      setBanner({
        kind: 'error',
        text: `検証エラーがあります。該当する項目に表示しています。${general.join(' / ')}`,
      });
    } else saveFailed(res.status, res.body);
  };

  const openRestore = async (target: number) => {
    if (
      dirty &&
      !window.confirm(
        '未保存の変更があります。復元するとこの画面の変更は破棄されます。続けますか?',
      )
    )
      return;
    const res = await api<{
      revision: number;
      projects: ProjectDefinition[];
      errors?: FieldIssue[];
    }>(`/api/admin/history/${target}`);
    if (!res.ok || !res.body) {
      setBanner({
        kind: 'error',
        text:
          res.status === 404
            ? `revision ${target} は履歴に残っていません。再読み込みしてください。`
            : `履歴を取得できませんでした (HTTP ${res.status})。`,
      });
      return;
    }
    const issues = res.body.errors ?? [];
    setRestoring({
      revision: target,
      errors: issues,
      lines: issues.length ? [] : diffLines(original, res.body.projects),
    });
  };

  const restore = async () => {
    const entry = restoring;
    setRestoring(null);
    if (!entry) return;
    const res = await api<Saved & ErrorBody>(
      `/api/admin/history/${entry.revision}/restore`,
      sendJson('POST', { revision }),
    );
    if (res.ok && res.body) {
      applySaved(res.body);
      await withHistoryNote({
        kind: 'ok',
        text: `revision ${entry.revision} の内容を revision ${res.body.revision} として復元しました。${REFLECT_NOTE}`,
      });
    } else if (res.status === 422 && res.body?.errors) {
      setBanner({
        kind: 'error',
        text: `復元できませんでした: ${res.body.errors.map((e) => `${e.path}: ${e.message}`).join(' / ')}`,
      });
    } else if (res.status === 404) {
      setBanner({
        kind: 'error',
        text: `revision ${entry.revision} は履歴に残っていません。再読み込みしてください。`,
      });
    } else saveFailed(res.status, res.body);
  };

  const registered = new Set(projects.map(projectKey));
  const available = candidates.filter(
    (c) => !registered.has(c.repository.toLowerCase()),
  );
  const chosen = available.find((c) => c.repository === candidate);
  const addCandidate = () => {
    if (!chosen) return;
    setProjects((all) => [...all, newProjectFrom(chosen, all)]);
    setCandidate('');
  };

  const BannerIcon = banner ? BANNER_STYLE[banner.kind].icon : null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight">
              DevPulse 管理
            </h1>
            <p className="text-sm text-muted-foreground">
              revision {revision}
              {updatedAt
                ? ` / 最終更新 ${formatTime(updatedAt)} by ${updatedBy}`
                : ''}
            </p>
          </div>
          <Button variant="outline" size="sm" render={<a href="/" />}>
            <ArrowLeft />
            サイトへ戻る
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 pt-6 pb-24">
        <Alert>
          <AlertDescription>
            <p>
              <strong className="text-foreground">即時反映:</strong>{' '}
              API・同期・Home ダッシュボード(保存後、KV の反映遅延を除きすぐ)
            </p>
            <p>
              <strong className="text-foreground">次回ビルドで反映:</strong>{' '}
              サイドバー・プロジェクト詳細ページ(毎時の公開ビルド)
            </p>
          </AlertDescription>
        </Alert>

        {banner && BannerIcon ? (
          <Alert
            role="status"
            className={cn(BANNER_STYLE[banner.kind].className)}
          >
            <BannerIcon />
            <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
              <span>{banner.text}</span>
              {conflict ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={reload}
                >
                  再読み込み
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur">
          <Button
            type="button"
            disabled={!dirty || conflict}
            onClick={() => setDiffOpen(true)}
          >
            <Save />
            変更を保存…
          </Button>
          <Button type="button" variant="outline" onClick={reload}>
            <RefreshCw />
            再読み込み
          </Button>
          <span aria-live="polite" className="text-sm text-muted-foreground">
            {dirty ? '未保存の変更があります' : '変更はありません'}
          </span>
        </div>

        {TIERS.map((tier) => {
          const items = projects.filter((p) => p.tier === tier);
          return (
            <Card key={tier} className="gap-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Tier: {TIER_LABEL[tier]}
                  <Badge variant="secondary">{items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {items.length ? (
                  <ul
                    aria-label={`${TIER_LABEL[tier]} のプロジェクト`}
                    className="m-0 grid gap-3 p-0"
                  >
                    {items.map((p, at) => {
                      const key = projectKey(p);
                      return (
                        <ProjectCard
                          key={key}
                          project={p}
                          snapshot={snapshots[key] ?? null}
                          issues={errors[key] ?? []}
                          isNew={!original.some((o) => o.id === p.id)}
                          canMoveUp={at > 0}
                          canMoveDown={at < items.length - 1}
                          dropTarget={dropKey === key}
                          onChange={(patch) => update(p, patch)}
                          onChangeTier={(t) =>
                            setProjects((all) => moveToTier(all, p, t))
                          }
                          onChangeSlug={(slug) => update(p, { slug, id: slug })}
                          onClearMilestone={() =>
                            setProjects((all) =>
                              all.map((x) => {
                                if (x !== p) return x;
                                const { featuredMilestoneNumber, ...rest } = x;
                                void featuredMilestoneNumber;
                                return rest;
                              }),
                            )
                          }
                          onMove={(delta) =>
                            setProjects((all) => moveWithinTier(all, p, delta))
                          }
                          onRemove={() => remove(p)}
                          dnd={{
                            onDragStart: (e) => {
                              e.dataTransfer.setData('text/plain', p.id);
                              e.dataTransfer.effectAllowed = 'move';
                              dragging.current = p;
                            },
                            onDragOver: (e) => {
                              if (dragging.current?.tier === p.tier) {
                                e.preventDefault();
                                setDropKey(key);
                              }
                            },
                            onDragLeave: () => setDropKey(null),
                            onDrop: (e) => {
                              e.preventDefault();
                              const from = dragging.current;
                              dragging.current = null;
                              setDropKey(null);
                              if (from)
                                setProjects((all) => dropBefore(all, from, p));
                            },
                            onDragEnd: () => {
                              dragging.current = null;
                              setDropKey(null);
                            },
                          }}
                        />
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    このTierにプロジェクトはありません。
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">リポジトリを追加</CardTitle>
            <CardDescription>
              追加したリポジトリは非公開・Tier 低で登録されます。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label
                htmlFor="candidate-select"
                className="text-muted-foreground"
              >
                追加候補 (public リポジトリ)
              </Label>
              <NativeSelect
                id="candidate-select"
                className="min-w-72"
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
              >
                <option value="">
                  {available.length
                    ? '追加するリポジトリを選択'
                    : '追加できる候補がありません'}
                </option>
                {available.map((c) => (
                  <option key={c.repository} value={c.repository}>
                    {c.repository}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button type="button" disabled={!chosen} onClick={addCandidate}>
              <Plus />
              追加 (非公開・Tier 低で登録)
            </Button>
          </CardContent>
        </Card>

        <Card aria-labelledby="history-title">
          <CardHeader>
            <CardTitle
              id="history-title"
              className="flex items-center gap-2 text-base"
            >
              <History className="size-4" />
              変更履歴
            </CardTitle>
            <CardDescription>
              {historyLimit
                ? `現在の revision ${revision} の前の最大 ${historyLimit} 件を保持しています。`
                : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.length ? (
              <ol className="m-0 grid list-none p-0">
                {history.map((h, i) => (
                  <li key={h.revision}>
                    {i > 0 ? <Separator className="my-2" /> : null}
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex-1 text-sm">
                        revision {h.revision} / {formatTime(h.updatedAt)} by{' '}
                        {h.updatedBy} / {h.projectCount} 件
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-revision={h.revision}
                        disabled={conflict}
                        onClick={() => void openRestore(h.revision)}
                      >
                        差分を確認して復元…
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                履歴はまだありません。保存すると直前の内容がここに残ります。
              </p>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存する変更</DialogTitle>
            <DialogDescription>
              次の内容を revision {revision + 1} として保存します。
            </DialogDescription>
          </DialogHeader>
          <ul className="grid gap-1 pl-5 text-sm">
            {diff.map((line) => (
              <li key={line} className="list-disc">
                {line}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDiffOpen(false)}
            >
              キャンセル
            </Button>
            <Button type="button" onClick={() => void save()}>
              この内容で保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={restoring !== null}
        onOpenChange={(open) => {
          if (!open) setRestoring(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>revision {restoring?.revision} を復元</DialogTitle>
            <DialogDescription>
              {restoring?.errors.length
                ? 'この revision は現在の検証ルールを満たさないため復元できません。'
                : `現在の revision ${revision} からの差分です。復元すると revision ${revision + 1} として保存します。${restoring?.lines.length ? '' : ' (現在の設定と同じ内容です)'}`}
            </DialogDescription>
          </DialogHeader>
          {restoring?.errors.length ? (
            <ul className="grid gap-1 pl-5 text-sm text-destructive">
              {restoring.errors.map((e) => (
                <li key={`${e.path}:${e.message}`} className="list-disc">
                  {e.path}: {e.message}
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="grid gap-1 pl-5 text-sm">
            {restoring?.lines.map((line) => (
              <li key={line} className="list-disc">
                {line}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRestoring(null)}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              disabled={Boolean(restoring?.errors.length) || conflict}
              onClick={() => void restore()}
            >
              この内容で復元
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
