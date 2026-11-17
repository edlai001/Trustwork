// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TrustWork - a simple freelance escrow
/// A client locks ETH in this contract when creating a job.
/// The freelancer is paid automatically when the client approves the work.
/// Nobody holds the money except the contract code itself.
contract TrustWork {
    // ENUM used as a STATE MACHINE: every job moves forward through these steps.
    //   Open -> InProgress -> Submitted -> Completed
    //   Open -> Cancelled
    enum Status { Open, InProgress, Submitted, Completed, Cancelled }

    // STRUCT: groups all data that belongs to one job.
    struct Job {
        address client;      // who created the job and paid
        address freelancer;  // who accepted the job (empty at first)
        uint256 amount;      // ETH locked in escrow, in wei
        Status status;       // current step in the state machine
        string description;  // what needs to be done
        string workLink;     // link to the finished work
    }

    // MAPPINGS: key -> value storage.
    uint256 public jobCount;                          // number of jobs created (IDs start at 1)
    mapping(uint256 => Job) public jobs;              // job ID -> job data
    mapping(address => uint256) public totalEarned;   // freelancer -> total ETH earned

    // EVENTS: a public log of everything that happens (the frontend can read them).
    event JobCreated(uint256 indexed id, address indexed client, uint256 amount);
    event JobAccepted(uint256 indexed id, address indexed freelancer);
    event WorkSubmitted(uint256 indexed id, string workLink);
    event JobPaid(uint256 indexed id, address indexed freelancer, uint256 amount);
    event JobCancelled(uint256 indexed id);

    // MODIFIERS: reusable checks that run before a function body (the "_;").
    modifier jobExists(uint256 id) {
        require(id > 0 && id <= jobCount, "Job not found");
        _;
    }

    // Access control: only the job's client may call.
    modifier onlyClient(uint256 id) {
        require(msg.sender == jobs[id].client, "Only client");
        _;
    }

    // Access control: only the job's freelancer may call.
    modifier onlyFreelancer(uint256 id) {
        require(msg.sender == jobs[id].freelancer, "Only freelancer");
        _;
    }

    // State machine guard: the job must be in the expected step.
    modifier inStatus(uint256 id, Status expected) {
        require(jobs[id].status == expected, "Wrong job status");
        _;
    }

    /// Client creates a job and locks the ETH sent with the transaction.
    function createJob(string calldata description) external payable {
        require(msg.value > 0, "Must deposit ETH");
        jobCount++;
        Job storage job = jobs[jobCount];
        job.client = msg.sender;
        job.amount = msg.value;
        job.description = description;
        job.status = Status.Open;
        emit JobCreated(jobCount, msg.sender, msg.value);
    }

    /// Any other address can take an open job.  Open -> InProgress
    function acceptJob(uint256 id) external jobExists(id) inStatus(id, Status.Open) {
        require(msg.sender != jobs[id].client, "Client cannot accept own job");
        jobs[id].freelancer = msg.sender;
        jobs[id].status = Status.InProgress;
        emit JobAccepted(id, msg.sender);
    }

    /// Freelancer hands in the work.  InProgress -> Submitted
    function submitWork(uint256 id, string calldata workLink)
        external jobExists(id) onlyFreelancer(id) inStatus(id, Status.InProgress)
    {
        jobs[id].workLink = workLink;
        jobs[id].status = Status.Submitted;
        emit WorkSubmitted(id, workLink);
    }

    /// Client approves; the escrowed ETH goes to the freelancer.  Submitted -> Completed
    function approveWork(uint256 id)
        external jobExists(id) onlyClient(id) inStatus(id, Status.Submitted)
    {
        Job storage job = jobs[id];
        uint256 amount = job.amount;
        // Update state BEFORE sending ETH, so the job can never be paid twice.
        job.status = Status.Completed;
        job.amount = 0;
        totalEarned[job.freelancer] += amount;
        (bool ok, ) = job.freelancer.call{value: amount}("");
        require(ok, "Transfer failed");
        emit JobPaid(id, job.freelancer, amount);
    }

    /// Client cancels a job nobody accepted yet and gets the ETH back.  Open -> Cancelled
    function cancelJob(uint256 id)
        external jobExists(id) onlyClient(id) inStatus(id, Status.Open)
    {
        Job storage job = jobs[id];
        uint256 amount = job.amount;
        job.status = Status.Cancelled;
        job.amount = 0;
        (bool ok, ) = job.client.call{value: amount}("");
        require(ok, "Transfer failed");
        emit JobCancelled(id);
    }
}
