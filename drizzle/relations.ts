/**
 * drizzle/relations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Drizzle ORM relations for the PayGate schema.
 * Defines the top-20 most-queried table relationships so that Drizzle's
 * relational query API (db.query.*) can be used instead of manual .leftJoin()
 * chains.
 */

import { relations } from "drizzle-orm";
import {
  tenants,
  users,
  merchants,
  transactions,
  customers,
  payouts,
  apiKeys,
  webhooks,
  webhookDeliveries,
  disputes,
  virtualCards,
  paymentLinks,
  teamMembers,
  fraudAlerts,
  kycSubmissions,
  bnplLoans,
  wallets,
  walletTransactions,
  crossBorderTransfers,
  settlements,
  posTerminals,
  posTransactions,
  subscriptions,
  subscriptionCharges,
  auditEvents,
  restaurantOrders,
  restaurantOrderItems,
  restaurantTables,
  splitBillSessions,
  loyaltyAccounts,
  loyaltyTransactions,
} from "./schema";

// ─── Tenants ──────────────────────────────────────────────────────────────────
export const tenantsRelations = relations(tenants, ({ many }) => ({
  merchants: many(merchants),
  users: many(users),
}));

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  auditEvents: many(auditEvents),
}));

// ─── Merchants ────────────────────────────────────────────────────────────────
export const merchantsRelations = relations(merchants, ({ one, many }) => ({
  tenant: one(tenants, { fields: [merchants.tenantId], references: [tenants.id] }),
  transactions: many(transactions),
  customers: many(customers),
  payouts: many(payouts),
  apiKeys: many(apiKeys),
  webhooks: many(webhooks),
  disputes: many(disputes),
  virtualCards: many(virtualCards),
  paymentLinks: many(paymentLinks),
  teamMembers: many(teamMembers),
  fraudAlerts: many(fraudAlerts),
  kycSubmissions: many(kycSubmissions),
  settlements: many(settlements),
  posTerminals: many(posTerminals),
  subscriptions: many(subscriptions),
  wallets: many(wallets),
  auditEvents: many(auditEvents),
}));

// ─── Transactions ─────────────────────────────────────────────────────────────
export const transactionsRelations = relations(transactions, ({ one }) => ({
  merchant: one(merchants, { fields: [transactions.merchantId], references: [merchants.id] }),
  customer: one(customers, { fields: [transactions.customerId], references: [customers.id] }),
}));

// ─── Customers ────────────────────────────────────────────────────────────────
export const customersRelations = relations(customers, ({ one, many }) => ({
  merchant: one(merchants, { fields: [customers.merchantId], references: [merchants.id] }),
  transactions: many(transactions),
}));

// ─── Payouts ──────────────────────────────────────────────────────────────────
export const payoutsRelations = relations(payouts, ({ one }) => ({
  merchant: one(merchants, { fields: [payouts.merchantId], references: [merchants.id] }),
}));

// ─── API Keys ─────────────────────────────────────────────────────────────────
export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  merchant: one(merchants, { fields: [apiKeys.merchantId], references: [merchants.id] }),
}));

// ─── Webhooks ─────────────────────────────────────────────────────────────────
export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
  merchant: one(merchants, { fields: [webhooks.merchantId], references: [merchants.id] }),
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  webhook: one(webhooks, { fields: [webhookDeliveries.webhookId], references: [webhooks.id] }),
  merchant: one(merchants, { fields: [webhookDeliveries.merchantId], references: [merchants.id] }),
}));

// ─── Disputes ─────────────────────────────────────────────────────────────────
export const disputesRelations = relations(disputes, ({ one }) => ({
  merchant: one(merchants, { fields: [disputes.merchantId], references: [merchants.id] }),
}));

// ─── Virtual Cards ────────────────────────────────────────────────────────────
export const virtualCardsRelations = relations(virtualCards, ({ one }) => ({
  merchant: one(merchants, { fields: [virtualCards.merchantId], references: [merchants.id] }),
}));

// ─── Payment Links ────────────────────────────────────────────────────────────
export const paymentLinksRelations = relations(paymentLinks, ({ one }) => ({
  merchant: one(merchants, { fields: [paymentLinks.merchantId], references: [merchants.id] }),
}));

// ─── Team Members ─────────────────────────────────────────────────────────────
export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  merchant: one(merchants, { fields: [teamMembers.merchantId], references: [merchants.id] }),
}));

