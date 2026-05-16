import { isValidPrTitle } from './validate-pr-title.ts';

describe('isValidPrTitle', () => {
  describe('conventional commits', () => {
    it.each([
      'feat: add feature',
      'fix: resolve bug',
      'chore: update deps',
      'docs: update readme',
      'style: format code',
      'refactor: extract helper',
      'perf: cache results',
      'test: add unit tests',
      'build: update config',
      'ci: add workflow',
      'revert: revert changes',
    ])('accepts type-only: %s', (title) => {
      expect(isValidPrTitle(title)).toBe(true);
    });

    it.each([
      'feat(scope): scoped feature',
      'fix(auth): login bug',
      'chore(deps): update lock file',
    ])('accepts scoped: %s', (title) => {
      expect(isValidPrTitle(title)).toBe(true);
    });

    it.each([
      'feat!: breaking change',
      'fix(api)!: breaking api change',
      'chore(deps)!: drop node 18',
    ])('accepts breaking: %s', (title) => {
      expect(isValidPrTitle(title)).toBe(true);
    });

    it.each([
      'Add new feature',
      'WIP: work in progress',
      'update something',
      'FEAT: uppercase type',
      'feat:no space after colon',
      'feat:',
      'feat: ',
      'feat(): empty scope',
      '',
    ])('rejects invalid: %s', (title) => {
      expect(isValidPrTitle(title)).toBe(false);
    });
  });

  describe('revert commits', () => {
    it.each([
      'Revert "feat: add feature"',
      "Revert 'fix: resolve bug'",
      'Revert commit abc123',
    ])('accepts: %s', (title) => {
      expect(isValidPrTitle(title)).toBe(true);
    });

    it('rejects bare Revert with no content', () => {
      expect(isValidPrTitle('Revert')).toBe(false);
    });
  });
});
