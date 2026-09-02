const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const PAYSTACK_BASE = "https://api.paystack.co";
const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

const headers = () => ({
  Authorization: `Bearer ${SECRET_KEY}`,
  "Content-Type": "application/json",
});

// Server-side verification of a Paystack transaction. NEVER trust the frontend.
async function verifyTransaction(reference) {
  if (!reference) throw new Error("Transaction reference is required");
  const { data } = await axios.get(
    `${PAYSTACK_BASE}/transaction/verify/${reference}`,
    { headers: headers() }
  );
  const tx = data?.data;
  if (!tx) throw new Error("Invalid Paystack response");
  return tx;
}

// Create a transfer recipient (NUBAN bank account) for seller payouts
async function createTransferRecipient({ type = "nuban", name, account_number, bank_code, currency = "NGN" }) {
  const { data } = await axios.post(
    `${PAYSTACK_BASE}/transferrecipient`,
    { type, name, account_number, bank_code, currency },
    { headers: headers() }
  );
  if (!data?.status) {
    throw new Error(data?.message || "Failed to create transfer recipient");
  }
  return data.data; // { recipient_code, active, details, ... }
}

// Get list of banks for the payout form
async function getBanks() {
  const { data } = await axios.get(`${PAYSTACK_BASE}/bank?currency=NGN`, {
    headers: headers(),
  });
  return data?.data || [];
}

// Resolve account name for a NUBAN account (used to prefill + verify ownership)
async function resolveAccount(bank_code, account_number) {
  const { data } = await axios.get(
    `${PAYSTACK_BASE}/bank/resolve?bank_code=${encodeURIComponent(bank_code)}&account_number=${encodeURIComponent(account_number)}`,
    { headers: headers() }
  );
  return data?.data || null; // { account_name, account_number }
}

// Initiate a single transfer. The `reference` doubles as our idempotency key.
async function initiateTransfer({ amount, recipient, reference, reason = "Marketplace seller payout" }) {
  try {
    const { data } = await axios.post(
      `${PAYSTACK_BASE}/transfer`,
      { source: "balance", amount, recipient, reference, reason },
      { headers: headers() }
    );
    if (!data?.status) {
      throw new Error(data?.message || "Failed to initiate transfer");
    }
    return data.data; // { reference, transfer_code, status, amount, ... }
  } catch (err) {
    // Surface Paystack's own error body (e.g. insufficient balance, invalid recipient)
    // instead of a generic axios 400.
    const body = err?.response?.data;
    if (body) {
      const msg = body.message || body.error || body.data?.message || "Paystack transfer failed";
      const code = body.code || err?.response?.status || "";
      const e = new Error(`${msg}${code ? ` (${code})` : ""}`);
      e.paystack = body;
      e.status = err?.response?.status;
      e.generic = false;
      throw e;
    }
    throw err;
  }
}

// Fetch a single transfer by its Paystack code
async function fetchTransfer(transferCode) {
  const { data } = await axios.get(
    `${PAYSTACK_BASE}/transfer/${transferCode}`,
    { headers: headers() }
  );
  return data?.data || null;
}

// Initiate a refund for a paid transaction
async function initiateRefund({ reference, amountKobo }) {
  const body = { transaction: reference };
  if (amountKobo) body.amount = amountKobo;
  const { data } = await axios.post(`${PAYSTACK_BASE}/refund`, body, {
    headers: headers(),
  });
  return data?.data || null;
}

// Check available balance on the integration
async function getBalance() {
  const { data } = await axios.get(`${PAYSTACK_BASE}/balance`, {
    headers: headers(),
  });
  return data?.data || [];
}

module.exports = {
  verifyTransaction,
  createTransferRecipient,
  getBanks,
  resolveAccount,
  initiateTransfer,
  fetchTransfer,
  initiateRefund,
  getBalance,
};