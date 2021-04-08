// eslint-disable-next-line max-classes-per-file
import { Range } from 'semver';

const varint = require('varint');

const _encoder = new TextEncoder();
const _decoder = new TextDecoder();

interface Typed {
  // NOTE: until this is static, it must be defined as a 'getter' function on the class, and not a readonly constant.
  // Read-only constants only get assigned in the constructor, and `Object.create`, which is used to get access to this
  // value, does not invoke the constructor.
  type: string; // TODO: static
}

interface Versioned {
  version: string;
}

interface Serializable {
  serialize(): Uint8Array;
}

interface Deserializable<T> {
  // NOTE: until this is static, it must be defined with the traditional function syntax, and not as a captive lambda.
  // Captive lambdas only get assigned in the constructor, and `Object.create`, which is used to get access to these
  // pseudo-static functions, does not invoke the constructor.
  deserialize(data: Uint8Array, version?: string): T | null; // TODO: static
}

interface EncryptDatagram<T> {
  encrypt(obj: Datagram<T>, nonce: Uint8Array): TypedBytes;
}

interface DecryptDatagram<T> {
  decrypt(type: DatagramConstructor<T>, bytes: TypedBytes): T | null;
}

// Datagram is the minimum set of functions needed to serialize and deserialize a typed and versioned object.
export type Datagram<T> = Typed & Versioned & Serializable & Deserializable<T>;

// DatagramConstructor is a function which generates a new Datagram<T>
export type DatagramConstructor<T> = new (...any: any[]) => Datagram<T>;

// Envelope is the minimum set of functions needed to encrypt and decrypt a bytestream.
export type Envelope<T> = EncryptDatagram<T> & DecryptDatagram<T>;

// Wrapped is a type that encapsulates an arbitrary object and gives it typing and versioning semantics.
export type Wrapped<T> = Versioned & Typed & { data: T };

/**
 * AADMeta is a class that encapsulates the additional metadata included in these envelope implementations.
 */
export class AADMeta implements Datagram<AADMeta> {
  constructor(
    readonly version: string,
    readonly type: string,
    readonly nonce: Uint8Array,
  ) {}

