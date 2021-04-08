// eslint-disable-next-line max-classes-per-file
import { ChaCha20Poly1305, NONCE_LENGTH } from '@stablelib/chacha20poly1305';
import { randomBytes } from 'crypto';
import {
  AADMeta, concatUint8Arrays,
  Datagram,
  DatagramConstructor,
  Envelope,
  TypedBytes
} from '../common/common';

/**
 * TaggedSecretBox is an implementation of nacl.secretbox, but additionally includes the version and type information
 * of the encrypted content in the AD headers.
 */
class TaggedSecretBox implements Envelope<any> {
  private readonly key: ChaCha20Poly1305;

  constructor(keyBytes: Uint8Array) {
    this.key = new ChaCha20Poly1305(keyBytes);
  }

  encrypt<T>(
    obj: Datagram<T>,
    nonce: Uint8Array = randomBytes(NONCE_LENGTH)
  ): TypedBytes {
    const aad: AADMeta = new AADMeta(obj.version, obj.type, nonce);
    const aadSerialized = aad.serialize();

    return new TypedBytes(concatUint8Arrays(
      aadSerialized,
      this.key.seal(nonce, obj.serialize(), aadSerialized)
    ));
  }

  decrypt<T>(type: DatagramConstructor<T>, typedBytes: TypedBytes): T | null {
    const unpacked = AADMeta.unpack(typedBytes.buf);
    if (unpacked == null || unpacked.metadata == null) {
      return null;
    }
    const decrypted: Uint8Array | null = this.key.open(
      unpacked.metadata.nonce,
      unpacked.content,
      unpacked.rawMetadata
    );
    if (!decrypted) {
      return null;
    }
    const obj: Datagram<T> = Object.create(type.prototype); // ideally, these methods should be static. see NOTEs.
    const candidate = obj.deserialize(decrypted, unpacked.metadata.version);
    return obj.type === unpacked.metadata.type ? candidate : null;
  }
}

export default TaggedSecretBox;
