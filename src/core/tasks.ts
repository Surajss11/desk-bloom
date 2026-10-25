/** The small, physical task deck that sits on the desk. */

export type TaskStatus = 'todo' | 'focus' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  /** Focus minutes invested in this task. */
  minutes: number;
}

export const MAX_TASKS = 4;
export const MAX_TITLE = 28;

export const STARTER_TASKS = [
  'Plan my day',
  'Deep work block',
  'Read 10 pages',
  'Clear my inbox',
];

export function cleanTitle(title: string): string {
  const t = title.replace(/\s+/g, ' ').trim();
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1).trimEnd()}.` : t;
}

export function createDeck(titles: readonly string[] = STARTER_TASKS): Task[] {
  return titles
    .map(cleanTitle)
    .filter((t) => t.length > 0)
    .slice(0, MAX_TASKS)
    .map((title, i) => ({ id: `t${i + 1}`, title, status: 'todo' as const, minutes: 0 }));
}

/** Move one task into the focus slot; any previous focus task returns to todo. */
export function focusTask(deck: Task[], id: string): Task[] {
  if (!deck.some((t) => t.id === id && t.status !== 'done')) return deck;
  return deck.map((t) => {
    if (t.id === id) return { ...t, status: 'focus' };
    if (t.status === 'focus') return { ...t, status: 'todo' };
    return t;
  });
}

export function releaseFocus(deck: Task[]): Task[] {
  return deck.map((t) => (t.status === 'focus' ? { ...t, status: 'todo' } : t));
}

export function addMinutes(deck: Task[], id: string | null, minutes: number): Task[] {
  if (id == null) return deck;
  return deck.map((t) => (t.id === id ? { ...t, minutes: t.minutes + minutes } : t));
}

export function completeTask(deck: Task[], id: string): Task[] {
  return deck.map((t) => (t.id === id ? { ...t, status: 'done' } : t));
}

export function reopenTask(deck: Task[], id: string): Task[] {
  return deck.map((t) => (t.id === id && t.status === 'done' ? { ...t, status: 'todo' } : t));
}

export function focusedTask(deck: Task[]): Task | undefined {
  return deck.find((t) => t.status === 'focus');
}

/** Next task to suggest: first todo card, in deck order. */
export function nextTodo(deck: Task[]): Task | undefined {
  return deck.find((t) => t.status === 'todo');
}

export function allDone(deck: Task[]): boolean {
  return deck.length > 0 && deck.every((t) => t.status === 'done');
}

export function reviveDeck(raw: unknown): Task[] | null {
  if (!Array.isArray(raw)) return null;
  const statuses: TaskStatus[] = ['todo', 'focus', 'done'];
  const out: Task[] = [];
  for (const item of raw.slice(0, MAX_TASKS)) {
    if (item == null || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const title = typeof r.title === 'string' ? cleanTitle(r.title) : '';
    if (!title) continue;
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : `t${out.length + 1}`,
      title,
      status: statuses.includes(r.status as TaskStatus) ? (r.status as TaskStatus) : 'todo',
      minutes: typeof r.minutes === 'number' && r.minutes > 0 ? Math.floor(r.minutes) : 0,
    });
  }
  // At most one card may be in focus.
  let seenFocus = false;
  for (const t of out) {
    if (t.status === 'focus') {
      if (seenFocus) t.status = 'todo';
      seenFocus = true;
    }
  }
  return out.length ? out : null;
}
