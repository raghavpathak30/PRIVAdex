// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.20;

import "fhevm/lib/TFHE.sol";

contract PrivaDEXDarkPoolFHEVM {
    struct Order {
        euint32 bid;
        euint32 ask;
        euint32 qty;
        address trader;
    }

    address public settler;
    Order[] private orders;
    mapping(bytes32 => bool) public settledRequestIds;

    event OrderSubmitted(uint256 indexed order_id, address indexed trader);
    event MatchExecuted(bytes32 indexed request_id, euint32 match_qty);

    modifier onlyAuthorizedSettler() {
        require(msg.sender == settler, "only authorized settler");
        _;
    }

    constructor() {
        settler = msg.sender;
    }

    function setSettler(address newSettler) external onlyAuthorizedSettler {
        require(newSettler != address(0), "settler required");
        settler = newSettler;
    }

    // Encrypted order submission path: ciphertext handles are converted with TFHE.asEuint32().
    function submitOrder(
        einput bidInput,
        einput askInput,
        einput qtyInput,
        bytes calldata inputProof
    ) external returns (uint256 orderId) {
        euint32 bid = TFHE.asEuint32(bidInput, inputProof);
        euint32 ask = TFHE.asEuint32(askInput, inputProof);
        euint32 qty = TFHE.asEuint32(qtyInput, inputProof);

        orderId = orders.length;
        orders.push(Order({bid: bid, ask: ask, qty: qty, trader: msg.sender}));
        emit OrderSubmitted(orderId, msg.sender);
    }

    // BFV equality translation target:
    // matched = (orderA.bid == orderB.ask) via TFHE.eq().
    function matchOrders(
        uint256 orderAId,
        uint256 orderBId,
        bytes32 request_id
    ) external onlyAuthorizedSettler {
        require(!settledRequestIds[request_id], "duplicate request_id");
        require(orderAId < orders.length, "orderA out of range");
        require(orderBId < orders.length, "orderB out of range");

        Order storage orderA = orders[orderAId];
        Order storage orderB = orders[orderBId];

        ebool matched = TFHE.eq(orderA.bid, orderB.ask);
        euint32 match_qty = TFHE.select(matched, orderA.qty, TFHE.asEuint32(0));

        settledRequestIds[request_id] = true;
        emit MatchExecuted(request_id, match_qty);
    }

    function totalOrders() external view returns (uint256) {
        return orders.length;
    }
}
