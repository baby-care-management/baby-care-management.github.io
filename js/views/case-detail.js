// 案件詳細（R-06・R-07・R-10）
import { h, pageHead, panel, empty, icon, statusBadge, assignBadge, roleTag, button, select, field, confirmDialog, toast, openDialog } from '../ui.js';
import { getState, update, findCase, findStaff, memberName, recordOf } from '../store.js';
import * as L from '../logic.js';
import { today, staffFill, taskRow, addTemplateTasks } from './parts.js';
import { openCaseDialog } from './case-form.js';
import { openTaskDialog } from './tasks.js';
import { draftTool } from './ai-parts.js';
import { openRecordDialog } from './records.js';
import { applicationsPanelBody, openImportDialog } from './applications.js';
import { openBillingDialog } from './billing.js';
import { validateFare, formatYen, fareState, billingIssues, billingOf, parseCount } from '../billing.js';

let candidatesOpenFor = null;   // 候補の一覧を開いている案件
let refreshView = () => {};

export function render({ params, isNew, refresh }) {
  refreshView = refresh;
  const c = findCase(params[0]);
  if (!c) {
    return h('div', null,
      pageHead({ title: '案件が見つかりません', crumb: { href: '#/cases', label: '案件の一覧へ' } }),
      empty('この案件は登録されていません', '一覧から選び直してください。サンプルデータに戻したときは、あとから登録した案件は消えます。'));
  }
  if (isNew && candidatesOpenFor !== c.id) candidatesOpenFor = null;
  const now = today();
  const whenText = `${L.formatDateLong(c.date)}${c.date === now ? '（今日）' : ''}　${L.formatTimeRange(c.start, c.end)}`;

  return h('div', null,
    pageHead({
      title: c.name,
      lead: `${c.type}・${whenText}`,
      crumb: { href: '#/cases', label: '案件の一覧へ' },
      actions: [button('案件を編集', { iconName: 'edit', onClick: () => openCaseDialog(c) })],
    }),
    h('div', { class: 'v-stack' },
      progressPanel(c),
      h('div', { class: 'grid-main-side' },
        h('div', { class: 'v-stack' },
          infoPanel(c),
          applicationPanel(c),
          staffPanel(c),
          tasksPanel(c),
          recordPanel(c)),
        h('div', { class: 'v-stack' },
          customerPanel(c),
          aiPanel(c),
          c.inquiry ? inquiryPanel(c) : null))));
}

