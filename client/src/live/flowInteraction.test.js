import { toggleExpandedCategory } from './flowInteraction';

describe('toggleExpandedCategory', () => {
  it('expands a category from no selection', () => {
    expect(toggleExpandedCategory(null, 'reward')).toBe('reward');
  });

  it('collapses when the same category is clicked again', () => {
    expect(toggleExpandedCategory('reward', 'reward')).toBeNull();
  });

  it('switches to the newly clicked category when a different one was already expanded', () => {
    expect(toggleExpandedCategory('reward', 'deploy')).toBe('deploy');
  });
});
