import { concatUint8Arrays, varintPrefixed, AADMeta } from '../src';

describe('test concatenation', () => {
  test('simple', () => {
    const a = Uint8Array.of(1, 2, 3);
    const b = Uint8Array.of(4, 5);
    const c = Uint8Array.of(6, 7, 8);

    expect(concatUint8Arrays(a, b, c)).toStrictEqual(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8));
  });

  test('varint prefixed', () => {
    const a = Uint8Array.of(1, 2, 3, 4, 5, 6);

    expect(varintPrefixed(a)).toStrictEqual(Uint8Array.of(6, 1, 2, 3, 4, 5, 6));
  });
});

describe('allows previous versions', () => {
  const v010 = new AADMeta('0.1.0', 'arbitrary string', Uint8Array.of(1, 2, 3, 4, 5));

  const dat = AADMeta.unpack(v010.serialize());
  expect(dat).not.toBeNull();
  expect(dat?.metadata.version).toStrictEqual('0.1.0');
});