// ---------- 進捗ステップ（R-07） ----------
function progressPanel(c) {
  const cur = L.statusIndex(c.status);
  const next = L.nextStatus(c.status);
  const prev = L.prevStatus(c.status);

  const groups = L.STAGES.filter((st) => st.statuses.length).map((st) => h('li', { class: `step-group span-${st.statuses.length}` + (st.statuses.includes(c.status) ? ' is-current' : '') },
    h('span', { class: 'step-group-name' }, st.label),
    h('ol', { class: 'steps' }, st.statuses.map((s) => {
      const i = L.statusIndex(s);
      const state = i < cur ? 'done' : i === cur ? 'current' : 'todo';
      return h('li', { class: 'step is-' + state, 'aria-current': state === 'current' ? 'step' : null },
        h('span', { class: 'step-dot' }, state === 'done' ? icon('check') : h('span', { class: 'num' }, String(i + 1))),
        h('span', { class: 'step-label' }, s, state === 'done' ? h('span', { class: 'visually-hidden' }, '（済み）') : state === 'current' ? h('span', { class: 'visually-hidden' }, '（今ここ）') : null));
    }))));

  const advance = () => {
    const warnings = L.advanceWarnings(c, { tasks: getState().tasks, record: recordOf(c.id), today: today() });
    const go = () => {
      let made = 0;
      update((s) => { const x = s.cases.find((y) => y.id === c.id); x.status = next; made = addTemplateTasks(s, x); });
      toast(`ステータスを「${next}」に進めました${made ? `。定型タスクを${made}件作りました` : ''}`);
    };
    if (!warnings.length) return go();
    openDialog({
      title: `「${next}」に進めますか`,
      lead: '次のことがまだ終わっていません。このまま進めるかは、担当者が決めてください。',
      body: h('ul', { class: 'warn-list' }, warnings.map((w) => h('li', null, icon('alert'), h('span', null, w)))),
      submitLabel: 'このまま進める',
      onSubmit: () => { go(); return null; },
    });
  };
  const back = () => confirmDialog({
    title: `「${prev}」に戻しますか`,
    message: `ステータスを「${c.status}」から「${prev}」に戻します。タスクや担当スタッフはそのまま残ります。`,
    okLabel: '戻す', danger: false,
    onOk: () => { update((s) => { s.cases.find((x) => x.id === c.id).status = prev; }); toast(`ステータスを「${prev}」に戻しました`); },
  });

  return panel({
    id: 'progress', title: '進み具合',
    actions: [statusBadge(c.status)],
    body: [
      h('p', { class: 'step-now', 'aria-hidden': 'true' }, h('span', { class: 'num' }, `${cur + 1} / ${L.STATUSES.length}`), h('strong', null, c.status), next ? h('span', { class: 'sub' }, `次は「${next}」`) : null),
      h('ol', { class: 'step-groups', 'aria-label': '案件のステータス（8段階）' }, groups),
      h('div', { class: 'progress-foot' },
        h('p', { class: 'guide' }, roleTag('human'), h('span', null, h('strong', null, '今やること: '), L.STATUS_GUIDE[c.status])),
        h('div', { class: 'page-actions' },
          prev ? button('1つ戻す', { kind: 'ghost', onClick: back }) : null,
          next ? button(`「${next}」に進める`, { kind: 'primary', iconName: 'arrow', onClick: advance }) : null)),
    ],
  });
}

// ---------- 基本情報・託児情報 ----------
function dl(rows) {
  return h('dl', { class: 'props' }, rows.map(([k, v, cls]) => [h('dt', null, k), h('dd', { class: cls }, v)]));
}
const orUnset = (v) => (v ? v : h('span', { class: 'cell-muted' }, '未入力'));

function infoPanel(c) {
  return panel({
    id: 'info', title: '案件の情報',
    body: h('div', { class: 'panel-body info-cols' },
      h('section', { 'aria-labelledby': 'info-basic' },
        h('h3', { class: 'sub-head', id: 'info-basic' }, '基本情報'),
        dl([
          ['開催日', L.formatDateLong(c.date)],
          ['時間', h('span', { class: 'num' }, L.formatTimeRange(c.start, c.end), L.formatDuration(c.start, c.end) ? `（${L.formatDuration(c.start, c.end)}）` : '')],
          ['会場', orUnset(c.venue)],
          ['種類', c.type],
          ['担当者', memberName(c.ownerId)],
        ])),
      h('section', { 'aria-labelledby': 'info-care' },
        h('h3', { class: 'sub-head', id: 'info-care' }, '託児情報'),
        dl([
          ['子ども人数', L.countOrUnset(c.children)],
          ['年齢構成', orUnset(c.ages)],
          ['必要スタッフ', L.countOrUnset(c.requiredStaff)],
          ['確認事項', orUnset(c.confirmItems), 'is-long'],
          ['託児メモ', orUnset(c.careNotes), 'is-long'],
        ]))),
  });
}

function customerPanel(c) {
  const cu = c.customer || {};
  return panel({
    id: 'customer', title: '顧客情報',
    body: h('div', { class: 'panel-body' }, dl([
      ['顧客名', orUnset(cu.company)],
      ['担当者', orUnset(cu.contact)],
      ['電話', orUnset(cu.phone)],
      ['メール', orUnset(cu.email)],
    ])),
  });
}

function inquiryPanel(c) {
  return panel({
    id: 'inquiry', title: '問い合わせの原文',
    body: h('div', { class: 'panel-body' }, h('p', { class: 'quote' }, c.inquiry)),
  });
}