// ─── Fraud Alerts ─────────────────────────────────────────────────────────────
export const fraudAlertsRelations = relations(fraudAlerts, ({ one }) => ({
  merchant: one(merchants, { fields: [fraudAlerts.merchantId], references: [merchants.id] }),
}));

// ─── KYC Submissions ─────────────────────────────────────────────────────────
export const kycSubmissionsRelations = relations(kycSubmissions, ({ one }) => ({
  merchant: one(merchants, { fields: [kycSubmissions.merchantId], references: [merchants.id] }),
}));

// ─── BNPL Loans ───────────────────────────────────────────────────────────────
export const bnplLoansRelations = relations(bnplLoans, ({ one }) => ({
  merchant: one(merchants, { fields: [bnplLoans.merchantId], references: [merchants.id] }),
}));

// ─── Wallets ──────────────────────────────────────────────────────────────────
export const walletsRelations = relations(wallets, ({ one, many }) => ({
  merchant: one(merchants, { fields: [wallets.merchantId], references: [merchants.id] }),
  transactions: many(walletTransactions),
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  wallet: one(wallets, { fields: [walletTransactions.walletId], references: [wallets.id] }),
}));

// ─── Cross-Border Transfers ───────────────────────────────────────────────────
export const crossBorderTransfersRelations = relations(crossBorderTransfers, ({ one }) => ({
  merchant: one(merchants, { fields: [crossBorderTransfers.merchantId], references: [merchants.id] }),
}));

// ─── Settlements ──────────────────────────────────────────────────────────────
export const settlementsRelations = relations(settlements, ({ one }) => ({
  merchant: one(merchants, { fields: [settlements.merchantId], references: [merchants.id] }),
}));

// ─── POS Terminals & Transactions ────────────────────────────────────────────
export const posTerminalsRelations = relations(posTerminals, ({ one, many }) => ({
  merchant: one(merchants, { fields: [posTerminals.merchantId], references: [merchants.id] }),
  transactions: many(posTransactions),
}));

export const posTransactionsRelations = relations(posTransactions, ({ one }) => ({
  terminal: one(posTerminals, { fields: [posTransactions.terminalId], references: [posTerminals.id] }),
  merchant: one(merchants, { fields: [posTransactions.merchantId], references: [merchants.id] }),
}));

// ─── Subscriptions ────────────────────────────────────────────────────────────
export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  merchant: one(merchants, { fields: [subscriptions.merchantId], references: [merchants.id] }),
  charges: many(subscriptionCharges),
}));

export const subscriptionChargesRelations = relations(subscriptionCharges, ({ one }) => ({
  subscription: one(subscriptions, { fields: [subscriptionCharges.subscriptionId], references: [subscriptions.id] }),
}));

// ─── Audit Events ─────────────────────────────────────────────────────────────
export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  merchant: one(merchants, { fields: [auditEvents.merchantId], references: [merchants.id] }),
}));

// ─── Restaurant ───────────────────────────────────────────────────────────────
export const restaurantOrdersRelations = relations(restaurantOrders, ({ one, many }) => ({
  table: one(restaurantTables, { fields: [restaurantOrders.tableId], references: [restaurantTables.id] }),
  items: many(restaurantOrderItems),
}));

export const restaurantOrderItemsRelations = relations(restaurantOrderItems, ({ one }) => ({
  order: one(restaurantOrders, { fields: [restaurantOrderItems.orderId], references: [restaurantOrders.id] }),
}));

export const restaurantTablesRelations = relations(restaurantTables, ({ one, many }) => ({
  merchant: one(merchants, { fields: [restaurantTables.merchantId], references: [merchants.id] }),
  orders: many(restaurantOrders),
}));

// ─── Split Bill ───────────────────────────────────────────────────────────────
export const splitBillSessionsRelations = relations(splitBillSessions, ({ one }) => ({
  merchant: one(merchants, { fields: [splitBillSessions.merchantId], references: [merchants.id] }),
}));

// ─── Loyalty ──────────────────────────────────────────────────────────────────
export const loyaltyAccountsRelations = relations(loyaltyAccounts, ({ one, many }) => ({
  merchant: one(merchants, { fields: [loyaltyAccounts.merchantId], references: [merchants.id] }),
  transactions: many(loyaltyTransactions),
}));

export const loyaltyTransactionsRelations = relations(loyaltyTransactions, ({ one }) => ({
  account: one(loyaltyAccounts, { fields: [loyaltyTransactions.accountId], references: [loyaltyAccounts.accountId] }),
}));