  static unpack(
    data: Uint8Array,
  ): {
      metadata: AADMeta;
      rawMetadata: Uint8Array;
      content: Uint8Array;
    } | null {
    const header = extractVarintPrefixed({ bs: data.copyWithin(0, 0) });

    const rawMetadata = varintPrefixed(header);
    const content = data.slice(rawMetadata.length);

    const headerBuf = { bs: header.copyWithin(0, 0) };
    const metadata = Object.create(AADMeta.prototype).deserialize(header.copyWithin(0, 0));

    const metadataVersion = _decoder.decode(extractVarintPrefixed(headerBuf));
    if (metadataVersion !== AADMeta.METADATA_VERSION) {
      throw new Error('unrecognized metadata version');
    }

    return {
      metadata,
      rawMetadata,
      content,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  deserialize(data: Uint8Array): AADMeta | null {
    const buf = { bs: data };
    const metadataVersion = _decoder.decode(extractVarintPrefixed(buf));
    if (metadataVersion !== AADMeta.METADATA_VERSION) {
      return null;
    }
    const metadata = new AADMeta(
      _decoder.decode(extractVarintPrefixed(buf)),
      _decoder.decode(extractVarintPrefixed(buf)),
      extractVarintPrefixed(buf),
    );
    if (buf.bs.length !== 0) {
      throw new Error('unexpected additional content in header');
    }

    return metadata;
  }

  static readonly METADATA_VERSION = '0.1.0';

  serialize(): Uint8Array {
    /**
     * A serialized AAD header contains four pieces of information:
     *   version of the metadata format
     *   version of the encrypted object
     *   type name of the encrypted object
     *   nonce used for the encryption scheme
     *
     * It is composed of several varint-prefixed Uint8Arrays, which is then itself expressed as a
     * varint-prefixed byte array.
     *
     * It looks like this on the wire:
     *   NNxxxxxxxxxxxxxxxxxxxxxxxxx...
     *     AAxx...BBxx...CCxx...DDxx...
     *
     *   where AA, BB, CC, DD, and NN are varint-encoded (1-10 bytes long) and express the number of bytes following
     *   that indicator which comprise that field.
     *
     *   AAxxx is the prefixed metadata format version
     *   BBxxx is the prefixed object version
     *   CCxxx is the prefixed typename
     *   DDxxx is the prefixed nonce. Length is prefixed instead of static to allow for multiple envelope types.
     *
     *   and NNxxx is the prefixed length of those four strings concatenated together.
     *
     */
    const data: Uint8Array = concatUint8Arrays(
      varintPrefixed(_encoder.encode(AADMeta.METADATA_VERSION)),
      varintPrefixed(_encoder.encode(this.version)),
      varintPrefixed(_encoder.encode(this.type)),
      varintPrefixed(this.nonce),
    );

    return varintPrefixed(data);
  }
}

/**
 * TypedBytes wraps Uint8Array. It introduces a function that lets us inspect the header metadata.
 *
 * If the content being provided doesn't have the associated header, nonsense may be returned.
 */
export class TypedBytes {
  constructor(public readonly buf: Uint8Array) { }

  inspect(): AADMeta | null {
    const parsed = AADMeta.unpack(this.buf);

    if (parsed == null || parsed.metadata == null) {
      return null;
    }

    return parsed.metadata;
  }
}

/**
 * Concatenate several Uint8Arrays together.
 * Equivalent to calling `Uint8Array.of(...u8s[0], ...u8s[1], ...)` but shouldn't blow up the stack for large arrays.
 *
 * @param u8s some Uint8Arrays
 * @returns a Uint8Array
 */
export function concatUint8Arrays(...u8s: Uint8Array[]): Uint8Array {
  let totalLen = 0;
  u8s.forEach((elem) => { totalLen += elem.byteLength; });

  const ret: Uint8Array = new Uint8Array(totalLen);

  let index = 0;
  u8s.forEach((elem) => {
    ret.set(elem, index);
    index += elem.byteLength;
  });

  return ret;
}

/**
 * extractVarintPrefixed extracts a varint-prefixed sequence of bytes from the front of an array, and returns it.
 *
 * @param o - object containing a reference to a Uint8Array. Modifies this value in-place.
 */
export function extractVarintPrefixed(o: { bs: Uint8Array }): Uint8Array {
  // Extract a varint-prefixed value from the underlying byte array.
  // a varint is a multi-byte 7-bit encoding of a number representing how many of the following bytes
  // are a part of this field. The 8th bit represents whether or not the number is continued into the next byte.

  // For example, if we had 130 bytes of content that have been serialized with a leading varint prefix,
  // we would have 132 bytes of data. The first two bytes would encode the length of 130, and the rest is the content.

  const chunkLen = varint.decode(o.bs); // Extract the length of the chunk
  const chunkLenLen = varint.encodingLength(chunkLen); // Figure out how many bytes were used to express that length
  const chunk = o.bs.slice(chunkLenLen, chunkLen + chunkLenLen); // Extract that chunk

  // eslint-disable-next-line no-param-reassign
  o.bs = o.bs.slice(chunkLen + chunkLenLen);

  return chunk;
}

/**
 * varintPrefixed prepends the varint-encoded length of the provided Uint8Array to a copy of it, and returns it.
 *
 * @param data - a Uint8Array
 * @returns Uint8Array - a copy of `data` prepended with its length.
 */
export function varintPrefixed(data: Uint8Array): Uint8Array {
  return concatUint8Arrays(Uint8Array.from(varint.encode(data.length)), data);
}

/**
 * Wrapper is a factory-construction function which returns a new anonymous class that implements Datagram<T>.
 *
 * This can be used to bypass the explicit construction of an object that implements Datagram<T> for use with the AEAD
 * envelope functions.
 *
 * @param typeName - The serialized name of the type of the object being generated.
 * @param versionConstraint - A version validation filter that restricts the versions of the objects being used.
 *
 */
export function Wrapper<T>(
  typeName: string,
  versionConstraint: string | Range,
): DatagramConstructor<T> & { wrap(data: T, version: string): Datagram<T> } {
  const constraint = typeof versionConstraint === 'string'
    ? new Range(versionConstraint)
    : versionConstraint;
  return class implements Datagram<T> {
    // eslint-disable-next-line class-methods-use-this
    get type(): string {
      return typeName;
    }

    readonly data: Wrapped<T>;

    constructor(obj: T, readonly version: string) {
      if (!constraint.test(version)) {
        throw new Error(
          `invalid version string. ${version} not in ${constraint}`,
        );
      }
      this.data = { type: typeName, version, data: obj };
    }

    // eslint-disable-next-line class-methods-use-this
    deserialize(data: Uint8Array, version: string): T | null {
      const ret: Wrapped<T> | null = JSON.parse(_decoder.decode(data));
      if (ret == null || ret.type !== typeName || !constraint.test(version)) {
        return null;
      }
      return ret.data;
    }

    serialize(): Uint8Array {
      return _encoder.encode(JSON.stringify(this.data));
    }

    /**
     * 'wrap' encapsulates an arbitrary data object with the factory-provided type and caller-provided version.
     *
     * It's exactly the same as the constructor, but feels a bit more natural to call.
     *
     * @param data - the data being wrapped.
     * @param version - the version of the data being wrapped. Will be validated against the factory constraint.
     */
    static wrap(data: T, version: string): Datagram<T> {
      return new this(data, version);
    }
  };
}