// ---------- 担当スタッフと候補（R-10） ----------
function staffPanel(c) {
  const s = getState();
  const closed = ['実施済み', '完了'].includes(c.status);
  const list = (c.assignments || []).map((a) => ({ a, st: findStaff(a.staffId) })).filter((x) => x.st);

  const setState = (staffId, state) => {
    update((st) => { st.cases.find((x) => x.id === c.id).assignments.find((y) => y.staffId === staffId).state = state; });
    toast(`${findStaff(staffId).name}さんを「${state}」にしました`);
  };
  const remove = (staffId) => confirmDialog({
    title: '担当から外しますか',
    message: `${findStaff(staffId).name}さんを、この案件の担当から外します。依頼の連絡をしていた場合は、別に取り消しの連絡をしてください。`,
    okLabel: '外す',
    onOk: () => {
      update((st) => { const x = st.cases.find((y) => y.id === c.id); x.assignments = x.assignments.filter((y) => y.staffId !== staffId); });
      toast(`${findStaff(staffId).name}さんを担当から外しました`);
    },
  });

  const rows = list.length
    ? h('ul', { class: 'rows' }, list.map(({ a, st }) => h('li', null,
      h('div', { class: 'row-main' },
        h('p', { class: 'row-title' }, h('a', { href: '#/staff/' + st.id }, st.name), h('span', { class: 'row-note' }, `${st.qualification}・経験${st.years ?? '?'}年`)),
        h('p', { class: 'row-meta' }, h('span', null, st.experience)),
        h('p', { class: 'row-meta fare-line' },
          h('span', { class: a.fare == null && a.state === '確定' ? 'warn' : '' }, a.fare == null && a.state === '確定' ? icon('alert') : null, `交通費 ${formatYen(a.fare)}`, a.fare != null ? `（${fareState(a)}）` : ''),
          a.route ? h('span', null, a.route) : null,
          button(a.fare == null ? '交通費を入れる' : '交通費を直す', { size: 'sm', kind: 'ghost', ariaLabel: `${st.name}さんの交通費を${a.fare == null ? '入れる' : '直す'}`, onClick: () => openFareDialog(c.id, st.id) }))),
      h('div', { class: 'row-side' },
        closed ? assignBadge(a.state) : select('assign-state', ['依頼中', '確定'], a.state, {
          class: 'inline-select', id: `as-${c.id}-${st.id}`, 'aria-label': `${st.name}さんの状態`,
          onchange: (e) => setState(st.id, e.target.value),
        }),
        closed ? null : h('button', { type: 'button', class: 'btn btn-ghost icon-btn', 'aria-label': `${st.name}さんを担当から外す`, onclick: () => remove(st.id) }, icon('close'))))))
    : h('div', { class: 'empty' }, h('strong', null, 'まだ担当スタッフがいません'), h('span', null, '「スタッフ候補を探す」で、曜日と時間が合う人を探せます。'));

  const open = candidatesOpenFor === c.id;
  const toggle = button(open ? '候補を閉じる' : 'スタッフ候補を探す', {
    kind: open ? 'ghost' : '', iconName: open ? 'close' : 'search',
    onClick: () => { candidatesOpenFor = open ? null : c.id; refreshView(); },
  });

  return panel({
    id: 'staff', title: '担当スタッフ',
    actions: [staffFill(c), closed ? null : toggle],
    body: [rows, open && !closed ? candidatesBlock(c, s) : null],
  });
}

