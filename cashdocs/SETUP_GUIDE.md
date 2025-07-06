# Setup Guide for Minswap Trading Bot

## Prerequisites

### System Requirements
- Node.js 20.17+ (required by Minswap SDK)
- npm or yarn package manager
- Git (for cloning repository)

### API Requirements
- Blockfrost API key (mainnet or testnet)
- Cardano wallet with mnemonic phrase

## Installation Steps

### 1. Clone Repository
```bash
git clone https://github.com/Catsky01/Catsky_Cardano_Trading_Bot.git
cd Catsky_Cardano_Trading_Bot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` file:
```env
# Blockfrost API project ID
BF_PROJECT_ID=your_blockfrost_project_id_here

# Wallet mnemonic phrase (12 words)
MNEMONIC=your twelve word mnemonic phrase goes here
```

### 4. Verify Setup
```bash
npm run swap
```

## Configuration Options

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `BF_PROJECT_ID` | Blockfrost API key | `mainnetKDR7gGfvHy85...` |
| `MNEMONIC` | 12-word seed phrase | `word1 word2 word3...` |

### Trading Parameters

Edit `swap2.js` to modify:

```javascript
// Trading amount (in lovelace, 1 ADA = 1,000,000 lovelace)
const AMOUNT_IN = 1_000_000n; // 1 ADA

// Slippage tolerance (0.5 = 0.5%)
const SLIPPAGE_PCT = 0.5;

// Target token (CATSKY)
const CATSKY = Asset.fromString("9b426921a21f54600711da0be1a12b026703a9bd8eb9848d08c9d921434154534b59");
```

## Network Configuration

### Mainnet (Default)
```javascript
const lucid = await getBackendBlockfrostLucidInstance(
  NetworkId.MAINNET,
  BF_PROJECT_ID,
  "https://cardano-mainnet.blockfrost.io/api/v0",
  sender
);

const adapter = new BlockfrostAdapter(NetworkId.MAINNET, new BlockFrostAPI({
  projectId: BF_PROJECT_ID, 
  network: "mainnet"
}));
```

### Testnet (For Testing)
```javascript
const lucid = await getBackendBlockfrostLucidInstance(
  NetworkId.TESTNET,
  BF_PROJECT_ID,
  "https://cardano-preprod.blockfrost.io/api/v0",
  sender
);

const adapter = new BlockfrostAdapter(NetworkId.TESTNET, new BlockFrostAPI({
  projectId: BF_PROJECT_ID, 
  network: "preprod"
}));
```

## Security Setup

### 1. Wallet Security
- Use a dedicated wallet for trading
- Never share your mnemonic phrase
- Keep small amounts for testing
- Use testnet for development

### 2. API Key Security
- Keep Blockfrost API keys private
- Use environment variables
- Don't commit `.env` to version control
- Rotate keys regularly

### 3. Code Security
- Review all code before running
- Test on testnet first
- Validate all inputs
- Monitor transaction results

## Troubleshooting

### Common Issues

#### 1. Node.js Version Error
```
npm warn EBADENGINE Unsupported engine
```
**Solution**: Upgrade to Node.js 20.17+

#### 2. WASM Module Error
```
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".wasm"
```
**Solution**: Use `--experimental-wasm-modules` flag (already in package.json)

#### 3. Environment Variables Not Loaded
```
BF_PROJECT_ID: undefined
```
**Solution**: Check `.env` file exists and has correct format

#### 4. Blockfrost Connection Error
```
TypeError: Cannot convert undefined to a BigInt
```
**Solution**: Verify Blockfrost API key is valid

### Debug Mode

Add debug logging:
```javascript
console.log("Environment check:");
console.log("- BF_PROJECT_ID:", process.env.BF_PROJECT_ID ? "✓" : "✗");
console.log("- MNEMONIC:", process.env.MNEMONIC ? "✓" : "✗");
console.log("- Node version:", process.version);
```

## Testing

### 1. Dry Run Test
Comment out the transaction submission:
```javascript
// const txHash = await completedTx.submit();
console.log("🧪 Dry run - transaction built successfully");
```

### 2. Small Amount Test
Use minimal amounts for testing:
```javascript
const AMOUNT_IN = 1_000_000n; // 1 ADA minimum
```

### 3. Testnet Test
Switch to testnet configuration for safe testing.

## Monitoring

### Transaction Tracking
- Save transaction hashes
- Monitor on Cardano explorers
- Check wallet balances
- Verify swap completion

### Error Logging
```javascript
main().catch(err => {
  console.error("❌ Fatal error:", err);
  console.error("Stack trace:", err.stack);
  process.exit(1);
});
```

## Next Steps

1. **Test the Setup**: Run a small test transaction
2. **Monitor Results**: Check transaction on explorer
3. **Customize Parameters**: Adjust amounts and slippage
4. **Add Features**: Implement additional trading logic
5. **Deploy**: Set up automated trading (if desired)

## Support

- Check `DEBUGGING_GUIDE.md` for common issues
- Review `TECHNICAL_ANALYSIS.md` for deep technical details
- See `CODE_COMPARISON.md` for implementation examples
