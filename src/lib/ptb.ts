import { Transaction } from "@mysten/sui/transactions";
import { PREDICT_PKG, PREDICT_OBJ } from "./sui";

/// Build a PTB that creates a new PredictManager for the sender.
/// Manager creation is free (just gas) — doesn't require dUSDC.
export function buildCreateManager(): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::create_manager`,
    arguments: [],
  });
  return tx;
}

/// Build a PTB that deposits quote asset (e.g. dUSDC) FROM the user's wallet
/// INTO their PredictManager's wrapped BalanceManager. Required before
/// minting binary positions — predict::mint pulls from the manager, not the
/// wallet directly.
export function buildDepositToManager(opts: {
  managerId: string;
  coinObjectId: string;
  amountQuote: bigint;
  quoteAssetType: string;
}): Transaction {
  const tx = new Transaction();
  const depositCoin = tx.splitCoins(tx.object(opts.coinObjectId), [
    tx.pure.u64(opts.amountQuote),
  ])[0];

  tx.moveCall({
    target: `${PREDICT_PKG}::predict_manager::deposit`,
    typeArguments: [opts.quoteAssetType],
    arguments: [tx.object(opts.managerId), depositCoin],
  });
  return tx;
}

/// Build a PTB that withdraws quote asset FROM the PredictManager back to
/// the user's wallet. Mirror of buildDepositToManager.
export function buildWithdrawFromManager(opts: {
  sender: string;
  managerId: string;
  amountQuote: bigint;
  quoteAssetType: string;
}): Transaction {
  const tx = new Transaction();
  const coin = tx.moveCall({
    target: `${PREDICT_PKG}::predict_manager::withdraw`,
    typeArguments: [opts.quoteAssetType],
    arguments: [tx.object(opts.managerId), tx.pure.u64(opts.amountQuote)],
  });
  tx.transferObjects([coin], tx.pure.address(opts.sender));
  return tx;
}

/// Build a PTB that mints a binary position (UP or DOWN) on a market.
/// Requires the user's PredictManager to hold enough dUSDC for cost + gas.
export function buildMintBinary(opts: {
  managerId: string;
  oracleId: string;
  expiry: bigint;
  strike: bigint;
  isUp: boolean;
  quantity: bigint;
  quoteAssetType: string;
}): Transaction {
  const tx = new Transaction();
  const marketKey = tx.moveCall({
    target: `${PREDICT_PKG}::market_key::new`,
    arguments: [
      tx.pure.id(opts.oracleId),
      tx.pure.u64(opts.expiry),
      tx.pure.u64(opts.strike),
      tx.pure.bool(opts.isUp),
    ],
  });
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::mint`,
    typeArguments: [opts.quoteAssetType],
    arguments: [
      tx.object(PREDICT_OBJ),
      tx.object(opts.managerId),
      tx.object(opts.oracleId),
      marketKey,
      tx.pure.u64(opts.quantity),
      tx.object("0x6"),
    ],
  });
  return tx;
}

/// Build a PTB that supplies quote asset to the vault and mints PLP shares.
/// Splits `amountQuote` off the supplied coin, calls supply, and transfers
/// the returned PLP shares to the sender.
export function buildSupply(opts: {
  sender: string;
  coinObjectId: string;
  amountQuote: bigint;
  quoteAssetType: string;
}): Transaction {
  const tx = new Transaction();
  const supplyCoin = tx.splitCoins(tx.object(opts.coinObjectId), [
    tx.pure.u64(opts.amountQuote),
  ])[0];

  const plpCoin = tx.moveCall({
    target: `${PREDICT_PKG}::predict::supply`,
    typeArguments: [opts.quoteAssetType],
    arguments: [tx.object(PREDICT_OBJ), supplyCoin, tx.object("0x6")],
  });
  tx.transferObjects([plpCoin], tx.pure.address(opts.sender));
  return tx;
}

/// Build a PTB that burns PLP and withdraws quote asset from the vault.
export function buildWithdraw(opts: {
  sender: string;
  plpCoinObjectId: string;
  amountPlp: bigint;
  quoteAssetType: string;
}): Transaction {
  const tx = new Transaction();
  const burnCoin = tx.splitCoins(tx.object(opts.plpCoinObjectId), [
    tx.pure.u64(opts.amountPlp),
  ])[0];

  const quoteCoin = tx.moveCall({
    target: `${PREDICT_PKG}::predict::withdraw`,
    typeArguments: [opts.quoteAssetType],
    arguments: [tx.object(PREDICT_OBJ), burnCoin, tx.object("0x6")],
  });
  tx.transferObjects([quoteCoin], tx.pure.address(opts.sender));
  return tx;
}

/// Build a PTB that redeems an existing binary position back into the manager.
export function buildRedeemBinary(opts: {
  managerId: string;
  oracleId: string;
  expiry: bigint;
  strike: bigint;
  isUp: boolean;
  quantity: bigint;
  quoteAssetType: string;
}): Transaction {
  const tx = new Transaction();
  const marketKey = tx.moveCall({
    target: `${PREDICT_PKG}::market_key::new`,
    arguments: [
      tx.pure.id(opts.oracleId),
      tx.pure.u64(opts.expiry),
      tx.pure.u64(opts.strike),
      tx.pure.bool(opts.isUp),
    ],
  });
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::redeem`,
    typeArguments: [opts.quoteAssetType],
    arguments: [
      tx.object(PREDICT_OBJ),
      tx.object(opts.managerId),
      tx.object(opts.oracleId),
      marketKey,
      tx.pure.u64(opts.quantity),
      tx.object("0x6"),
    ],
  });
  return tx;
}
