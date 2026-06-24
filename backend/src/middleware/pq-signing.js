import crypto from 'crypto';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { ethers } from 'ethers';
import { verifierContract } from '../services/contracts.js';
import { withWalletLock } from '../services/arc-chain.js';

const ALGORITHM = 'Dilithium2'; // ML-DSA-44, FIPS 204

// liboqs-node (the package literally named in the original spec) hasn't published a
// release in over a year, has no Node-22 prebuilt binaries, and would need a native
// liboqs C build on a disk-constrained box (~400MB free) - too fragile for this. We use
// @noble/post-quantum instead: pure JS/TS, audited, implements the same ML-DSA-44
// (Dilithium2) parameter set per FIPS 204, with byte sizes (1312-byte pubkey, 2420-byte
// signature) that match DilithiumVerifier.sol's PUBLIC_KEY_BYTES/SIGNATURE_BYTES exactly.
let cachedKeypair = null;

/// The relayer's ML-DSA keypair is derived deterministically from its ECDSA private key
/// (sha256("dilithium-seed:" + ecdsaPrivateKey)) so there's no separate PQ secret to
/// provision/rotate on this testnet relayer - it's reproducible from the same env var
/// that already guards fund custody.
function getPqKeypair(ecdsaPrivateKey) {
  if (cachedKeypair) return cachedKeypair;
  const seed = crypto.createHash('sha256').update(`dilithium-seed:${ecdsaPrivateKey}`).digest();
  cachedKeypair = ml_dsa44.keygen(seed);
  return cachedKeypair;
}

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

/// Dual-signs a payment authorization: ECDSA (via wallet.signMessage, the classical
/// signature - separate from, and in addition to, the ECDSA signature the relayer wallet
/// already puts on the settlement transaction itself) + Dilithium2 (via @noble/post-quantum)
/// over the same keccak256 message hash. Returns both signatures plus the headers x402
/// clients should see: X-Signature-PQ and X-PQ-Algorithm.
async function dualSignPayment(wallet, authorization) {
  const messageHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint256', 'bytes32', 'uint256'],
      [authorization.from, authorization.to, authorization.value, authorization.memoHash, authorization.nonce]
    )
  );

  const ecdsaSignature = await wallet.signMessage(ethers.getBytes(messageHash));

  const { publicKey, secretKey } = getPqKeypair(wallet.privateKey);
  const messageHashBytes = ethers.getBytes(messageHash);
  const pqSignature = ml_dsa44.sign(messageHashBytes, secretKey);

  return {
    messageHash,
    ecdsaSignature,
    pqSignature: toBase64(pqSignature),
    pqPublicKey: toBase64(publicKey),
    algorithm: ALGORITHM,
    headers: {
      'X-Signature-PQ': toBase64(pqSignature),
      'X-PQ-Algorithm': ALGORITHM,
    },
  };
}

function verifyPqSignature(messageHash, pqSignatureB64, pqPublicKeyB64) {
  const sig = Buffer.from(pqSignatureB64, 'base64');
  const pub = Buffer.from(pqPublicKeyB64, 'base64');
  return ml_dsa44.verify(sig, ethers.getBytes(messageHash), pub);
}

/// Publishes the off-chain ML-DSA verification result on-chain via DilithiumVerifier, for
/// payments above PQ_ATTESTATION_THRESHOLD. Registers the relayer's public key hash once
/// (idempotent - cheap to re-check) then attests the specific message hash.
async function attestOnChain(wallet, { messageHash, pqPublicKeyB64, valid }) {
  const verifier = verifierContract(wallet);
  const pubKeyHash = ethers.keccak256(Buffer.from(pqPublicKeyB64, 'base64'));

  const registered = await verifier.registeredPubKeyHash(wallet.address);
  if (registered === ethers.ZeroHash) {
    const tx = await withWalletLock((txNonce) => verifier.registerPublicKey(pubKeyHash, { nonce: txNonce }));
    await tx.wait();
  }

  const tx = await withWalletLock((txNonce) =>
    verifier.attestSignature(messageHash, pubKeyHash, valid, { nonce: txNonce })
  );
  const receipt = await tx.wait();
  return { tx_hash: tx.hash, block_number: receipt.blockNumber, pubKeyHash };
}

export { dualSignPayment, verifyPqSignature, attestOnChain, getPqKeypair, ALGORITHM };
