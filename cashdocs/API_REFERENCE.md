# API Reference: Minswap SDK Integration

## Core Functions

### getBackendBlockfrostLucidInstance()

**Purpose**: Creates a Lucid instance pre-configured for Minswap SDK usage.

**Signature**:
```typescript
function getBackendBlockfrostLucidInstance(
  networkId: NetworkId,
  projectId: string,
  blockfrostUrl: string,
  address: string
): Promise<Lucid>
```

**Parameters**:
- `networkId`: `NetworkId.MAINNET` or `NetworkId.TESTNET`
- `projectId`: Blockfrost API project ID
- `blockfrostUrl`: Blockfrost API endpoint URL
- `address`: Wallet address for transaction context

**Example**:
```javascript
const lucid = await getBackendBlockfrostLucidInstance(
  NetworkId.MAINNET,
  "mainnetKDR7gGfvHy85...",
  "https://cardano-mainnet.blockfrost.io/api/v0",
  "addr1qx492sqgzk5c7jljapc4kq3jmf29pqz5v39h00dq4wvtszczq5gfxkek2fxdwevtjcjaf8hdap97auc744p8ppjf4vns394f0k"
);
```

### DexV2.createBulkOrdersTx()

**Purpose**: Creates a transaction for DEX V2 operations.

**Signature**:
```typescript
createBulkOrdersTx(options: BulkOrdersOption): Promise<TxComplete>
```

**Parameters**:
```typescript
interface BulkOrdersOption {
  sender: string;
  availableUtxos?: Utxo[];
  orderOptions: OrderOption[];
  expiredOptions?: ExpiredOption[];
  composeTx?: (tx: Tx) => Tx;
  authorizationMethodType?: AuthorizationMethodType;
}
```

**Example**:
```javascript
const txComplete = await new DexV2(lucid, adapter).createBulkOrdersTx({
  sender: "addr1...",
  availableUtxos: utxos,
  orderOptions: [{
    type: OrderV2.StepType.SWAP_EXACT_IN,
    amountIn: 1_000_000n,
    assetIn: ADA,
    direction: OrderV2.Direction.A_TO_B,
    minimumAmountOut: 251_513n,
    lpAsset: pool.lpAsset,
    isLimitOrder: false,
    killOnFailed: false,
  }],
});
```

## Transaction Signing

### Standard Flow
```javascript
// 1. Sign transaction
const signedTx = txComplete.sign();

// 2. Commit (finalize) transaction
const completedTx = await signedTx.commit();

// 3. Submit to network
const txHash = await completedTx.submit();
```

### Available Signing Methods
```typescript
interface TxComplete {
  sign(): TxSigned;
  signWithPrivateKey(privateKey: string): TxSigned;
  signWithSeed(seed: string): TxSigned;
  signWithWitness(witness: TransactionWitnessSet): TxSigned;
  partialSign(): TxSigned;
  partialSignWithPrivateKey(privateKey: string): TxSigned;
  partialSignWithSeed(seed: string): TxSigned;
  assemble(txSigned: TxSigned[]): TxSigned;
  commit(): Promise<TxComplete>;
  toString(): string;
  toHash(): string;
}
```

## Pool Operations

### Finding Pools
```javascript
// Find pool by asset pair
const pool = await adapter.getV2PoolByPair(ADA, CATSKY) ||
             await adapter.getV2PoolByPair(CATSKY, ADA);

// Find pool by LP asset
const pool = await adapter.getV2PoolByLp(lpAsset);
```

### Pool Information
```typescript
interface PoolV2 {
  assetA: Asset;
  assetB: Asset;
  reserveA: bigint;
  reserveB: bigint;
  lpAsset: Asset;
  feeA: [bigint, bigint];
  feeB: [bigint, bigint];
  // ... other properties
}
```

## Calculation Functions

### DexV2Calculation.calculateAmountOut()
```typescript
function calculateAmountOut(params: {
  reserveIn: bigint;
  reserveOut: bigint;
  amountIn: bigint;
  tradingFeeNumerator: bigint;
}): bigint
```

### calculateAmountWithSlippageTolerance()
```typescript
function calculateAmountWithSlippageTolerance(params: {
  slippageTolerancePercent: number;
  amount: bigint;
  type: "up" | "down";
}): bigint
```

## Asset Handling

### Asset Type
```typescript
type Asset = {
  policyId: string;
  tokenName: string;
}
```

### Asset Utilities
```javascript
// Create asset from string
const asset = Asset.fromString("policyId.tokenName");

// Convert asset to string
const assetString = Asset.toString(asset);

// ADA constant
import { ADA } from "@minswap/sdk";
```

## Order Types

### SWAP_EXACT_IN
```typescript
{
  type: OrderV2.StepType.SWAP_EXACT_IN;
  amountIn: bigint;
  assetIn: Asset;
  direction: OrderV2.Direction;
  minimumAmountOut: bigint;
  lpAsset: Asset;
  isLimitOrder: boolean;
  killOnFailed: boolean;
}
```

### SWAP_EXACT_OUT
```typescript
{
  type: OrderV2.StepType.SWAP_EXACT_OUT;
  assetIn: Asset;
  maximumAmountIn: bigint;
  expectedReceived: bigint;
  direction: OrderV2.Direction;
  killOnFailed: boolean;
  lpAsset: Asset;
}
```

### DEPOSIT
```typescript
{
  type: OrderV2.StepType.DEPOSIT;
  assetA: Asset;
  amountA: bigint;
  assetB: Asset;
  amountB: bigint;
  lpAsset: Asset;
  minimumLPReceived: bigint;
  killOnFailed: boolean;
}
```

### WITHDRAW
```typescript
{
  type: OrderV2.StepType.WITHDRAW;
  lpAmount: bigint;
  minimumAssetAReceived: bigint;
  minimumAssetBReceived: bigint;
  killOnFailed: boolean;
  lpAsset: Asset;
}
```

## Error Handling

### Common Error Types
```typescript
// Datum creation error
Error: No datum set. Script output becomes unspendable without datum.

// Transaction signing error
TypeError: tx.sign(...).complete is not a function

// Pool not found error
Error: Pool not found

// Insufficient funds error
Error: UTxO Balance Insufficient
```

### Error Handling Pattern
```javascript
try {
  const txComplete = await new DexV2(lucid, adapter).createBulkOrdersTx(options);
  const signedTx = txComplete.sign();
  const completedTx = await signedTx.commit();
  const txHash = await completedTx.submit();
  console.log("Success:", txHash);
} catch (error) {
  console.error("Transaction failed:", error.message);
  // Handle specific error types
  if (error.message.includes("datum")) {
    console.error("Datum creation issue - check Lucid initialization");
  } else if (error.message.includes("Pool not found")) {
    console.error("Asset pair not available on Minswap");
  }
}
```

## Network Configuration

### Mainnet
```javascript
const adapter = new BlockfrostAdapter(NetworkId.MAINNET, new BlockFrostAPI({
  projectId: "mainnet...",
  network: "mainnet"
}));
```

### Testnet
```javascript
const adapter = new BlockfrostAdapter(NetworkId.TESTNET, new BlockFrostAPI({
  projectId: "preprod...",
  network: "preprod"
}));
```
