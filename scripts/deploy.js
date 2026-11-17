// Local deploy (Hardhat node). For Sepolia use the website's Deploy page instead,
// so your private key never has to be stored in a file.
const { ethers } = require("hardhat");

async function main() {
  const contract = await ethers.deployContract("TrustWork");
  await contract.waitForDeployment();
  console.log("TrustWork deployed to:", await contract.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
