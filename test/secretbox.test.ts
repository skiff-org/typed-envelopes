// eslint-disable-next-line max-classes-per-file
import { Range } from 'semver';
import { randomBytes } from 'crypto';
import { Datagram, Wrapper, SecretBox } from '../src';

const _encoder = new TextEncoder();
const _decoder = new TextDecoder();

// 'Example' is an toy implementation of a structured data object. Anything that implements the Datagram interface
// should work with 'TaggedSecretBox', but there's also 'SecretBoxWrapper' that handles arbitrary objects.

// NOTE: there's a typescript gotcha around the `type` and `deserialize` methods. If they're defined as captive lambdas,
// they'll still adhere to the `Datagram` interface, but won't be present if the object is instantiated by anything
// other than its constructor.
class Example implements Datagram<Example> {
  // eslint-disable-next-line class-methods-use-this
  get type(): string {
    return 'ddl://skiff/example';
  }

  constructor(
    public readonly data: Uint8Array,
    public readonly version: string = '0.1.0',
  ) { }

  // eslint-disable-next-line class-methods-use-this
  deserialize(data: Uint8Array, version: string): Example | null {
    if (!new Range('0.1.*').test(version)) {
      return null;
    }

    return new Example(data, version);
  }

  serialize(): Uint8Array {
    return this.data;
  }
}

