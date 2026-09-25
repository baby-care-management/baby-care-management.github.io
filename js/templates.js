// 定型タスク（R-28）。ステータスを進めたとき、そのステータス用のタスクを作る
// base: 'today' は今日から、'event' は開催日から数える（days が負なら、開催日の前）。期限は今日より前にしない
import { addDays } from './logic.js';

export const RECORD_TASK = '実績を登録する';

export const TASK_TEMPLATES = [
  { key: 'quote-make', status: '見積', title: '見積書を作る', base: 'today', days: 1 },
  { key: 'quote-send', status: '見積', title: '見積を送り、返事を確認する', base: 'today', days: 4 },
  { key: 'form-guide', status: '申込確認', title: 'Googleフォームを案内する', base: 'today', days: 0 },
  { key: 'form-check', status: '申込確認', title: '申込フォームの回答を確認する', base: 'today', days: 2 },
  { key: 'staff-need', status: '申込確認', title: '必要スタッフ数を決める', base: 'today', days: 2 },
  { key: 'staff-ask', status: 'スタッフ手配', title: 'スタッフへ依頼を出す', base: 'today', days: 0 },
  { key: 'staff-confirm', status: 'スタッフ手配', title: '返事を確認して、スタッフを確定する', base: 'today', days: 3 },
  { key: 'fare-confirm', status: 'スタッフ手配', title: '交通費を確認して確定する', base: 'today', days: 3 },
  { key: 'goods', status: '最終確認', title: '備品の準備を事務所スタッフに連絡する', base: 'event', days: -3 },
  { key: 'staff-info', status: '最終確認', title: 'スタッフへ仕事内容・会場を連絡する', base: 'event', days: -2 },
  { key: 'day-check', status: '最終確認', title: '当日の配置表・名簿を確認する', base: 'event', days: -1 },
  { key: 'record', status: '実施済み', title: RECORD_TASK, base: 'today', days: 0 },
  { key: 'bill-make', status: '実施済み', title: '請求に必要な情報をまとめる', base: 'today', days: 1 },
  { key: 'bill-hand', status: '実施済み', title: '経理へ引き継ぐ', base: 'today', days: 2 },
  { key: 'report', status: '実施済み', title: 'お客さまへ実施報告を送る', base: 'today', days: 1 },
];

export const templatesOf = (status) => TASK_TEMPLATES.filter((t) => t.status === status);

export function dueOf(t, c, today) {
  const base = t.base === 'event' && c.date ? c.date : today;
  let due = addDays(base, t.days);
  if (due < today) due = today;
  return due;
}

// 作るタスクの一覧（同じ案件に同じ名前のタスクがあれば作らない。off は「使わない」にしたテンプレートの key）
export function templateTasks(status, c, today, tasks, off = []) {
  return templatesOf(status)
    .filter((t) => !off.includes(t.key))
    .filter((t) => !tasks.some((x) => x.caseId === c.id && x.title === t.title))
    .map((t) => ({ key: t.key, title: t.title, due: dueOf(t, c, today) }));
}
