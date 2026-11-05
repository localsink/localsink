import { licenseKeyInputSchema } from './schemas.ts';

describe('licenseKeyInputSchema', () => {
  const key = '0f8fad5b-d9cb-469f-a165-70867728950e';

  it('accepts a key as minted', () => {
    expect(licenseKeyInputSchema.parse({ key })).toEqual({ key });
  });

  it('normalizes whitespace and case before the shape check', () => {
    expect(
      licenseKeyInputSchema.parse({ key: `  ${key.toUpperCase()}\n` }),
    ).toEqual({ key });
  });

  it.each(['', 'not-a-key', `${key}0`, key.replaceAll('-', '')])(
    'rejects %j',
    (input) => {
      expect(licenseKeyInputSchema.safeParse({ key: input }).success).toBe(
        false,
      );
    },
  );
});
