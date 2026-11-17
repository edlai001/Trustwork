const { ethers } = require("hardhat");
async function main() {
  const [, , arbiter] = await ethers.getSigners(); // account #2 is the arbiter
  const c = await ethers.deployContract("TrustWork", [arbiter.address]);
  await c.waitForDeployment();
  console.log("TrustWork deployed to:", await c.getAddress());
  console.log("Arbiter is account #2:", arbiter.address);
}
main().catch((e) => { console.error(e); process.exit(1); });
