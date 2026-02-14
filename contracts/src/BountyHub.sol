// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";

contract BountyHub is ReceiverTemplate {
    enum SubmissionStatus { Pending, Valid, Invalid }

    struct Project {
        address owner;
        uint256 bountyPool;
        uint256 maxPayoutPerBug;
        address targetContract;
        uint256 forkBlock;
        bool    active;
    }

    struct Submission {
        address auditor;
        uint256 projectId;
        bytes32 pocHash;
        string  pocURI;
        uint256 timestamp;
        SubmissionStatus status;
    }

    uint256 public nextProjectId;
    uint256 public nextSubmissionId;
    mapping(uint256 => Project) public projects;
    mapping(uint256 => Submission) public submissions;
    mapping(bytes32 => bool) public pocHashUsed;
    mapping(address => mapping(uint256 => uint256)) public lastSubmitTime;
    uint256 public constant COOLDOWN = 10 minutes;

    event PoCSubmitted(uint256 indexed submissionId, uint256 indexed projectId, address indexed auditor, bytes32 pocHash, string pocURI);
    event BountyPaid(uint256 indexed submissionId, address indexed auditor, uint256 amount);
    event ProjectRegistered(uint256 indexed projectId, address indexed owner);

    constructor(address _forwarderAddress) ReceiverTemplate(_forwarderAddress) {}

    function registerProject(address _targetContract, uint256 _maxPayoutPerBug, uint256 _forkBlock) external payable returns (uint256 projectId) {
        require(msg.value > 0, "Must deposit bounty");
        require(_targetContract != address(0), "Invalid target");
        projectId = nextProjectId++;
        projects[projectId] = Project({owner: msg.sender, bountyPool: msg.value, maxPayoutPerBug: _maxPayoutPerBug, targetContract: _targetContract, forkBlock: _forkBlock, active: true});
        emit ProjectRegistered(projectId, msg.sender);
    }

    function topUpBounty(uint256 _projectId) external payable {
        require(projects[_projectId].owner == msg.sender, "Not owner");
        projects[_projectId].bountyPool += msg.value;
    }

    function submitPoC(uint256 _projectId, bytes32 _pocHash, string calldata _pocURI) external returns (uint256 submissionId) {
        Project storage p = projects[_projectId];
        require(p.active, "Project not active");
        require(p.bountyPool > 0, "No bounty remaining");
        require(!pocHashUsed[_pocHash], "Duplicate PoC");
        require(block.timestamp >= lastSubmitTime[msg.sender][_projectId] + COOLDOWN, "Cooldown active");
        pocHashUsed[_pocHash] = true;
        lastSubmitTime[msg.sender][_projectId] = block.timestamp;
        submissionId = nextSubmissionId++;
        submissions[submissionId] = Submission({auditor: msg.sender, projectId: _projectId, pocHash: _pocHash, pocURI: _pocURI, timestamp: block.timestamp, status: SubmissionStatus.Pending});
        emit PoCSubmitted(submissionId, _projectId, msg.sender, _pocHash, _pocURI);
    }

    function _processReport(bytes calldata report) internal override {
        (uint256 submissionId, bool isValid, uint256 severityScore, uint256 payoutAmount) = abi.decode(report, (uint256, bool, uint256, uint256));
        Submission storage sub = submissions[submissionId];
        require(sub.status == SubmissionStatus.Pending, "Already processed");
        if (isValid) {
            sub.status = SubmissionStatus.Valid;
            Project storage p = projects[sub.projectId];
            uint256 payout = payoutAmount;
            if (payout > p.maxPayoutPerBug) payout = p.maxPayoutPerBug;
            if (payout > p.bountyPool) payout = p.bountyPool;
            p.bountyPool -= payout;
            (bool success, ) = sub.auditor.call{value: payout}("");
            require(success, "Transfer failed");
            emit BountyPaid(submissionId, sub.auditor, payout);
        } else {
            sub.status = SubmissionStatus.Invalid;
        }
    }
}