function candidatesBlock(c, s) {
  const r = L.findCandidates(s, c);
  const head = h('div', { class: 'cand-head' },
    h('h3', { class: 'sub-head' }, 'スタッフ候補'),
    h('p', { class: 'guide' }, roleTag('system'), h('span', null, `${L.formatDate(c.date)} ${L.formatTimeRange(c.start, c.end)} に入れる人を、登録された曜日・時間・ほかの案件から探しました。依頼するかは人が決めます。`)));
  if (r.missing.length) {
    return h('div', { class: 'cand', id: 'candidates' }, head,
      h('p', { class: 'notice' }, icon('alert'), h('span', null, `${r.missing.join('と')}が入っていないため、探せません。「案件を編集」で入れてください。`)));
  }
  const add = (st) => {
    update((x) => { x.cases.find((y) => y.id === c.id).assignments.push({ staffId: st.id, state: '依頼中' }); });
    toast(`${st.name}さんを「依頼中」で追加しました。依頼の連絡は別に行ってください`);
  };
  const summary = L.excludedSummary(r.excluded);
  return h('div', { class: 'cand', id: 'candidates' }, head,
    r.candidates.length
      ? h('ul', { class: 'rows' }, r.candidates.map((st) => h('li', null,
        h('div', { class: 'row-main' },
          h('p', { class: 'row-title' }, st.name, h('span', { class: 'row-note' }, `${st.qualification}・経験${st.years ?? '?'}年`)),
          h('p', { class: 'row-meta' }, h('span', null, `${L.formatDays(st.days)} ${L.formatTimeRange(st.from, st.to)}`), h('span', null, st.experience), st.notes ? h('span', null, st.notes) : null)),
        h('div', { class: 'row-side' }, button('依頼中で追加', { size: 'sm', iconName: 'plus', ariaLabel: `${st.name}さんを依頼中で追加`, onClick: () => add(st) })))))
      : h('div', { class: 'empty' }, h('strong', null, '条件に合うスタッフがいません'), h('span', null, '外れた理由を見て、時間の相談や、スタッフの登録内容の見直しを考えてください。')),
    summary.length ? h('details', { class: 'excluded' },
      h('summary', null, `条件に合わない ${r.excluded.length}名（${summary.map((x) => `${x.label} ${x.count}名`).join('・')}）`),
      h('ul', null, r.excluded.map((e) => h('li', null, h('a', { href: '#/staff/' + e.staff.id }, e.staff.name), `：${L.EXCLUDE_REASONS[e.reason]}`)))) : null);
}

// ---------- タスク ----------
function tasksPanel(c) {
  const list = L.tasksOfCase(getState().tasks, c.id);
  const open = list.filter(L.isOpenTask).length;
  return panel({
    id: 'case-tasks', title: 'タスク', count: `未完了 ${open}件 / ${list.length}件`,
    actions: [button('タスクを追加', { size: 'sm', iconName: 'plus', onClick: () => openTaskDialog({ caseId: c.id }) })],
    body: list.length
      ? h('ul', { class: 'rows' }, list.map((t) => taskRow(t, { showCase: false })))
      : h('div', { class: 'empty' }, h('strong', null, 'タスクはまだありません'), h('span', null, '「タスクを追加」で、期限と担当者を決めて登録します。')),
  });
}