// ─── Wave 137: Extended Relations (P2 gap closure) ───────────────────────────
import {
  accessibilityFallbackSessions, adverseMediaScreenings, agentBankingV4Agents,
  aiAuditTrail, billPayments, billingEvents, bnplPlans, bnplRepaymentSchedules,
  bulkCollections, bulkPaymentSchedules, carbonCredits, cashbackBalances,
  cashbackTransactions, chargebacks, complianceReports, consumerBudgets,
  consumerCards, consumerContacts, consumerDisputes, consumerFinanceLoans,
  consumerFraudFlags, consumerKycRecords, consumerLoyaltyAccounts,
  consumerLoyaltyTxns, consumerWallets, consumerWalletTxns, escrowContracts,
  invoices, kycSubmissions,
  paymentLinks, reconciliationAlerts,
  securityAuditSnapshots, keycloakRoleSyncLogs, stripeSubscriptions,
  supportMessages, taxFilingRecords, uboOwners, ussdSessions,
} from "./schema";

export const accessibilityFallbackSessionsRelations = relations(accessibilityFallbackSessions, ({ one }) => ({
  merchant: one(merchants, { fields: [accessibilityFallbackSessions.merchantId], references: [merchants.id] }),
}));
export const adverseMediaScreeningsRelations = relations(adverseMediaScreenings, ({ one }) => ({
  merchant: one(merchants, { fields: [adverseMediaScreenings.merchantId], references: [merchants.id] }),
}));
export const agentBankingV4AgentsRelations = relations(agentBankingV4Agents, ({ one }) => ({
  merchant: one(merchants, { fields: [agentBankingV4Agents.merchantId], references: [merchants.id] }),
}));
export const aiAuditTrailRelations = relations(aiAuditTrail, ({ one }) => ({
  merchant: one(merchants, { fields: [aiAuditTrail.merchantId], references: [merchants.id] }),
}));
export const billPaymentsRelations = relations(billPayments, ({ one }) => ({
  merchant: one(merchants, { fields: [billPayments.merchantId], references: [merchants.id] }),
}));
export const billingEventsRelations = relations(billingEvents, ({ one }) => ({
  merchant: one(merchants, { fields: [billingEvents.merchantId], references: [merchants.id] }),
}));
export const bnplPlansRelations = relations(bnplPlans, ({ one, many }) => ({
  merchant: one(merchants, { fields: [bnplPlans.merchantId], references: [merchants.id] }),
  repayments: many(bnplRepaymentSchedules),
}));
export const bnplRepaymentSchedulesRelations = relations(bnplRepaymentSchedules, ({ one }) => ({
  plan: one(bnplPlans, { fields: [bnplRepaymentSchedules.planId], references: [bnplPlans.id] }),
}));
export const bulkCollectionsRelations = relations(bulkCollections, ({ one }) => ({
  merchant: one(merchants, { fields: [bulkCollections.merchantId], references: [merchants.id] }),
}));
export const bulkPaymentSchedulesRelations = relations(bulkPaymentSchedules, ({ one }) => ({
  merchant: one(merchants, { fields: [bulkPaymentSchedules.merchantId], references: [merchants.id] }),
}));
export const carbonCreditsRelations = relations(carbonCredits, ({ one }) => ({
  merchant: one(merchants, { fields: [carbonCredits.merchantId], references: [merchants.id] }),
}));
export const cashbackBalancesRelations = relations(cashbackBalances, ({ one, many }) => ({
  merchant: one(merchants, { fields: [cashbackBalances.merchantId], references: [merchants.id] }),
  transactions: many(cashbackTransactions),
}));
export const cashbackTransactionsRelations = relations(cashbackTransactions, ({ one }) => ({
  merchant: one(merchants, { fields: [cashbackTransactions.merchantId], references: [merchants.id] }),
}));
export const chargebacksRelations = relations(chargebacks, ({ one }) => ({
  merchant: one(merchants, { fields: [chargebacks.merchantId], references: [merchants.id] }),
  transaction: one(transactions, { fields: [chargebacks.transactionId], references: [transactions.id] }),
}));
export const complianceReportsRelations = relations(complianceReports, ({ one }) => ({
  merchant: one(merchants, { fields: [complianceReports.merchantId], references: [merchants.id] }),
}));
export const consumerBudgetsRelations = relations(consumerBudgets, ({ one }) => ({
  user: one(users, { fields: [consumerBudgets.userId], references: [users.id] }),
}));
export const consumerCardsRelations = relations(consumerCards, ({ one }) => ({
  user: one(users, { fields: [consumerCards.userId], references: [users.id] }),
}));
export const consumerContactsRelations = relations(consumerContacts, ({ one }) => ({
  user: one(users, { fields: [consumerContacts.userId], references: [users.id] }),
}));
export const consumerDisputesRelations = relations(consumerDisputes, ({ one }) => ({
  user: one(users, { fields: [consumerDisputes.userId], references: [users.id] }),
}));
export const consumerFinanceLoansRelations = relations(consumerFinanceLoans, ({ one }) => ({
  merchant: one(merchants, { fields: [consumerFinanceLoans.merchantId], references: [merchants.id] }),
}));
export const consumerFraudFlagsRelations = relations(consumerFraudFlags, ({ one }) => ({
  user: one(users, { fields: [consumerFraudFlags.userId], references: [users.id] }),
}));
export const consumerKycRecordsRelations = relations(consumerKycRecords, ({ one }) => ({
  user: one(users, { fields: [consumerKycRecords.userId], references: [users.id] }),
}));
export const consumerLoyaltyAccountsRelations = relations(consumerLoyaltyAccounts, ({ one, many }) => ({
  user: one(users, { fields: [consumerLoyaltyAccounts.userId], references: [users.id] }),
  transactions: many(consumerLoyaltyTxns),
}));
export const consumerLoyaltyTxnsRelations = relations(consumerLoyaltyTxns, ({ one }) => ({
  user: one(users, { fields: [consumerLoyaltyTxns.userId], references: [users.id] }),
}));
export const consumerWalletsRelations = relations(consumerWallets, ({ one, many }) => ({
  user: one(users, { fields: [consumerWallets.userId], references: [users.id] }),
  transactions: many(consumerWalletTxns),
}));
export const consumerWalletTxnsRelations = relations(consumerWalletTxns, ({ one }) => ({
  user: one(users, { fields: [consumerWalletTxns.userId], references: [users.id] }),
}));
export const escrowContractsRelations = relations(escrowContracts, ({ one }) => ({
  merchant: one(merchants, { fields: [escrowContracts.merchantId], references: [merchants.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  merchant: one(merchants, { fields: [invoices.merchantId], references: [merchants.id] }),
}));
export const kycSubmissionsRelations = relations(kycSubmissions, ({ one }) => ({
  merchant: one(merchants, { fields: [kycSubmissions.merchantId], references: [merchants.id] }),
}));
export const paymentLinksRelations = relations(paymentLinks, ({ one }) => ({
  merchant: one(merchants, { fields: [paymentLinks.merchantId], references: [merchants.id] }),
}));

export const reconciliationAlertsRelations = relations(reconciliationAlerts, ({ one }) => ({
  merchant: one(merchants, { fields: [reconciliationAlerts.merchantId], references: [merchants.id] }),
}));

export const securityAuditSnapshotsRelations = relations(securityAuditSnapshots, ({ one }) => ({
  merchant: one(merchants, { fields: [securityAuditSnapshots.merchantId], references: [merchants.id] }),
}));
export const keycloakRoleSyncLogsRelations = relations(keycloakRoleSyncLogs, ({ one }) => ({
  user: one(users, { fields: [keycloakRoleSyncLogs.userId], references: [users.id] }),
}));
export const stripeSubscriptionsRelations = relations(stripeSubscriptions, ({ one }) => ({
  merchant: one(merchants, { fields: [stripeSubscriptions.merchantId], references: [merchants.id] }),
}));
export const supportMessagesRelations = relations(supportMessages, ({ one }) => ({
  merchant: one(merchants, { fields: [supportMessages.merchantId], references: [merchants.id] }),
}));
export const taxFilingRecordsRelations = relations(taxFilingRecords, ({ one }) => ({
  merchant: one(merchants, { fields: [taxFilingRecords.merchantId], references: [merchants.id] }),
}));
export const uboOwnersRelations = relations(uboOwners, ({ one }) => ({
  merchant: one(merchants, { fields: [uboOwners.merchantId], references: [merchants.id] }),
}));
export const ussdSessionsRelations = relations(ussdSessions, ({ one }) => ({
  merchant: one(merchants, { fields: [ussdSessions.merchantId], references: [merchants.id] }),
}));
