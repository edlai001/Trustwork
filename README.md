# TrustWork - run it in 5 steps
Needs Node.js 18+ and the MetaMask browser extension.

1. `npm install`
2. `npx hardhat test`            -> runs the 9 test scenarios
3. `npx hardhat node`            -> starts a local blockchain (leave it running; it prints 20 test accounts + private keys)
4. In a 2nd terminal: `npx hardhat run scripts/deploy.js --network localhost` -> prints the contract address
5. MetaMask: add network RPC `http://127.0.0.1:8545`, chain ID `31337`. Import 3 test accounts from step 3:
   account #0 = client, #1 = freelancer, #2 = arbiter.
   Open `frontend/index.html` in the browser, paste the contract address, click Connect.
   Switch MetaMask account to play each role.
