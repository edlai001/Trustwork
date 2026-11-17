// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TrustWork - freelance escrow
/// IDEA: A client locks ETH in the contract. The freelancer only gets paid
/// when the client approves the work (or the arbiter rules for the freelancer).
/// Nobody has to trust anybody: the CODE holds the money.
contract TrustWork {
    // ---------- DATA ----------
    // The life of a job. Completed and Refunded are FINAL (terminal).
    enum Status { Open, InProgress, Submitted, Disputed, Completed, Refunded }

    struct Job {
        address client;      // who pays
        address freelancer;  // who works (empty until someone accepts)
        uint256 amount;      // ETH locked in escrow (in wei)
        uint256 deadline;    // unix time: work must be submitted before this
        Status status;
        string description;
        string workLink;     // proof of work (URL / hash), set on submit
    }

    address public immutable arbiter; // neutral judge, set once at deploy
    uint256 public jobCount;
    mapping(uint256 => Job) public jobs; // jobId => Job (history is never deleted)

    // ---------- EVENTS (audit trail) ----------
    event JobCreated(uint256 indexed id, address indexed client, uint256 amount, uint256 deadline);
    event JobAccepted(uint256 indexed id, address indexed freelancer);
    event WorkSubmitted(uint256 indexed id, string workLink);
    event DisputeRaised(uint256 indexed id, address indexed by);
    event JobCompleted(uint256 indexed id, address indexed freelancer, uint256 amount);
    event JobRefunded(uint256 indexed id, address indexed client, uint256 amount);

    constructor(address _arbiter) {
        require(_arbiter != address(0), "Arbiter required");
        arbiter = _arbiter;
    }

    // ---------- MODIFIERS (reusable checks) ----------
    modifier jobExists(uint256 id) {
        require(id > 0 && id <= jobCount, "Job not found");
        _;
    }
    modifier onlyClient(uint256 id) {
        require(msg.sender == jobs[id].client, "Only client");
        _;
    }
    modifier onlyFreelancer(uint256 id) {
        require(msg.sender == jobs[id].freelancer, "Only freelancer");
        _;
    }
    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Only arbiter");
        _;
    }
    modifier inStatus(uint256 id, Status s) {
        require(jobs[id].status == s, "Wrong job status");
        _;
    }

    // ---------- ACTIONS ----------
    /// Client creates a job and locks ETH (msg.value) in the contract.
    function createJob(string calldata description, uint256 durationSeconds) external payable returns (uint256) {
        require(msg.value > 0, "Must deposit ETH");
        require(durationSeconds > 0, "Invalid duration");
        jobCount++;
        jobs[jobCount] = Job({
            client: msg.sender,
            freelancer: address(0),
            amount: msg.value,
            deadline: block.timestamp + durationSeconds,
            status: Status.Open,
            description: description,
            workLink: ""
        });
        emit JobCreated(jobCount, msg.sender, msg.value, block.timestamp + durationSeconds);
        return jobCount;
    }

    /// Freelancer takes an open job. Open -> InProgress
    function acceptJob(uint256 id) external jobExists(id) inStatus(id, Status.Open) {
        Job storage j = jobs[id];
        require(msg.sender != j.client, "Client cannot accept own job");
        require(block.timestamp < j.deadline, "Deadline passed");
        j.freelancer = msg.sender;
        j.status = Status.InProgress;
        emit JobAccepted(id, msg.sender);
    }

    /// Freelancer hands in the work. InProgress -> Submitted
    function submitWork(uint256 id, string calldata workLink)
        external jobExists(id) onlyFreelancer(id) inStatus(id, Status.InProgress)
    {
        require(block.timestamp <= jobs[id].deadline, "Deadline passed");
        jobs[id].workLink = workLink;
        jobs[id].status = Status.Submitted;
        emit WorkSubmitted(id, workLink);
    }

    /// Client is happy -> freelancer is paid. Submitted -> Completed
    function approveWork(uint256 id)
        external jobExists(id) onlyClient(id) inStatus(id, Status.Submitted)
    {
        _payFreelancer(id);
    }

    /// Client cancels before anyone accepted. Open -> Refunded
    function cancelJob(uint256 id)
        external jobExists(id) onlyClient(id) inStatus(id, Status.Open)
    {
        _refundClient(id);
    }

    /// Freelancer missed the deadline -> client gets money back. InProgress -> Refunded
    function claimRefund(uint256 id)
        external jobExists(id) onlyClient(id) inStatus(id, Status.InProgress)
    {
        require(block.timestamp > jobs[id].deadline, "Deadline not reached");
        _refundClient(id);
    }

    /// Client or freelancer disagrees -> the arbiter must decide. Submitted -> Disputed
    function raiseDispute(uint256 id) external jobExists(id) inStatus(id, Status.Submitted) {
        require(msg.sender == jobs[id].client || msg.sender == jobs[id].freelancer, "Not a party");
        jobs[id].status = Status.Disputed;
        emit DisputeRaised(id, msg.sender);
    }

    /// Arbiter decides who gets the money. Disputed -> Completed or Refunded
    function resolveDispute(uint256 id, bool payFreelancer)
        external jobExists(id) onlyArbiter inStatus(id, Status.Disputed)
    {
        if (payFreelancer) _payFreelancer(id);
        else _refundClient(id);
    }

    // ---------- INTERNAL PAYMENT (checks-effects-interactions) ----------
    function _payFreelancer(uint256 id) internal {
        Job storage j = jobs[id];
        uint256 amount = j.amount;
        j.status = Status.Completed; // EFFECT first (blocks double payout / reentrancy)
        j.amount = 0;
        (bool ok, ) = j.freelancer.call{value: amount}(""); // INTERACTION last
        require(ok, "Transfer failed");
        emit JobCompleted(id, j.freelancer, amount);
    }

    function _refundClient(uint256 id) internal {
        Job storage j = jobs[id];
        uint256 amount = j.amount;
        j.status = Status.Refunded;
        j.amount = 0;
        (bool ok, ) = j.client.call{value: amount}("");
        require(ok, "Transfer failed");
        emit JobRefunded(id, j.client, amount);
    }
}