// ---------- 実績（R-15） ----------
function recordPanel(c) {
  const r = recordOf(c.id);
  const now = today();
  if (r) {
    const diff = L.diffLabel(c.children, r.children);
    return panel({
      id: 'record', title: '実績',
      actions: [button('請求情報のまとめ', { size: 'sm', onClick: () => openBillingDialog(c.id) }), button('実績を編集', { size: 'sm', iconName: 'edit', onClick: () => openRecordDialog({ caseId: c.id }) })],
      body: h('div', { class: 'panel-body' }, dl([
        ['実施日', L.formatDateLong(r.date)],
        ['子ども', h('span', null, `${r.children}名`, h('span', { class: 'sub' }, c.children == null ? '（予定は未入力）' : `（予定 ${c.children}名・${diff}）`))],
        ['スタッフ', h('span', null, `${r.staff}名`, h('span', { class: 'sub' }, c.requiredStaff == null ? '' : `（必要 ${c.requiredStaff}名）`))],
        ['実施時間', h('span', { class: 'num' }, L.formatTimeRange(r.start, r.end), L.formatDuration(r.start, r.end) ? `（${L.formatDuration(r.start, r.end)}）` : '')],
        ['申し送り', r.notes || h('span', { class: 'cell-muted' }, 'なし'), 'is-long'],
        ['経理への引き継ぎ', `${billingOf(c).state}${billingIssues(getState(), c).length && billingOf(c).state !== '経理へ引き継ぎ済み' ? `（足りないこと ${billingIssues(getState(), c).length}件）` : ''}`],
      ])),
    });
  }
  const canRegister = c.status === '実施済み' || (c.date && c.date <= now && L.statusIndex(c.status) >= L.statusIndex('最終確認'));
  return panel({
    id: 'record', title: '実績',
    body: canRegister
      ? h('div', { class: 'empty' },
        h('strong', null, '実績がまだ登録されていません'),
        h('span', null, '実際の人数・時間・申し送りを残すと、次の引き継ぎメモにも使われます。'),
        h('p', { class: 'empty-action' }, button('実績を登録', { kind: 'primary', iconName: 'plus', onClick: () => openRecordDialog({ caseId: c.id }) })))
      : h('div', { class: 'empty' },
        h('strong', null, '実施したあとに登録します'),
        h('span', null, c.date ? `開催日（${L.formatDate(c.date)}）が過ぎ、「最終確認」以降になると登録できます。` : '開催日が決まっていません。')),
  });
}

// ---------- AIアシスタント（R-12〜R-14） ----------
function aiPanel(c) {
  return panel({
    id: 'ai', title: 'AIアシスタント',
    body: h('div', { class: 'panel-body' },
      h('p', { class: 'lead-text' }, 'この案件の情報から、文章の下書きを作ります。送信はしません。'),
      draftTool(c.id, refreshView)),
  });
}

// ---------- 申込フォーム（R-17） ----------
function applicationPanel(c) {
  return panel({
    id: 'applications', title: '申込フォーム（Googleフォーム）',
    actions: [button('回答を取り込む', { size: 'sm', iconName: 'plus', onClick: () => openImportDialog({ caseId: c.id }) })],
    body: applicationsPanelBody(c),
  });
}

// ---------- 交通費（R-20） ----------
function openFareDialog(caseId, staffId) {
  const c = findCase(caseId);
  const a = c.assignments.find((x) => x.staffId === staffId);
  const st = findStaff(staffId);
  const fare = h('input', { type: 'text', name: 'fare', inputmode: 'numeric', autocomplete: 'off', placeholder: '例: 1200' });
  fare.value = a.fare == null ? '' : String(a.fare);
  const route = h('input', { type: 'text', name: 'route', autocomplete: 'off', maxlength: 60, placeholder: '例: 自宅から会場（電車）' });
  route.value = a.route || '';
  const conf = h('input', { type: 'checkbox', name: 'fareConfirmed', id: 'fare-conf' });
  conf.checked = !!a.fareConfirmed;
  openDialog({
    title: `${st.name}さんの交通費`,
    lead: `${c.name}（${L.formatDate(c.date)}）`,
    submitLabel: '保存する',
    body: h('div', { class: 'form-grid' },
      field('金額（円）', fare, { hint: '分からないときは空のまま（未入力）。かからないときは 0' }),
      field('経路のメモ', route),
      h('label', { class: 'check-line span-2', for: 'fare-conf' }, conf, h('span', null, '金額を確認して、確定にする'))),
    onSubmit: (form) => {
      const v = { fare: parseCount(form.elements.fare.value), route: form.elements.route.value.trim(), fareConfirmed: form.elements.fareConfirmed.checked };
      const errors = validateFare(v);
      if (Object.keys(errors).length) return errors;
      update((s) => { const x = s.cases.find((y) => y.id === caseId).assignments.find((y) => y.staffId === staffId); Object.assign(x, v); });
      toast(`${st.name}さんの交通費を保存しました`);
      return null;
    },
  });
}
