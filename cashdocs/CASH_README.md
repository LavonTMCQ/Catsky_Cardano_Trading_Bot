# CASH README - Debugging Notes for Developer

## 🚨 CRITICAL ISSUES FOUND & FIXED

### **Primary Issue: Datum Creation Error**
```
Error: No datum set. Script output becomes unspendable without datum.
```

**Root Cause**: Using `Lucid.new()` directly from `lucid-cardano` instead of Minswap SDK's helper function.

**Fix Applied**: 
- Changed from manual Lucid initialization to `getBackendBlockfrostLucidInstance()`
- This SDK helper automatically handles datum creation for Minswap transactions

### **Secondary Issue: Transaction Signing Method**
```
TypeError: tx.sign(...).complete is not a function
```

**Root Cause**: Minswap SDK returns a different transaction type than standard Lucid.

**Fix Applied**:
- Changed from: `tx.sign().complete().submit()`
- Changed to: `txComplete.sign().commit().submit()`

## 📋 WHAT WAS CHANGED

### 1. Import Changes
```javascript
// BEFORE
import { Lucid, Blockfrost, Data } from "lucid-cardano";

// AFTER  
import { getBackendBlockfrostLucidInstance } from "@minswap/sdk";
// Removed Data import (unused)
```

### 2. Lucid Initialization
```javascript
// BEFORE
const lucid = await Lucid.new(
  new Blockfrost("https://cardano-mainnet.blockfrost.io/api/v0", BF_PROJECT_ID),
  "Mainnet"
);

// AFTER
const lucid = await getBackendBlockfrostLucidInstance(
  NetworkId.MAINNET,
  BF_PROJECT_ID,
  "https://cardano-mainnet.blockfrost.io/api/v0",
  sender
);
```

### 3. Transaction Signing
```javascript
// BEFORE
const txHash = await tx.sign().complete().then(c => c.submit());

// AFTER
const signedTx = txComplete.sign();
const completedTx = await signedTx.commit();
const txHash = await completedTx.submit();
```

### 4. Code Cleanup
- Removed duplicate `minimumAmountOut` calculations
- Fixed indentation consistency
- Removed duplicate console.log statements

## ✅ VERIFICATION

**Test Results**: 
- Transaction successfully submitted to mainnet
- TX Hash: `0227d301c1d73d458369a22607482718dc5a9d66c3bafe261f1f05fadc05af95`
- No datum errors
- Proper slippage calculation: ~252,771 CATSKY tokens (min 251,513)

## 🔧 PACKAGE VERSIONS CONFIRMED

- `@minswap/sdk`: 0.4.3 (latest, not 0.4.7 as initially thought)
- `lucid-cardano`: 0.10.11 (correct package to use)
- No need to switch to `@spacebudz/lucid` (handled internally by SDK)

## 🚀 FINAL STATUS

**WORKING**: The bot now successfully swaps 1 ADA for CATSKY tokens on Minswap V2.

**KEY LESSON**: Always use Minswap SDK's Lucid helper functions instead of manual Lucid initialization when working with Minswap transactions.
