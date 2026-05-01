# PrivaDEX DarkPool Frontend

A minimal Next.js demo UI for the PrivaDEX DarkPool fhEVM matching engine.

## Features

- **Order Form**: Input bid price, ask price, and quantity
- **Match Results**: Display match status and quantity matched
- **Timing Breakdown**: Show cryptographic operation timings (ms):
  - Deserialization
  - Slot Blinding
  - Sign Polynomial Evaluation
  - Accumulation
  - Serialization
  - Total

## Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:3000`.

## API Endpoint

**POST /api/submit-order**

Request:
```json
{
  "bid": 100,
  "ask": 100,
  "qty": 10
}
```

Response:
```json
{
  "success": true,
  "match": true,
  "quantityMatched": 10,
  "timings": {
    "deserialization": 2.5,
    "slotBlind": 1.8,
    "signPoly": 9.2,
    "accumulate": 1.1,
    "serialization": 1.6,
    "total": 16.2
  }
}
```

## Matching Logic (Demo)

In the demo, orders match if the bid/ask spread is within 50 units. This simulates the encrypted matching engine's BFV equality check:
- If `|bid - ask| <= 50`, match succeeds with full quantity
- Otherwise, no match (quantity matched = 0)

## Production Integration

To integrate with the live C++ matching engine:

1. Add gRPC client setup to `/api/submit-order.ts` using `@grpc/grpc-js`
2. Marshal bid/ask/qty into the proto `MatchRequest` structure
3. Call `SubmitOrder` RPC to `localhost:50053`
4. Deserialize `MatchResponse.result_ciphertext` and timing data
5. Return results to the UI

## Deployment (Zama Riviera Testnet)

1. Update `hardhat.config.js` in root to point to fhEVM RPC
2. Deploy `DarkPoolSettlement.sol` to Riviera
3. Host frontend on a public URL (e.g., Vercel)
4. Set `SETTLEMENT_CONTRACT_ADDRESS` env var for contract integration
