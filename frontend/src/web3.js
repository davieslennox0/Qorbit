import { ethers } from 'ethers';

const CHAIN_ID = 5042002;
const CHAIN_HEX = '0x' + CHAIN_ID.toString(16);

export async function getSigner() {
  if (!window.ethereum) throw new Error('No wallet found — install MetaMask.');
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  await _ensureArc();
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}

async function _ensureArc() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_HEX }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CHAIN_HEX,
          chainName: 'Arc Testnet',
          rpcUrls: ['https://rpc.testnet.arc.network'],
          blockExplorerUrls: ['https://testnet.arcscan.app'],
          nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
        }],
      });
    } else {
      throw err;
    }
  }
}
