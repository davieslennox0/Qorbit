import crypto from 'crypto';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest();
}

function buildLayers(leaves) {
  const layers = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : current[i];
      next.push(sha256(Buffer.concat([left, right])));
    }
    layers.push(next);
    current = next;
  }
  return layers;
}

function getRoot(layers) {
  return layers[layers.length - 1][0];
}

function getProof(layers, index) {
  const proof = [];
  let idx = index;
  for (let level = 0; level < layers.length - 1; level++) {
    const layer = layers[level];
    const isRightNode = idx % 2 === 1;
    const pairIndex = isRightNode ? idx - 1 : idx + 1;
    const sibling = pairIndex < layer.length ? layer[pairIndex] : layer[idx];
    proof.push({ position: isRightNode ? 'left' : 'right', hash: sibling.toString('hex') });
    idx = Math.floor(idx / 2);
  }
  return proof;
}

function verifyProof(leafHex, proof, rootHex) {
  let computed = Buffer.from(leafHex, 'hex');
  for (const step of proof) {
    const sibling = Buffer.from(step.hash, 'hex');
    computed = step.position === 'left' ? sha256(Buffer.concat([sibling, computed])) : sha256(Buffer.concat([computed, sibling]));
  }
  return computed.toString('hex') === rootHex.replace(/^0x/, '');
}

export { sha256, buildLayers, getRoot, getProof, verifyProof };
