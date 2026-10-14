/**
 * 管理画面のブラウザ側スクリプト。Worker のバンドルに文字列として含め、
 * /admin/app.js として認可後にだけ配信する(静的アセットや公開ビルドには置かない)。
 * DOM へは textContent / value だけで挿入し、innerHTML は使わない。
 * 注意: String.raw のため、このスクリプト内ではバッククォートと ${ を使わない。
 */
export const CLIENT_SCRIPT = String.raw`'use strict';
var TIERS = ['high', 'medium', 'low'];
var TIER_LABEL = { high: '高 (high)', medium: '中 (medium)', low: '低 (low)' };
var LIFECYCLES = ['planned', 'active', 'paused', 'completed', 'archived'];
var FIELD_LABEL = {
  name: '名前', description: '説明', lifecycle: 'ライフサイクル', tier: 'Tier',
  published: '公開', featuredMilestoneNumber: '代表 Milestone', repository: 'リポジトリ',
  slug: 'slug', id: 'id', priority: 'priority'
};

var state = {
  revision: 0, updatedAt: '', updatedBy: '',
  original: [], projects: [], candidates: [], snapshots: {},
  errors: {}, banner: null, conflict: false, focus: null
};

function el(tag, props, children) {
  var node = document.createElement(tag);
  var p = props || {};
  Object.keys(p).forEach(function (k) {
    var v = p[k];
    if (v === undefined || v === null || v === false) return;
    if (k === 'text') node.textContent = v;
    else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'draggable') node[k] = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  });
  (children || []).forEach(function (c) {
    if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function fmtTime(iso) {
  if (!iso) return '未同期';
  var d = new Date(iso);
  return isNaN(d.getTime()) ? '未同期' : d.toLocaleString('ja-JP');
}

async function api(path, init) {
  var res = await fetch(path, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, init || {}));
  var body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  return { status: res.status, ok: res.ok, body: body };
}

function banner(kind, text) { state.banner = { kind: kind, text: text }; }

async function load() {
  var cfg = await api('/api/admin/config');
  if (!cfg.ok) {
    banner('error', '設定を読み込めませんでした (HTTP ' + cfg.status + ')。');
    render();
    return;
  }
  state.revision = cfg.body.revision;
  state.updatedAt = cfg.body.updatedAt;
  state.updatedBy = cfg.body.updatedBy;
  state.original = clone(cfg.body.projects);
  state.projects = clone(cfg.body.projects);
  state.errors = {};
  state.conflict = false;
  var snaps = await api('/api/snapshots');
  state.snapshots = {};
  if (snaps.ok && snaps.body && snaps.body.snapshots) {
    snaps.body.snapshots.forEach(function (s) { state.snapshots[s.repository.toLowerCase()] = s; });
  }
  var cand = await api('/api/admin/candidates');
  state.candidates = cand.ok ? cand.body.candidates : [];
  if (!cand.ok) banner('warn', '追加候補を取得できませんでした (GitHub API の応答エラー)。');
  render();
}

function snapshotOf(p) { return state.snapshots[p.repository.toLowerCase()] || null; }
function isNew(p) {
  return !state.original.some(function (o) { return o.id === p.id; });
}

/* ---------- mutations ---------- */
function moveTo(project, tier) {
  var i = state.projects.indexOf(project);
  state.projects.splice(i, 1);
  project.tier = tier;
  state.projects.push(project);
}

function move(project, delta) {
  var peers = state.projects.filter(function (p) { return p.tier === project.tier; });
  var at = peers.indexOf(project);
  var other = peers[at + delta];
  if (!other) return;
  var a = state.projects.indexOf(project);
  var b = state.projects.indexOf(other);
  state.projects[a] = other;
  state.projects[b] = project;
}

function dropBefore(dragged, target) {
  if (dragged === target || dragged.tier !== target.tier) return;
  state.projects.splice(state.projects.indexOf(dragged), 1);
  state.projects.splice(state.projects.indexOf(target), 0, dragged);
}

function remove(project) {
  var name = project.name + ' (' + project.repository + ')';
  if (!window.confirm(name + ' を登録から削除します。\n公開停止 (published: false) とは異なり、元に戻すには再度追加が必要です。\n(保存するまで確定しません)\n\n削除しますか?')) return;
  state.projects.splice(state.projects.indexOf(project), 1);
  state.focus = null;
  render();
}

/* ---------- diff ---------- */
function tierOrder(list) {
  var out = {};
  TIERS.forEach(function (t) {
    out[t] = list.filter(function (p) { return p.tier === t; }).map(function (p) { return p.id; });
  });
  return out;
}

function computeDiff() {
  var lines = [];
  var before = {};
  state.original.forEach(function (p) { before[p.id] = p; });
  var now = {};
  state.projects.forEach(function (p) { now[p.id] = p; });
  state.projects.forEach(function (p) {
    var b = before[p.id];
    if (!b) { lines.push('追加: ' + p.name + ' (' + p.repository + ')'); return; }
    Object.keys(Object.assign({}, b, p)).forEach(function (k) {
      if (!same(b[k], p[k])) {
        lines.push('変更: ' + p.name + ' / ' + (FIELD_LABEL[k] || k) + ': ' + show(b[k]) + ' -> ' + show(p[k]));
      }
    });
  });
  state.original.forEach(function (b) {
    if (!now[b.id]) lines.push('削除: ' + b.name + ' (' + b.repository + ')');
  });
  var o1 = tierOrder(state.original.filter(function (p) { return now[p.id]; }));
  var o2 = tierOrder(state.projects.filter(function (p) { return before[p.id]; }));
  TIERS.forEach(function (t) {
    var a = o1[t].filter(function (id) { return before[id].tier === now[id].tier; });
    var b = o2[t].filter(function (id) { return before[id].tier === now[id].tier; });
    if (!same(a, b)) lines.push('並び替え: ' + t + ' Tier の順序が変わります (' + b.map(function (id) { return now[id].name; }).join(' > ') + ')');
  });
  return lines;
}
function show(v) { return v === undefined ? '(なし)' : JSON.stringify(v); }
function isDirty() { return computeDiff().length > 0; }

/* ---------- save ---------- */
function openDiff() {
  var lines = computeDiff();
  if (lines.length === 0) return;
  var dlg = document.getElementById('diff-dialog');
  var list = document.getElementById('diff-list');
  list.textContent = '';
  lines.forEach(function (l) { list.appendChild(el('li', { text: l })); });
  dlg.showModal();
}

async function save() {
  var dlg = document.getElementById('diff-dialog');
  dlg.close();
  var res = await api('/api/admin/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: state.revision, projects: state.projects })
  });
  if (res.ok) {
    state.revision = res.body.revision;
    state.updatedAt = res.body.updatedAt;
    state.updatedBy = res.body.updatedBy;
    state.original = clone(res.body.projects);
    state.projects = clone(res.body.projects);
    state.errors = {};
    banner('ok', '保存しました (revision ' + res.body.revision + ')。API・同期・Home には即時反映されます。サイドバーと詳細ページは次回ビルドで反映されます。');
  } else if (res.status === 409) {
    state.conflict = true;
    banner('error', '別の場所で設定が更新されました (最新 revision ' + (res.body && res.body.revision) + ')。再読み込みして変更をやり直してください。この画面の未保存の変更は反映されていません。');
  } else if (res.status === 422 && res.body && res.body.errors) {
    state.errors = {};
    var general = [];
    res.body.errors.forEach(function (e) {
      var m = /^projects\.(\d+)\.?(.*)$/.exec(e.path);
      if (m && state.projects[Number(m[1])]) {
        var id = state.projects[Number(m[1])].id;
        (state.errors[id] = state.errors[id] || []).push({ field: m[2], message: e.message });
      } else general.push(e.path + ': ' + e.message);
    });
    banner('error', '検証エラーがあります。該当する項目に表示しています。' + general.join(' / '));
  } else {
    banner('error', '保存に失敗しました (HTTP ' + res.status + ')。');
  }
  render();
}

/* ---------- rendering ---------- */
function fieldErrors(p, field) {
  return (state.errors[p.id] || []).filter(function (e) { return e.field === field; });
}

function labeled(text, control, p, field) {
  var errs = p ? fieldErrors(p, field) : [];
  return el('label', { class: 'field' + (errs.length ? ' invalid' : '') }, [
    el('span', { class: 'label', text: text }),
    control,
    errs.length ? el('span', { class: 'error', role: 'alert', text: errs.map(function (e) { return e.message; }).join(' / ') }) : null
  ]);
}

function option(value, text, selected) {
  var o = el('option', { value: value, text: text });
  o.selected = !!selected;
  return o;
}

function badge(text, cls) { return el('span', { class: 'badge ' + (cls || ''), text: text }); }

function renderCard(p) {
  var snap = snapshotOf(p);
  var peers = state.projects.filter(function (x) { return x.tier === p.tier; });
  var at = peers.indexOf(p);
  var errCount = (state.errors[p.id] || []).length;
  var focusKey = function (a) { return p.id + ':' + a; };

  var up = el('button', {
    type: 'button', 'aria-label': p.name + ' を上へ', 'data-focus': focusKey('up'),
    disabled: at === 0, text: '↑',
    onclick: function () { move(p, -1); state.focus = focusKey('up'); render(); }
  });
  var down = el('button', {
    type: 'button', 'aria-label': p.name + ' を下へ', 'data-focus': focusKey('down'),
    disabled: at === peers.length - 1, text: '↓',
    onclick: function () { move(p, 1); state.focus = focusKey('down'); render(); }
  });

  var published = el('input', {
    type: 'checkbox', checked: p.published, 'data-focus': focusKey('pub'),
    onchange: function (e) { p.published = e.target.checked; state.focus = focusKey('pub'); render(); }
  });
  var tier = el('select', {
    'data-focus': focusKey('tier'),
    onchange: function (e) { moveTo(p, e.target.value); state.focus = focusKey('tier'); render(); }
  }, TIERS.map(function (t) { return option(t, TIER_LABEL[t], t === p.tier); }));
  var lifecycle = el('select', {
    onchange: function (e) { p.lifecycle = e.target.value; render(); }
  }, LIFECYCLES.map(function (l) { return option(l, l, l === p.lifecycle); }));

  var name = el('input', { type: 'text', value: p.name, oninput: function (e) { p.name = e.target.value; markDirty(); } });
  var desc = el('textarea', { rows: 2, oninput: function (e) { p.description = e.target.value; markDirty(); } });
  desc.value = p.description;

  var ms = el('select', {
    onchange: function (e) {
      if (e.target.value === '') delete p.featuredMilestoneNumber;
      else p.featuredMilestoneNumber = Number(e.target.value);
      render();
    }
  });
  ms.appendChild(option('', '(自動選択)', p.featuredMilestoneNumber === undefined));
  var milestones = snap ? snap.milestones : [];
  var known = false;
  milestones.forEach(function (m) {
    if (m.number === p.featuredMilestoneNumber) known = true;
    ms.appendChild(option(String(m.number), '#' + m.number + ' ' + m.title + ' (' + m.state + ')', m.number === p.featuredMilestoneNumber));
  });
  if (p.featuredMilestoneNumber !== undefined && !known) {
    ms.appendChild(option(String(p.featuredMilestoneNumber), '#' + p.featuredMilestoneNumber + ' (スナップショットに無し)', true));
  }

  var slugControl = isNew(p)
    ? el('input', { type: 'text', value: p.slug, oninput: function (e) { p.slug = e.target.value; p.id = e.target.value; markDirty(); } })
    : el('code', { text: p.slug });

  var card = el('li', {
    class: 'card' + (p.published ? '' : ' unpublished') + (errCount ? ' has-error' : ''),
    draggable: true, 'data-id': p.id
  }, [
    el('div', { class: 'card-head' }, [
      el('span', { class: 'grip', 'aria-hidden': 'true', text: '⠿' }),
      el('div', { class: 'title' }, [
        el('strong', { text: p.name }),
        el('span', { class: 'repo', text: p.repository })
      ]),
      el('div', { class: 'badges' }, [
        badge(p.published ? '公開' : '非公開', p.published ? 'on' : 'off'),
        badge(p.lifecycle),
        badge('同期: ' + fmtTime(snap && snap.fetchedAt)),
        badge(snap ? 'GitHub: public' : 'GitHub: 未確認', snap ? '' : 'warn'),
        isNew(p) ? badge('新規', 'new') : null
      ]),
      el('div', { class: 'actions' }, [up, down])
    ]),
    el('div', { class: 'controls' }, [
      el('label', { class: 'check' }, [published, el('span', { text: '公開する' })]),
      labeled('Tier', tier, p, 'tier'),
      labeled('lifecycle', lifecycle, p, 'lifecycle')
    ]),
    el('details', { open: errCount > 0 ? true : null }, [
      el('summary', { text: '詳細を編集' }),
      labeled('名前', name, p, 'name'),
      labeled('説明', desc, p, 'description'),
      labeled('代表 Milestone', ms, p, 'featuredMilestoneNumber'),
      el('div', { class: 'field' }, [el('span', { class: 'label', text: 'slug (作成後は変更不可)' }), slugControl]),
      fieldErrors(p, 'slug').concat(fieldErrors(p, 'id')).concat(fieldErrors(p, 'repository')).length
        ? el('div', { class: 'error', role: 'alert', text: fieldErrors(p, 'slug').concat(fieldErrors(p, 'id')).concat(fieldErrors(p, 'repository')).map(function (e) { return e.message; }).join(' / ') })
        : null,
      el('button', {
        type: 'button', class: 'danger', text: '登録から削除…',
        onclick: function () { remove(p); }
      })
    ])
  ]);

  card.addEventListener('dragstart', function (e) {
    e.dataTransfer.setData('text/plain', p.id);
    e.dataTransfer.effectAllowed = 'move';
    state.dragging = p;
  });
  card.addEventListener('dragover', function (e) {
    if (state.dragging && state.dragging.tier === p.tier) { e.preventDefault(); card.classList.add('drop'); }
  });
  card.addEventListener('dragleave', function () { card.classList.remove('drop'); });
  card.addEventListener('drop', function (e) {
    e.preventDefault();
    if (state.dragging) dropBefore(state.dragging, p);
    state.dragging = null;
    render();
  });
  card.addEventListener('dragend', function () { state.dragging = null; render(); });
  return card;
}

function renderCandidates() {
  var wrap = document.getElementById('candidates');
  wrap.textContent = '';
  var sel = el('select', { id: 'candidate-select' });
  var registered = {};
  state.projects.forEach(function (p) { registered[p.repository.toLowerCase()] = true; });
  var available = state.candidates.filter(function (c) { return !registered[c.repository.toLowerCase()]; });
  sel.appendChild(option('', available.length ? '追加するリポジトリを選択' : '追加できる候補がありません', true));
  available.forEach(function (c) { sel.appendChild(option(c.repository, c.repository, false)); });
  var add = el('button', {
    type: 'button', text: '追加 (非公開・Tier 低で登録)',
    onclick: function () {
      var c = available.filter(function (x) { return x.repository === sel.value; })[0];
      if (!c) return;
      var d = clone(c.defaults);
      var taken = {};
      state.projects.forEach(function (p) { taken[p.id] = true; taken[p.slug] = true; });
      var base = d.slug, n = 2;
      while (taken[d.slug] || taken[d.id]) { d.slug = base + '-' + n; d.id = d.slug; n++; }
      state.projects.push(d);
      state.focus = d.id + ':pub';
      render();
    }
  });
  wrap.appendChild(el('label', { class: 'field' }, [el('span', { class: 'label', text: '追加候補 (public リポジトリ)' }), sel]));
  wrap.appendChild(add);
}

function markDirty() {
  var dirty = isDirty();
  document.getElementById('save-btn').disabled = !dirty || state.conflict;
  document.getElementById('dirty').textContent = dirty ? '未保存の変更があります' : '変更はありません';
}

function render() {
  var b = document.getElementById('banner');
  b.textContent = '';
  b.className = state.banner ? 'banner ' + state.banner.kind : 'banner hidden';
  if (state.banner) {
    b.appendChild(el('span', { text: state.banner.text }));
    if (state.conflict) b.appendChild(el('button', { type: 'button', text: '再読み込み', onclick: function () { state.banner = null; load(); } }));
  }
  document.getElementById('meta').textContent = 'revision ' + state.revision +
    (state.updatedAt ? ' / 最終更新 ' + fmtTime(state.updatedAt) + ' by ' + state.updatedBy : '');

  var root = document.getElementById('tiers');
  root.textContent = '';
  TIERS.forEach(function (t) {
    var items = state.projects.filter(function (p) { return p.tier === t; });
    var list = el('ul', { class: 'cards', 'aria-label': TIER_LABEL[t] + ' のプロジェクト' });
    items.forEach(function (p) { list.appendChild(renderCard(p)); });
    root.appendChild(el('section', { class: 'tier' }, [
      el('h2', { text: 'Tier: ' + TIER_LABEL[t] + ' (' + items.length + ')' }),
      items.length ? list : el('p', { class: 'empty', text: 'このTierにプロジェクトはありません。' })
    ]));
  });
  renderCandidates();
  markDirty();
  if (state.focus) {
    var target = document.querySelector('[data-focus="' + state.focus.replace(/"/g, '') + '"]');
    if (target) target.focus();
    state.focus = null;
  }
}

document.getElementById('save-btn').addEventListener('click', openDiff);
document.getElementById('diff-confirm').addEventListener('click', save);
document.getElementById('diff-cancel').addEventListener('click', function () { document.getElementById('diff-dialog').close(); });
document.getElementById('reload-btn').addEventListener('click', function () {
  if (isDirty() && !window.confirm('未保存の変更を破棄して再読み込みしますか?')) return;
  state.banner = null;
  load();
});
window.addEventListener('beforeunload', function (e) { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
load();
`;
