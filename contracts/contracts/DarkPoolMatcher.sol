// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.26;

import { FHE, euint64, externalEuint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DarkPoolMatcher is ZamaEthereumConfig {
    struct EncryptedOrder {
        euint64 price;
        euint64 quantity;
        address trader;
        bool exists;
        bool matched;
    }

    mapping(bytes32 => EncryptedOrder) private orders;
    mapping(bytes32 => ebool) private matchResults;
    mapping(bytes32 => euint64) private settledQuantities;

    event OrderSubmitted(bytes32 indexed orderId, address indexed trader);
    event MatchAttempted(bytes32 indexed bidId, bytes32 indexed askId);
    event MatchSettled(bytes32 indexed bidId, bytes32 indexed askId);

    function submitOrder(
        bytes32 orderId,
        externalEuint64 encryptedPrice,
        externalEuint64 encryptedQty,
        bytes calldata inputProof
    ) external {
        require(!orders[orderId].exists, "Order already exists");

        euint64 price = FHE.fromExternal(encryptedPrice, inputProof);
        euint64 qty   = FHE.fromExternal(encryptedQty,   inputProof);

        FHE.allowThis(price);
        FHE.allowThis(qty);
        FHE.allow(price, msg.sender);
        FHE.allow(qty,   msg.sender);

        orders[orderId] = EncryptedOrder({
            price:    price,
            quantity: qty,
            trader:   msg.sender,
            exists:   true,
            matched:  false
        });

        emit OrderSubmitted(orderId, msg.sender);
    }

    function tryMatch(bytes32 bidId, bytes32 askId) external {
        require(orders[bidId].exists && orders[askId].exists, "Order not found");
        require(!orders[bidId].matched && !orders[askId].matched, "Already matched");
        require(orders[bidId].trader != orders[askId].trader, "Self-match");

        EncryptedOrder storage bid = orders[bidId];
        EncryptedOrder storage ask = orders[askId];

        ebool priceMatch = FHE.eq(bid.price, ask.price);

        euint64 minQty = FHE.select(
            FHE.le(bid.quantity, ask.quantity),
            bid.quantity,
            ask.quantity
        );
        euint64 settledQty = FHE.select(priceMatch, minQty, FHE.asEuint64(0));

        matchResults[bidId]      = priceMatch;
        settledQuantities[bidId] = settledQty;

        FHE.allowThis(priceMatch);
        FHE.allowThis(settledQty);
        FHE.allow(priceMatch, bid.trader);
        FHE.allow(priceMatch, ask.trader);
        FHE.allow(settledQty, bid.trader);
        FHE.allow(settledQty, ask.trader);

        emit MatchAttempted(bidId, askId);
        emit MatchSettled(bidId, askId);
    }

    function requestDecryption(bytes32 bidId) external {
        require(msg.sender == orders[bidId].trader, "Not your order");
        FHE.makePubliclyDecryptable(matchResults[bidId]);
        FHE.makePubliclyDecryptable(settledQuantities[bidId]);
    }

    function getOrder(bytes32 orderId) external view returns (address trader, bool exists, bool matched) {
        EncryptedOrder storage o = orders[orderId];
        return (o.trader, o.exists, o.matched);
    }
}
