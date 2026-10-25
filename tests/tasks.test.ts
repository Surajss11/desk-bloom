import { describe, expect, it } from 'vitest';
import * as T from '../src/core/tasks';

describe('task deck', () => {
  it('creates at most four cleaned cards', () => {
    const deck = T.createDeck(['  a  ', '', 'b', 'c', 'd', 'e']);
    expect(deck.map((t) => t.title)).toEqual(['a', 'b', 'c', 'd']);
    expect(T.cleanTitle('x'.repeat(40)).length).toBe(T.MAX_TITLE);
  });

  it('only one card can be in focus', () => {
    let deck = T.createDeck();
    deck = T.focusTask(deck, 't1');
    deck = T.focusTask(deck, 't2');
    expect(deck.filter((t) => t.status === 'focus').map((t) => t.id)).toEqual(['t2']);
    expect(deck[0].status).toBe('todo');
  });

  it('done cards cannot be focused and can be reopened', () => {
    let deck = T.completeTask(T.createDeck(), 't1');
    expect(T.focusTask(deck, 't1')).toBe(deck);
    deck = T.reopenTask(deck, 't1');
    expect(deck[0].status).toBe('todo');
    expect(T.nextTodo(deck)?.id).toBe('t1');
  });

  it('detects a cleared desk', () => {
    let deck = T.createDeck(['a', 'b']);
    deck = T.completeTask(T.completeTask(deck, 't1'), 't2');
    expect(T.allDone(deck)).toBe(true);
  });

  it('revive repairs duplicate focus and junk', () => {
    const deck = T.reviveDeck([
      { id: 'a', title: 'One', status: 'focus' },
      { id: 'b', title: 'Two', status: 'focus' },
      { title: '' },
      7,
    ]);
    expect(deck?.map((t) => t.status)).toEqual(['focus', 'todo']);
    expect(T.reviveDeck('nope')).toBeNull();
  });
});
