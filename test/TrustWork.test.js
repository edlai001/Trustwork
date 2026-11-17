const { expect } = require("chai");
const { ethers } = require("hardhat");

// Same order as the Solidity enum
const Status = { Open: 0, InProgress: 1, Submitted: 2, Completed: 3, Cancelled: 4 };
const ONE_ETH = ethers.parseEther("1");

describe("TrustWork", () => {
  let contract, client, freelancer, stranger;

  // Before each test: fresh contract + job #1 worth 1 ETH
  beforeEach(async () => {
    [client, freelancer, stranger] = await ethers.getSigners();
    contract = await ethers.deployContract("TrustWork");
    await contract.connect(client).createJob("Build a logo", { value: ONE_ETH });
  });

  it("1. Creating a job locks the ETH and emits JobCreated", async () => {
    await expect(contract.connect(client).createJob("Second job", { value: ONE_ETH }))
      .to.emit(contract, "JobCreated").withArgs(2, client.address, ONE_ETH);
    const job = await contract.jobs(1);
    expect(job.client).to.equal(client.address);
    expect(job.amount).to.equal(ONE_ETH);
    expect(job.status).to.equal(Status.Open);
    expect(await ethers.provider.getBalance(contract)).to.equal(ONE_ETH * 2n);
  });

  it("2. Happy path: accept -> submit -> approve pays the freelancer", async () => {
    await contract.connect(freelancer).acceptJob(1);
    await contract.connect(freelancer).submitWork(1, "https://drive/logo");
    const tx = contract.connect(client).approveWork(1);
    await expect(tx).to.changeEtherBalance(freelancer, ONE_ETH);
    await expect(tx).to.emit(contract, "JobPaid").withArgs(1, freelancer.address, ONE_ETH);
    expect((await contract.jobs(1)).status).to.equal(Status.Completed);
    expect(await contract.totalEarned(freelancer.address)).to.equal(ONE_ETH);
  });

  it("3. Client can cancel an open job and gets the ETH back", async () => {
    await expect(contract.connect(client).cancelJob(1)).to.changeEtherBalance(client, ONE_ETH);
    expect((await contract.jobs(1)).status).to.equal(Status.Cancelled);
  });

  it("4. Job without ETH is rejected", async () => {
    await expect(contract.createJob("Free work")).to.be.revertedWith("Must deposit ETH");
  });

  it("5. Access control: only the client can approve or cancel", async () => {
    await expect(contract.connect(stranger).cancelJob(1)).to.be.revertedWith("Only client");
    await contract.connect(freelancer).acceptJob(1);
    await contract.connect(freelancer).submitWork(1, "x");
    await expect(contract.connect(freelancer).approveWork(1)).to.be.revertedWith("Only client");
  });

  it("6. Access control: only the freelancer can submit work", async () => {
    await contract.connect(freelancer).acceptJob(1);
    await expect(contract.connect(stranger).submitWork(1, "x")).to.be.revertedWith("Only freelancer");
  });

  it("7. Client cannot accept their own job", async () => {
    await expect(contract.connect(client).acceptJob(1)).to.be.revertedWith("Client cannot accept own job");
  });

  it("8. State machine: steps cannot be skipped or repeated (no double payment)", async () => {
    await expect(contract.connect(client).approveWork(1)).to.be.revertedWith("Wrong job status"); // not submitted yet
    await contract.connect(freelancer).acceptJob(1);
    await expect(contract.connect(client).cancelJob(1)).to.be.revertedWith("Wrong job status"); // already taken
    await contract.connect(freelancer).submitWork(1, "x");
    await contract.connect(client).approveWork(1);
    await expect(contract.connect(client).approveWork(1)).to.be.revertedWith("Wrong job status"); // paid already
  });

  it("9. Unknown job ID is rejected", async () => {
    await expect(contract.acceptJob(99)).to.be.revertedWith("Job not found");
  });
});
