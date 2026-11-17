// Website settings. Safe to publish: there are NO secrets here.
window.TRUSTWORK_CONFIG = {
  // Paste the address shown on the Deploy page here, then push to GitHub.
  contractAddress: "0xe98610A9825518D9E3144A48f36d83B29F8eD97f",

  // The network the app uses (Sepolia testnet). MetaMask is asked to switch to it.
  network: {
    chainId: "0xaa36a7", // 11155111 in hex
    chainName: "Sepolia",
    nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
  },
};
