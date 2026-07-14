/**
 * Nigerian Banks Seed — All CBN-licensed banks with NIP codes
 * Sources: NIBSS, Globus Bank PDF, Monnify API docs
 * Run: npx tsx drizzle/seeds/nigerian-banks.ts
 */
import { db } from "../../server/db";
import { nibssBanks } from "../schema";

export const NIGERIAN_BANKS = [
  // ─── Commercial Banks (Tier 1) ────────────────────────────────────────────
  { nipCode: "000016", bankCode: "011", bankName: "First Bank of Nigeria", shortName: "First Bank", category: "commercial", ussdCode: "*894#", ussdTransferTemplate: "*894*Amount*AccountNumber#", supportsUssd: true },
  { nipCode: "000015", bankCode: "057", bankName: "Zenith Bank", shortName: "Zenith", category: "commercial", ussdCode: "*966#", ussdTransferTemplate: "*966*Amount*AccountNumber#", supportsUssd: true },
  { nipCode: "000014", bankCode: "044", bankName: "Access Bank", shortName: "Access", category: "commercial", ussdCode: "*901#", ussdTransferTemplate: "*901*Amount*AccountNumber#", supportsUssd: true },
  { nipCode: "000013", bankCode: "058", bankName: "Guaranty Trust Bank", shortName: "GTBank", category: "commercial", ussdCode: "*737#", ussdTransferTemplate: "*737*2*Amount*AccountNumber#", supportsUssd: true },
  { nipCode: "000004", bankCode: "033", bankName: "United Bank for Africa", shortName: "UBA", category: "commercial", ussdCode: "*919#", ussdTransferTemplate: "*919*4*AccountNumber*Amount#", supportsUssd: true },
  // ─── Commercial Banks (Tier 2) ────────────────────────────────────────────
  { nipCode: "000001", bankCode: "232", bankName: "Sterling Bank", shortName: "Sterling", category: "commercial", ussdCode: "*822#", ussdTransferTemplate: "*822*5*Amount*AccountNumber#", supportsUssd: true },
  { nipCode: "000002", bankCode: "082", bankName: "Keystone Bank", shortName: "Keystone", category: "commercial", ussdCode: "*7111#", ussdTransferTemplate: "*7111*Amount*AccountNumber#", supportsUssd: true },
  { nipCode: "000003", bankCode: "214", bankName: "First City Monument Bank", shortName: "FCMB", category: "commercial", ussdCode: "*329#", ussdTransferTemplate: "*329*Amount*AccountNumber#", supportsUssd: true },
  { nipCode: "000006", bankCode: "301", bankName: "JAIZ Bank", shortName: "JAIZ", category: "commercial", ussdCode: "*389#", ussdTransferTemplate: "*389*301*AccountNumber*Amount#", supportsUssd: true },
  { nipCode: "000007", bankCode: "070", bankName: "Fidelity Bank", shortName: "Fidelity", category: "commercial", ussdCode: "*770#", ussdTransferTemplate: "*770*AccountNumber*Amount#", supportsUssd: true },
  { nipCode: "000008", bankCode: "076", bankName: "Polaris Bank", shortName: "Polaris", category: "commercial", ussdCode: "*833#", ussdTransferTemplate: "*833*Amount*AccountNumber#", supportsUssd: true },
  { nipCode: "000009", bankCode: "023", bankName: "Citibank Nigeria", shortName: "Citibank", category: "commercial", supportsUssd: false },
  { nipCode: "000010", bankCode: "050", bankName: "Ecobank Nigeria", shortName: "Ecobank", category: "commercial", ussdCode: "*326#", ussdTransferTemplate: "*326*AccountNumber#", supportsUssd: true },
  { nipCode: "000011", bankCode: "215", bankName: "Unity Bank", shortName: "Unity", category: "commercial", ussdCode: "*7799#", ussdTransferTemplate: "*7799*2*AccountNumber*Amount#", supportsUssd: true },
  { nipCode: "000012", bankCode: "221", bankName: "Stanbic IBTC Bank", shortName: "Stanbic IBTC", category: "commercial", ussdCode: "*909#", ussdTransferTemplate: "*909*22*Amount*AccountNumber#", supportsUssd: true },
  { nipCode: "000017", bankCode: "035", bankName: "Wema Bank", shortName: "Wema", category: "commercial", ussdCode: "*945#", ussdTransferTemplate: "*945*AccountNumber*Amount#", supportsUssd: true },
  { nipCode: "000018", bankCode: "032", bankName: "Union Bank of Nigeria", shortName: "Union Bank", category: "commercial", ussdCode: "*826#", ussdTransferTemplate: "*826*2*Amount*AccountNumber#", supportsUssd: true },
  { nipCode: "000020", bankCode: "030", bankName: "Heritage Bank", shortName: "Heritage", category: "commercial", ussdCode: "*322#", ussdTransferTemplate: "*322*030*AccountNumber*Amount#", supportsUssd: true },
  { nipCode: "000021", bankCode: "068", bankName: "Standard Chartered Bank Nigeria", shortName: "Std Chartered", category: "commercial", supportsUssd: false },
  { nipCode: "000022", bankCode: "100", bankName: "Suntrust Bank Nigeria", shortName: "Suntrust", category: "commercial", supportsUssd: false },
  { nipCode: "000023", bankCode: "101", bankName: "Providus Bank", shortName: "Providus", category: "commercial", supportsUssd: false },
  { nipCode: "000024", bankCode: "502", bankName: "Rand Merchant Bank", shortName: "RMB", category: "merchant", supportsUssd: false },
  { nipCode: "000025", bankCode: "102", bankName: "Titan Trust Bank", shortName: "Titan Trust", category: "commercial", supportsUssd: false },
  { nipCode: "000026", bankCode: "302", bankName: "Taj Bank", shortName: "Taj Bank", category: "commercial", supportsUssd: false },
  { nipCode: "000027", bankCode: "103", bankName: "Globus Bank", shortName: "Globus", category: "commercial", supportsUssd: false },
  { nipCode: "000029", bankCode: "303", bankName: "Lotus Bank", shortName: "Lotus", category: "commercial", supportsUssd: false },
  { nipCode: "000030", bankCode: "104", bankName: "Parallex Bank", shortName: "Parallex", category: "commercial", supportsUssd: false },
  { nipCode: "000031", bankCode: "105", bankName: "Premium Trust Bank", shortName: "Premium Trust", category: "commercial", supportsUssd: false },
  { nipCode: "000034", bankCode: "106", bankName: "Signature Bank", shortName: "Signature", category: "commercial", supportsUssd: false },
  { nipCode: "000036", bankCode: "107", bankName: "Optimus Bank", shortName: "Optimus", category: "commercial", supportsUssd: false },
  // ─── Merchant Banks ───────────────────────────────────────────────────────
  { nipCode: "060001", bankCode: "559", bankName: "Coronation Merchant Bank", shortName: "Coronation", category: "merchant", supportsUssd: false },
  { nipCode: "060002", bankCode: "413", bankName: "FBNQuest Merchant Bank", shortName: "FBNQuest", category: "merchant", supportsUssd: false },
  { nipCode: "060003", bankCode: "060", bankName: "Nova Merchant Bank", shortName: "Nova", category: "merchant", supportsUssd: false },
  { nipCode: "060004", bankCode: "562", bankName: "Greenwich Merchant Bank", shortName: "Greenwich", category: "merchant", supportsUssd: false },
  { nipCode: "400001", bankCode: "608", bankName: "FSDH Merchant Bank", shortName: "FSDH", category: "merchant", supportsUssd: false },
  // ─── Digital Banks / Fintech MFBs ─────────────────────────────────────────
  { nipCode: "090267", bankCode: "090267", bankName: "Kuda Microfinance Bank", shortName: "Kuda", category: "digital", supportsUssd: false },
  { nipCode: "090405", bankCode: "090405", bankName: "Moniepoint Microfinance Bank", shortName: "Moniepoint", category: "digital", ussdCode: "*5573#", supportsUssd: true },
  { nipCode: "100004", bankCode: "100004", bankName: "OPay Digital Services (Paycom)", shortName: "OPay", category: "digital", ussdCode: "*955#", supportsUssd: true },
  { nipCode: "100033", bankCode: "100033", bankName: "PalmPay", shortName: "PalmPay", category: "digital", supportsUssd: false },
  { nipCode: "090325", bankCode: "090325", bankName: "Sparkle Microfinance Bank", shortName: "Sparkle", category: "digital", supportsUssd: false },
  { nipCode: "090328", bankCode: "090328", bankName: "Eyowo", shortName: "Eyowo", category: "digital", supportsUssd: false },
  { nipCode: "090110", bankCode: "090110", bankName: "VFD Microfinance Bank", shortName: "VFD MFB", category: "microfinance", supportsUssd: false },
  { nipCode: "090198", bankCode: "090198", bankName: "RenMoney Microfinance Bank", shortName: "RenMoney", category: "microfinance", supportsUssd: false },
  { nipCode: "090134", bankCode: "090134", bankName: "Accion Microfinance Bank", shortName: "Accion MFB", category: "microfinance", supportsUssd: false },
  { nipCode: "090177", bankCode: "090177", bankName: "LAPO Microfinance Bank", shortName: "LAPO MFB", category: "microfinance", supportsUssd: false },
  { nipCode: "090286", bankCode: "090286", bankName: "Safe Haven Microfinance Bank", shortName: "Safe Haven", category: "microfinance", supportsUssd: false },
  { nipCode: "090281", bankCode: "090281", bankName: "MintFinex Microfinance Bank", shortName: "MintFinex", category: "microfinance", supportsUssd: false },
  { nipCode: "090303", bankCode: "090303", bankName: "Purplemoney Microfinance Bank", shortName: "Purplemoney", category: "microfinance", supportsUssd: false },
  { nipCode: "090455", bankCode: "090455", bankName: "Mkobo Microfinance Bank", shortName: "Mkobo", category: "microfinance", supportsUssd: false },
  { nipCode: "090360", bankCode: "090360", bankName: "CashConnect Microfinance Bank", shortName: "CashConnect", category: "microfinance", supportsUssd: false },
  { nipCode: "090194", bankCode: "090194", bankName: "NIRSAL Microfinance Bank", shortName: "NIRSAL MFB", category: "microfinance", supportsUssd: false },
  { nipCode: "090195", bankCode: "090195", bankName: "Grooming Microfinance Bank", shortName: "Grooming MFB", category: "microfinance", supportsUssd: false },
  { nipCode: "090270", bankCode: "090270", bankName: "AB Microfinance Bank", shortName: "AB MFB", category: "microfinance", supportsUssd: false },
  { nipCode: "090155", bankCode: "090155", bankName: "Advans La Fayette Microfinance Bank", shortName: "Advans MFB", category: "microfinance", supportsUssd: false },
  { nipCode: "070001", bankCode: "070001", bankName: "NPF Microfinance Bank", shortName: "NPF MFB", category: "microfinance", supportsUssd: false },
  { nipCode: "070002", bankCode: "070002", bankName: "Fortis Microfinance Bank", shortName: "Fortis MFB", category: "microfinance", supportsUssd: false },
  { nipCode: "090004", bankCode: "090004", bankName: "Parralex Microfinance Bank", shortName: "Parralex MFB", category: "microfinance", supportsUssd: false },
];

export async function seedNigerianBanks() {
  console.log(`Seeding ${NIGERIAN_BANKS.length} Nigerian banks...`);
  for (const bank of NIGERIAN_BANKS) {
    await db
      .insert(nibssBanks)
      .values({
        nipCode: bank.nipCode,
        bankCode: bank.bankCode ?? bank.nipCode,
        bankName: bank.bankName,
        shortName: bank.shortName ?? bank.bankName,
        category: bank.category,
        ussdCode: bank.ussdCode ?? null,
        ussdTransferTemplate: bank.ussdTransferTemplate ?? null,
        supportsUssd: bank.supportsUssd ?? false,
        isActive: true,
        supportsNip: true,
      })
      .onConflictDoUpdate({
        target: nibssBanks.nipCode,
        set: {
          bankName: bank.bankName,
          shortName: bank.shortName ?? bank.bankName,
          ussdCode: bank.ussdCode ?? null,
          ussdTransferTemplate: bank.ussdTransferTemplate ?? null,
          supportsUssd: bank.supportsUssd ?? false,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`✓ Seeded ${NIGERIAN_BANKS.length} banks`);
}

// Run directly
seedNigerianBanks().catch(console.error);
