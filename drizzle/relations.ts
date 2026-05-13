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