describe('typed encryption/decryption', () => {
  const key = randomBytes(32);
  const envelope = new SecretBox(key);

  test('roundtrip', () => {
    const data = Uint8Array.of(1, 2, 3, 4, 5);
    const example = new Example(data);

    const enc = envelope.encrypt(example);

    expect(enc).not.toBeNull();

    const components = enc.inspect(); // NOTE: this isn't decryption
    expect(components).not.toBeNull();

    expect(components!.version).toEqual(example.version);
    expect(components!.type).toEqual(example.type);

    const dec = envelope.decrypt(Example, enc); // type erasure sux
    expect(dec).not.toBeNull();

    expect(example.type).toEqual(dec!.type);
    expect(example.version).toEqual(dec!.version);
    expect(data).toStrictEqual(dec!.data);
  });

  test('datagram wrapper', () => {
    const foo = { a: 1, b: 2, c: [3, 4, 5] };
    const Foo = Wrapper('foo', '0.1.*');

    const enc = envelope.encrypt(Foo.wrap(foo, '0.1.0'));

    const components = enc.inspect();
    expect(components).not.toBeNull();

    expect(components!.version).toEqual('0.1.0');
    expect(components!.type).toEqual('foo');

    const dec = envelope.decrypt(Foo, enc);
    expect(dec).not.toBeNull();

    expect(foo).toStrictEqual(dec);
  });

  test('wrapped constraint demo', () => {
    const Foo = Wrapper('foo', '0.1.*');

    // These datagrams show an upgrade mutation. Subsequent versions introduce new data.
    const foov011 = {
      a: 1,
      b: 2,
      c: [3, 4, 5],
    };

    const foov012 = {
      ...foov011,
      d: 'new data',
    };

    const foov013 = {
      ...foov012,
      e: 'even more',
    };

    // `Foo` doesn't have any context for what the version numbers mean. In the `DatagramWrapper`, it's just additional
    // information available from the encrypted context. Mapping that version compatibility is a caller concern, but can
    // be captured in an explicit definition of a `Datagram` extension class. See 'Example'

    const encv011 = envelope.encrypt(Foo.wrap(foov011, '0.1.1'));
    const encv012 = envelope.encrypt(Foo.wrap(foov012, '0.1.2'));
    const encv013 = envelope.encrypt(Foo.wrap(foov013, '0.1.3'));

    expect(encv011.inspect()!.version).toBe('0.1.1');
    expect(encv012.inspect()!.version).toBe('0.1.2');
    expect(encv013.inspect()!.version).toBe('0.1.3');

    const decv011 = envelope.decrypt(Foo, encv011);
    const decv012 = envelope.decrypt(Foo, encv012);
    const decv013 = envelope.decrypt(Foo, encv013);

    expect(decv011).toStrictEqual(foov011);
    expect(decv012).toStrictEqual(foov012);
    expect(decv013).toStrictEqual(foov013);
  });

  test('versioned demo', () => {
    abstract class FooBase implements Datagram<FooBase> {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      abstract deserialize(dat: Uint8Array, ver: string): FooBase | null;

      abstract serialize(): Uint8Array;

      // eslint-disable-next-line class-methods-use-this
      get type(): string {
        return 'ddl://skiff/foo';
      }

      abstract get version(): string;
    }

    class FooV011 extends FooBase {
      // eslint-disable-next-line class-methods-use-this
      get version(): string {
        return '0.1.1';
      }

      constructor(
        readonly a: number,
        readonly b: number,
        readonly c: number[],
      ) {
        super();
      }

      serialize(): Uint8Array {
        return _encoder.encode(JSON.stringify({ a: this.a, b: this.b, c: this.c }));
      }

      // eslint-disable-next-line class-methods-use-this
      deserialize(data: Uint8Array, version: string): FooV011 | null {
        if (version === this.version) {
          const des = JSON.parse(_decoder.decode(data));
          return new FooV011(des.a, des.b, des.c);
        }
        return null;
      }
    }
    class FooV012 extends FooV011 {
      // eslint-disable-next-line class-methods-use-this
      get version(): string {
        return '0.1.2';
      }

      constructor(
        readonly a: number,
        readonly b: number,
        readonly c: number[],
        readonly d: string,
      ) {
        super(a, b, c);
      }

      serialize(): Uint8Array {
        return _encoder.encode(
          JSON.stringify({
            a: this.a,
            b: this.b,
            c: this.c,
            d: this.d,
          }),
        );
      }

      // eslint-disable-next-line class-methods-use-this
      deserialize(data: Uint8Array, version: string): FooV012 | null {
        if (version === this.version) {
          const des = JSON.parse(_decoder.decode(data));
          return new FooV012(des.a, des.b, des.c, des.d);
        }
        return null;
      }
    }
    class FooV013 extends FooV012 {
      // eslint-disable-next-line class-methods-use-this
      get version(): string {
        return '0.1.3';
      }

      constructor(
        readonly a: number,
        readonly b: number,
        readonly c: number[],
        readonly d: string,
        readonly e: string,
      ) {
        super(a, b, c, d);
      }

      serialize(): Uint8Array {
        return _encoder.encode(
          JSON.stringify({
            a: this.a,
            b: this.b,
            c: this.c,
            d: this.d,
            e: this.e,
          }),
        );
      }

      // eslint-disable-next-line class-methods-use-this
      deserialize(data: Uint8Array, version: string): FooV013 | null {
        if (version === this.version) {
          const des = JSON.parse(_decoder.decode(data));
          return new FooV013(des.a, des.b, des.c, des.d, des.e);
        }
        return null;
      }
    }

    // Serialize and encrypt some iterations of these objects.
    const f011 = new FooV011(1, 2, [3]);
    const f012 = new FooV012(1, 2, [3], 'four');
    const f013 = new FooV013(1, 2, [3], 'four', 'five');

    const e011 = envelope.encrypt(f011);
    const e012 = envelope.encrypt(f012);
    const e013 = envelope.encrypt(f013);

    // They get their object types correctly.
    const dec011 = envelope.decrypt(FooV011, e011);
    const dec012 = envelope.decrypt(FooV012, e012);
    const dec013 = envelope.decrypt(FooV013, e013);

    expect(dec011).toBeInstanceOf(FooV011);
    expect(dec012).toBeInstanceOf(FooV012);
    expect(dec013).toBeInstanceOf(FooV013);

    expect(dec011).toStrictEqual(f011);
    expect(dec012).toStrictEqual(f012);
    expect(dec013).toStrictEqual(f013);

    // No funny games!
    expect(envelope.decrypt(FooV011, e012)).toBeNull();

    // 'struct' demonstrates that we don't need the whole class kaboodle either.
    // as long as the structure involved conforms to `Datagram`, it is
    // compatible with the envelope functions.
    const struct: Datagram<any> = {
      version: '0.1.1', // it lies about its version
      type: 'ddl://skiff/foo', // it lies about its type

      serialize(): Uint8Array {
        return _encoder.encode(
          JSON.stringify({
            a: 1,
            b: 2,
            c: [3],
            d: 'four',
            e: 'five',
            f: 'six', // it has extra data
          }),
        );
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      deserialize(_data: Uint8Array): any {
        return {
          a: 1,
          b: 2,
          c: [3],
          d: 'four',
          e: 'five',
          f: 'six',
        };
      },
    };

    const encStruct = envelope.encrypt(struct);
    const decStruct = envelope.decrypt(FooV011, encStruct);

    expect(decStruct).toBeInstanceOf(FooV011);
    expect(decStruct).not.toHaveProperty('d');
    // but 'd' (and 'e', and 'f') are not part of FooV011
  });
});
