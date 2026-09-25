// AI の窓口。画面はここの4つの関数だけを呼ぶ（R-11〜R-14）
// 今のつなぎ先はモック（ai-mock.js）。本物の AI API に替えるときは、同じ4つの関数を持つつなぎ先を setProvider で差し替える。
// そのときも API キーはブラウザに置かず、サーバーを挟む（R-21・S-54）。送るのは contextFor が作る情報だけ（S-83）
import * as mock from './ai-mock.js';
import { STATUS_GUIDE, staffCounts, isOpenTask } from './logic.js';

const mockProvider = {
  label: 'モックで作成（AI API は未接続）',
  organizeInquiry: async (text, { today }) => mock.organizeInquiry(text, today),
  draftCustomerReply: async (ctx) => mock.draftCustomerReply(ctx),
  draftStaffRequest: async (ctx) => mock.draftStaffRequest(ctx),
  draftQuote: async (ctx) => mock.draftQuote(ctx),
  draftApplication: async (ctx) => mock.draftApplication(ctx),
  draftHandoverMemo: async (ctx) => mock.draftHandoverMemo(ctx),
};

let provider = mockProvider;
export function setProvider(p) { provider = p; }
export const providerLabel = () => provider.label;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const THINK_MS = 600;   // モックでも「作っている間」の画面を出すため、少し待つ

async function call(fn, ...args) {
  await wait(THINK_MS);
  return { result: await provider[fn](...args), source: provider.label, createdAt: new Date().toISOString() };
}

export const organizeInquiry = (text, today) => call('organizeInquiry', text, { today });
export const draftCustomerReply = (ctx) => call('draftCustomerReply', ctx);
export const draftStaffRequest = (ctx) => call('draftStaffRequest', ctx);
export const draftQuote = (ctx) => call('draftQuote', ctx);
export const draftApplication = (ctx) => call('draftApplication', ctx);
export const draftHandoverMemo = (ctx) => call('draftHandoverMemo', ctx);

// line: true のものは、「LINE向けの短い文」に切り替えられる
export const DRAFT_KINDS = [
  { key: 'customer', label: '顧客への返信文', fn: draftCustomerReply, line: true, note: '案件の情報とステータスから、お客さまへの丁寧な返信の下書きを作ります。見積・申込確認のときは、Googleフォームの案内が入ります' },
  { key: 'quote', label: '見積のご案内文', fn: draftQuote, note: '見積書に添える文と、内訳のひな形を作ります。金額は〔 〕で、人が入れます' },
  { key: 'application', label: '申込書', fn: draftApplication, note: '託児申込書のひな形を作ります。案件の情報が入り、お客さまの確認欄がつきます' },
  { key: 'staff', label: 'スタッフへの依頼文', fn: draftStaffRequest, line: true, note: '日時・会場・年齢構成・募集人数を入れた依頼の下書きを作ります。お客さまの連絡先は入れません' },
  { key: 'handover', label: '引き継ぎメモ', fn: draftHandoverMemo, note: '案件・スタッフ・タスク・前回までの申し送りをまとめた、担当者向けのメモを作ります' },
];

const splitItems = (s) => String(s || '').split(/[\n／]/).map((x) => x.trim()).filter(Boolean);

// AI に渡す情報を、下書きの種類ごとに必要な分だけ作る（渡しすぎない）
export function contextFor(kind, state, caseId, today, { variant = '' } = {}) {
  const c = state.cases.find((x) => x.id === caseId);
  if (!c) return null;
  const memberName = (id) => state.members.find((m) => m.id === id)?.name || '担当者';
  const base = {
    kind, today, caseName: c.name, type: c.type, status: c.status, guide: STATUS_GUIDE[c.status],
    date: c.date, start: c.start, end: c.end, venue: c.venue, children: c.children, ages: c.ages,
    requiredStaff: c.requiredStaff, confirmedStaff: staffCounts(c).confirmed, requestedStaff: staffCounts(c).requested, careNotes: c.careNotes,
    confirmItems: splitItems(c.confirmItems), ownerName: memberName(c.ownerId), variant,
    formUrl: state.settings?.formUrl || '',
    hasApplication: (state.applications || []).some((a) => a.caseId === c.id && a.status === '確認済み'),
  };
  const rec = state.records.find((r) => r.caseId === c.id);
  if (kind === 'customer') {
    return { ...base, company: c.customer?.company || '', contact: c.customer?.contact || '', record: rec ? { children: rec.children, staff: rec.staff } : null };
  }
  if (kind === 'quote') return { ...base, company: c.customer?.company || '', contact: c.customer?.contact || '' };
  if (kind === 'application') return { ...base, company: c.customer?.company || '', contact: c.customer?.contact || '', phone: c.customer?.phone || '', email: c.customer?.email || '' };
  if (kind === 'staff') {
    return base;   // お客さまの名前・連絡先は入れない
  }
  // 引き継ぎメモ
  const staff = (c.assignments || []).map((a) => {
    const s = state.staff.find((x) => x.id === a.staffId);
    return s ? { name: s.name, state: a.state, qualification: s.qualification, years: s.years } : null;
  }).filter(Boolean);
  const tasks = state.tasks.filter((t) => t.caseId === c.id && isOpenTask(t)).sort((a, b) => (a.due < b.due ? -1 : 1))
    .map((t) => ({ title: t.title, due: t.due, assignee: memberName(t.assigneeId), overdue: t.due < today }));
  const company = c.customer?.company || '';
  const pastNotes = company ? state.records
    .map((r) => ({ r, cc: state.cases.find((x) => x.id === r.caseId) }))
    .filter(({ r, cc }) => cc && cc.id !== c.id && cc.customer?.company === company && r.notes)
    .sort((a, b) => (a.r.date < b.r.date ? 1 : -1)).slice(0, 3)
    .map(({ r, cc }) => ({ date: r.date, caseName: cc.name, notes: r.notes })) : [];
  if (rec?.notes) pastNotes.unshift({ date: rec.date, caseName: 'この案件', notes: rec.notes });
  return { ...base, company, contact: c.customer?.contact || '', phone: c.customer?.phone || '', staff, tasks, pastNotes };
}
