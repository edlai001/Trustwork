const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Status numbers match the Solidity enum order
const S = { Open: 0, InProgress: 1, Submitted: 2, Disputed: 3, Completed: 4, Refunded: 5 };
const ONE = ethers.parseEther("1");

describe("TrustWork", () => {
  let c, client, freelancer, arbiter, stranger;

  beforeEach(async () => {
    [client, freelancer, arbiter, stranger] = await ethers.getSigners();
    c = await ethers.deployContract("TrustWork", [arbiter.address]);
    await c.connect(client).createJob("Build a logo", 3600, { value: ONE }); // job #1
  });

  it("1. Happy path: create -> accept -> submit -> approve (freelancer is paid)", async () => {
    await c.connect(freelancer).acceptJob(1);
    await c.connect(freelancer).submitWork(1, "https://drive/logo");
    await expect(c.connect(client).approveWork(1)).to.changeEtherBalance(freelancer, ONE);
    expect((await c.jobs(1)).status).to.equal(S.Completed);
  });

  it("2. Client cancels an open job and gets a refund", async () => {
    await expect(c.connect(client).cancelJob(1)).to.changeEtherBalance(client, ONE);
    expect((await c.jobs(1)).status).to.equal(S.Refunded);
  });

  it("3. Unauthorized: stranger cannot approve", async () => {
    await c.connect(freelancer).acceptJob(1);
    await c.connect(freelancer).submitWork(1, "x");
    await expect(c.connect(stranger).approveWork(1)).to.be.revertedWith("Only client");
  });

  it("4. Double payout is impossible", async () => {
    await c.connect(freelancer).acceptJob(1);
    await c.connect(freelancer).submitWork(1, "x");
    await c.connect(client).approveWork(1);
    await expect(c.connect(client).approveWork(1)).to.be.revertedWith("Wrong job status");
  });

  it("5. Unknown job ID reverts", async () => {
    await expect(c.connect(client).cancelJob(99)).to.be.revertedWith("Job not found");
  });

  it("6. Cannot submit work after the deadline", async () => {
    await c.connect(freelancer).acceptJob(1);
    await time.increase(3601);
    await expect(c.connect(freelancer).submitWork(1, "x")).to.be.revertedWith("Deadline passed");
  });

  it("7. Missed deadline: client claims refund (not before)", async () => {
    await c.connect(freelancer).acceptJob(1);
    await expect(c.connect(client).claimRefund(1)).to.be.revertedWith("Deadline not reached");
    await time.increase(3601);
    await expect(c.connect(client).claimRefund(1)).to.changeEtherBalance(client, ONE);
  });

  it("8. Dispute: only arbiter decides", async () => {
    await c.connect(freelancer).acceptJob(1);
    await c.connect(freelancer).submitWork(1, "x");
    await c.connect(client).raiseDispute(1);
    await expect(c.connect(client).resolveDispute(1, false)).to.be.revertedWith("Only arbiter");
    await expect(c.connect(arbiter).resolveDispute(1, true)).to.changeEtherBalance(freelancer, ONE);
  });

  it("9. Client cannot accept their own job", async () => {
    await expect(c.connect(client).acceptJob(1)).to.be.revertedWith("Client cannot accept own job");
  });
});
