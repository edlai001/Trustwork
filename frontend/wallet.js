// Shared helpers for both pages: MetaMask connection, network switching,
// status messages and sending transactions.

const CFG = window.TRUSTWORK_CONFIG;
const ABI = window.TRUSTWORK_ARTIFACT.abi;
const EXPLORER = CFG.network.blockExplorerUrls[0];
const $ = (id) => document.getElementById(id);

// Contract address: from config.js, or (only for you, right after deploying) from this browser.
function getContractAddress() {
  if (CFG.contractAddress) return CFG.contractAddress;
  try { return localStorage.getItem("trustwork.address") || ""; } catch { return ""; }
}

const shortAddr = (a) => a.slice(0, 6) + "…" + a.slice(-4);

// ---------- Messages ----------
// kind: "info" | "pending" | "ok" | "error"
function notify(text, kind = "info", txHash) {
  const box = $("notice");
  box.className = "notice " + kind;
  box.textContent = text;
  if (txHash) {
    const a = document.createElement("a");
    a.href = `${EXPLORER}/tx/${txHash}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "View on Etherscan";
    box.append(" ", a);
  }
  box.hidden = false;
}

// Turn ugly wallet/contract errors into short readable sentences.
function friendlyError(e) {
  if (e?.code === 4001 || e?.code === "ACTION_REJECTED") return "You rejected the request in MetaMask.";
  if (e?.code === "INSUFFICIENT_FUNDS") return "Not enough Sepolia ETH in this account to pay for the transaction.";
  return e?.reason || e?.shortMessage || e?.message || "Something went wrong.";
}

// ---------- Wallet + network ----------
function noMetaMaskMessage() {
  const onPhone = /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (onPhone) {
    const link = "https://metamask.app.link/dapp/" + location.href.replace(/^https?:\/\//, "");
    const box = $("notice");
    notify("On a phone, open this page inside the MetaMask app: ", "error");
    const a = document.createElement("a");
    a.href = link;
    a.textContent = "Open in MetaMask";
    box.append(a);
  } else {
    notify("MetaMask was not found. Install the MetaMask browser extension, then reload this page.", "error");
  }
}

// Ask MetaMask to switch to Sepolia (and add it if it is unknown).
async function ensureNetwork() {
  const current = await window.ethereum.request({ method: "eth_chainId" });
  if (current === CFG.network.chainId) return;
  notify(`Wrong network. Asking MetaMask to switch to ${CFG.network.chainName}…`, "pending");
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CFG.network.chainId }] });
  } catch (e) {
    if (e.code !== 4902) throw new Error(`Please switch MetaMask to the ${CFG.network.chainName} network.`);
    await window.ethereum.request({ method: "wallet_addEthereumChain", params: [CFG.network] });
  }
}

// Connect MetaMask, make sure we are on Sepolia, return { signer, address }.
async function connectWallet() {
  if (!window.ethereum) { noMetaMaskMessage(); return null; }
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    await ensureNetwork();
    const provider = new ethers.BrowserProvider(window.ethereum); // created AFTER switching network
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const balance = ethers.formatEther(await provider.getBalance(address));
    $("account").textContent = `${shortAddr(address)} · ${Number(balance).toFixed(4)} ETH`;
    $("account").hidden = false;
    $("connectBtn").hidden = true;
    return { signer, address, provider };
  } catch (e) {
    notify(friendlyError(e), "error");
    return null;
  }
}

// Reload when the user changes account or network in MetaMask, so the page is never out of date.
if (window.ethereum) {
  window.ethereum.on?.("chainChanged", () => location.reload());
  window.ethereum.on?.("accountsChanged", () => location.reload());
}

// Send a transaction and keep the user informed: confirm -> pending -> confirmed.
async function sendTx(label, makeTx) {
  try {
    notify(`${label}: please confirm in MetaMask…`, "pending");
    const tx = await makeTx();
    notify(`${label}: transaction pending, waiting for a block (about 15 s)…`, "pending", tx.hash);
    const receipt = await tx.wait();
    notify(`${label}: confirmed ✓`, "ok", tx.hash);
    return receipt;
  } catch (e) {
    notify(friendlyError(e), "error");
    return null;
  }
}
