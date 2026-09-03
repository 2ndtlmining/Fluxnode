import { mergeIncomingBlocks, removeLeavingBlock } from './blockAnimation';

function block(height, events = []) {
  return { height, hash: `h${height}`, at: height * 1000, events };
}

describe('mergeIncomingBlocks', () => {
  it('on first load, marks every block entering (a single simultaneous fade-in, not a cascade)', () => {
    const fresh = [block(105), block(104), block(103), block(102), block(101)];
    const result = mergeIncomingBlocks([], fresh);

    expect(result).toHaveLength(5);
    expect(result.every((b) => b.phase === 'entering')).toBe(true);
    expect(result.map((b) => b.height)).toEqual([105, 104, 103, 102, 101]);
  });

  it('does nothing structural when the tip is unchanged, just refreshes data', () => {
    const prev = [block(105), block(104), block(103), block(102), block(101)].map((b) => ({ ...b, phase: 'pushed' }));
    const fresh = [block(105, [{ id: 'e1' }]), block(104), block(103), block(102), block(101)];

    const result = mergeIncomingBlocks(prev, fresh);

    expect(result).toHaveLength(5);
    expect(result[0].events).toEqual([{ id: 'e1' }]);
    expect(result.every((b) => b.phase === 'pushed')).toBe(true);
  });

  it('marks a genuinely new tip block as entering and the rest as pushed', () => {
    const prev = [block(105), block(104), block(103), block(102), block(101)].map((b) => ({ ...b, phase: 'pushed' }));
    const fresh = [block(106), block(105), block(104), block(103), block(102)];

    const result = mergeIncomingBlocks(prev, fresh);

    // The 6th entry (the outgoing block, phase 'leaving') is covered by its
    // own test below — this one only asserts the visible window.
    expect(result.slice(0, 5).map((b) => ({ height: b.height, phase: b.phase }))).toEqual([
      { height: 106, phase: 'entering' },
      { height: 105, phase: 'pushed' },
      { height: 104, phase: 'pushed' },
      { height: 103, phase: 'pushed' },
      { height: 102, phase: 'pushed' },
    ]);
  });

  it('pushes the 5th (oldest visible) block into a leaving phase rather than dropping it immediately', () => {
    const prev = [block(105), block(104), block(103), block(102), block(101)].map((b) => ({ ...b, phase: 'pushed' }));
    const fresh = [block(106), block(105), block(104), block(103), block(102)];

    const result = mergeIncomingBlocks(prev, fresh);

    expect(result).toHaveLength(6); // 5 visible + 1 leaving
    const leaving = result.find((b) => b.phase === 'leaving');
    expect(leaving.height).toBe(101);
  });

  it('keeps a still-dissolving leaving block around across a poll that brings no new tip', () => {
    const prev = [
      { ...block(106), phase: 'entering' },
      { ...block(105), phase: 'pushed' },
      { ...block(104), phase: 'pushed' },
      { ...block(103), phase: 'pushed' },
      { ...block(102), phase: 'pushed' },
      { ...block(101), phase: 'leaving' },
    ];
    const fresh = [block(106), block(105), block(104), block(103), block(102)];

    const result = mergeIncomingBlocks(prev, fresh);

    expect(result.some((b) => b.height === 101 && b.phase === 'leaving')).toBe(true);
  });

  it('never produces more than one leaving block from a single new-tip transition', () => {
    const prev = [block(105), block(104), block(103), block(102), block(101)].map((b) => ({ ...b, phase: 'pushed' }));
    const fresh = [block(106), block(105), block(104), block(103), block(102)];

    const result = mergeIncomingBlocks(prev, fresh);

    expect(result.filter((b) => b.phase === 'leaving')).toHaveLength(1);
  });
});

describe('removeLeavingBlock', () => {
  it('removes only the matching leaving block', () => {
    const input = [
      { height: 2, phase: 'pushed' },
      { height: 1, phase: 'leaving' },
    ];
    expect(removeLeavingBlock(input, 1)).toEqual([{ height: 2, phase: 'pushed' }]);
  });

  it('does not remove a block at the same height that is not actually leaving', () => {
    const input = [{ height: 1, phase: 'pushed' }];
    expect(removeLeavingBlock(input, 1)).toEqual(input);
  });
});
