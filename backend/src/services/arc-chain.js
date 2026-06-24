import 'dotenv/config';
import { ethers } from 'ethers';

const RPC_URL = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network';
const CHAIN_ID = Number(process.env.ARC_TESTNET_CHAIN_ID || 5042002);
const EXPLORER = process.env.ARC_TESTNET_EXPLORER || 'https://testnet.arcscan.app';

const provider = new ethers.JsonRpcProvider(RPC_URL, {
  chainId: CHAIN_ID,
  name: 'arc-testnet',
});

function getWallet() {
  const key = process.env.ARC_TEST_WALLET_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      'ARC_TEST_WALLET_PRIVATE_KEY is not set. Run `node src/services/arc-chain.js generate` to create one.'
    );
  }
  return new ethers.Wallet(key, provider);
}

function generateWallet() {
  return ethers.Wallet.createRandom();
}

// The relayer wallet is shared across concurrent requests. Letting ethers auto-fill the
// nonce (it reads the RPC's "pending" tx count at send time) races under concurrency: the
// node's pending-count can lag behind a just-submitted tx, so two sends in close succession
// can both compute the same nonce. Instead we track the next nonce locally and hand it to
// each call explicitly; `fn` receives it and must pass it through as a tx override.
let sendQueue = Promise.resolve();
let nextNonce = null;

async function reserveNonce() {
  if (nextNonce === null) {
    nextNonce = await provider.getTransactionCount(getWallet().address, 'pending');
  }
  const nonce = nextNonce;
  nextNonce += 1;
  return nonce;
}

// The local nonce cache (reserveNonce) drifts from the chain if anything outside this
// queue consumes the wallet's nonce (a dropped tx, a manual send, a long idle period after
// which the RPC's pending-count view changes). Detect that drift via the RPC's "nonce too
// low/already known/expired" errors and resync once before giving up.
function isNonceDriftError(err) {
  const msg = String(err?.message || err);
  return (
    err?.code === 'NONCE_EXPIRED' ||
    /nonce too low|nonce has already been used|already known/i.test(msg)
  );
}

function withWalletLock(fn) {
  const run = sendQueue.then(async () => {
    const nonce = await reserveNonce();
    try {
      return await fn(nonce);
    } catch (err) {
      if (!isNonceDriftError(err)) throw err;
      nextNonce = null;
      const freshNonce = await reserveNonce();
      return fn(freshNonce);
    }
  });
  sendQueue = run.then(() => {}, () => {});
  return run;
}

async function getNetworkInfo() {
  const network = await provider.getNetwork();
  const blockNumber = await provider.getBlockNumber();
  return { chainId: Number(network.chainId), name: network.name, blockNumber };
}

async function getBalance(address) {
  return provider.getBalance(address);
}

async function sendTestTransaction(toAddress, amount = '0.0001') {
  const wallet = getWallet();
  const to = toAddress || wallet.address;
  const tx = await wallet.sendTransaction({
    to,
    value: ethers.parseEther(amount),
  });
  const receipt = await tx.wait();
  return { tx, receipt, explorerUrl: `${EXPLORER}/tx/${tx.hash}` };
}

async function main() {
  const cmd = process.argv[2];

  if (cmd === 'generate') {
    const wallet = generateWallet();
    console.log('New Arc testnet wallet generated:');
    console.log(`  Address:     ${wallet.address}`);
    console.log(`  Private key: ${wallet.privateKey}`);
    console.log('\nFund it at https://faucet.circle.com (select Arc Testnet), then');
    console.log('set ARC_TEST_WALLET_PRIVATE_KEY in backend/.env to the private key above.');
    return;
  }

  console.log(`Connecting to Arc testnet at ${RPC_URL} ...`);
  const network = await getNetworkInfo();
  console.log(`Connected. chainId=${network.chainId} block=${network.blockNumber}`);

  const wallet = getWallet();
  const balance = await getBalance(wallet.address);
  console.log(`Wallet:  ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} (native gas token)`);

  if (balance === 0n) {
    console.log('\nWallet has no funds. Fund it at https://faucet.circle.com (select Arc Testnet) and re-run.');
    return;
  }

  console.log('\nSending test transaction (self-transfer, 0.0001 native token)...');
  const { tx, receipt, explorerUrl } = await sendTestTransaction();
  console.log(`Tx sent:      ${tx.hash}`);
  console.log(`Confirmed in block ${receipt.blockNumber} (status: ${receipt.status === 1 ? 'success' : 'failed'})`);
  console.log(`View on explorer: ${explorerUrl}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('arc-chain error:', err.message || err);
    process.exit(1);
  });
}

export { provider, getWallet, generateWallet, getNetworkInfo, getBalance, sendTestTransaction, withWalletLock, RPC_URL, CHAIN_ID, EXPLORER };
