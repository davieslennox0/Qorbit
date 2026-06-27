// Defaults for Arc testnet - see contracts/deployments/arc-testnet.json in the Qorbitpay repo.
export const DEFAULT_NETWORK = {
  rpcUrl: 'https://rpc.testnet.arc.network',
  chainId: 5042002,
  explorer: 'https://testnet.arcscan.app',
  routerAddress: '0xCEe1f311261Ffe460ef5060F94183320e74fD703',
  registryAddress: '0x3fbCdaD38f40d932A5574562BB72B9115c265093',
  verifierAddress: '0xca8FbCFb990A77B130939Ec5E0B98e4324fE0c79',
  billingAddress: '0xdF87E0c0cfcA0AEa1e899073c36F29Fd865B5e97',
  treasuryAddress: '0x7168493186654AD84Ef2dEfb78C773eeCB1BaFC8',
};

export const CATEGORY = {
  data: 0x01,
  compute: 0x02,
  storage: 0x04,
  all: 0x07,
};
