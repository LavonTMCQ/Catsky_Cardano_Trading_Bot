# Minswap SDK Debugging Guide

## Common Issues and Solutions

### 1. Datum Creation Errors

#### Error Message:
```
Error: No datum set. Script output becomes unspendable without datum.
```

#### Cause:
Using standard Lucid initialization instead of Minswap SDK helpers.

#### Solution:
```javascript
// ❌ DON'T DO THIS
const lucid = await Lucid.new(provider, network);

// ✅ DO THIS INSTEAD
import { getBackendBlockfrostLucidInstance } from "@minswap/sdk";

const lucid = await getBackendBlockfrostLucidInstance(
  NetworkId.MAINNET,
  projectId,
  blockfrostUrl,
  address
);
```

### 2. Transaction Signing Issues

#### Error Message:
```
TypeError: tx.sign(...).complete is not a function
```

#### Cause:
Minswap SDK returns a different transaction type than standard Lucid.

#### Solution:
```javascript
// ❌ DON'T DO THIS
const txHash = await tx.sign().complete().submit();

// ✅ DO THIS INSTEAD
const signedTx = txComplete.sign();
const completedTx = await signedTx.commit();
const txHash = await completedTx.submit();
```

### 3. Package Compatibility

#### Question:
Should I use `@spacebudz/lucid` or `lucid-cardano`?

#### Answer:
- Use `lucid-cardano` in your application code
- `@spacebudz/lucid` is used internally by Minswap SDK
- Don't mix the two packages

### 4. Version Issues

#### Current Versions (as of testing):
- `@minswap/sdk`: 0.4.3 (latest)
- `lucid-cardano`: 0.10.11
- Node.js: 20.17+ (required by SDK)

#### Installation:
```bash
npm install @minswap/sdk@latest lucid-cardano@latest
```

### 5. Environment Setup

#### Required .npmrc:
```
@jsr:registry=https://npm.jsr.io
```

#### Required package.json:
```json
{
  "type": "module",
  "engines": {
    "node": ">=20.17 <21"
  }
}
```

#### Required Node.js flags:
```bash
node --experimental-wasm-modules your-script.js
```

## Testing Checklist

- [ ] Environment variables loaded (BF_PROJECT_ID, MNEMONIC)
- [ ] Blockfrost connection successful
- [ ] Pool found for asset pair
- [ ] UTxOs available for transaction
- [ ] Slippage calculation correct
- [ ] Transaction builds without datum errors
- [ ] Transaction signs and submits successfully

## Debugging Steps

1. **Check Environment**:
   ```javascript
   console.log("BF_PROJECT_ID:", process.env.BF_PROJECT_ID);
   console.log("MNEMONIC:", process.env.MNEMONIC ? "Loaded" : "Not loaded");
   ```

2. **Verify Pool Exists**:
   ```javascript
   const pool = await adapter.getV2PoolByPair(assetA, assetB);
   if (!pool) throw new Error("Pool not found");
   ```

3. **Check UTxOs**:
   ```javascript
   const utxos = await lucid.wallet.getUtxos();
   console.log("Available UTxOs:", utxos.length);
   ```

4. **Validate Transaction Object**:
   ```javascript
   console.log("TX methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(txComplete)));
   ```

## Best Practices

1. Always use SDK helper functions for Lucid initialization
2. Handle errors gracefully with try-catch blocks
3. Validate all inputs before transaction building
4. Use appropriate slippage tolerance (0.5-5%)
5. Test on testnet before mainnet deployment
6. Keep private keys secure and never commit them
