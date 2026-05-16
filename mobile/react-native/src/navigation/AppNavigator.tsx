/**
 * PayGate Merchant Portal — React Native App Navigator
 * Stack + Tab navigation with auth gating.
 */
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, Text, StyleSheet } from "react-native";

// Screens
import LoginScreen from "../screens/LoginScreen";
import DashboardScreen from "../screens/DashboardScreen";
import TransactionsScreen from "../screens/TransactionsScreen";
import CustomersScreen from "../screens/CustomersScreen";
import PayoutsScreen from "../screens/PayoutsScreen";
import AnalyticsScreen from "../screens/AnalyticsScreen";
import APIKeysScreen from "../screens/APIKeysScreen";
import PayrollScreen from "../screens/PayrollScreen";
import TeamRolesScreen from "../screens/TeamRolesScreen";
import MobileMoneyReconScreen from "../screens/MobileMoneyReconScreen";
import FXDashboardScreen from "../screens/FXDashboardScreen";
import CheckoutScreen from "../screens/CheckoutScreen";
import BillPaymentsScreen from "../screens/BillPaymentsScreen";
import CarbonCreditsScreen from "../screens/CarbonCreditsScreen";
import SubscriptionsScreen from "../screens/SubscriptionsScreen";
import CouponsScreen from "../screens/CouponsScreen";
import WebhooksScreen from "../screens/WebhooksScreen";
import SettingsScreen from "../screens/SettingsScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import DisputesScreen from "../screens/DisputesScreen";
import VirtualCardsScreen from "../screens/VirtualCardsScreen";
import BillingEngineScreen from "../screens/BillingEngineScreen";
import AdminOverviewScreen from "../screens/AdminOverviewScreen";
import AIHubScreen from "../screens/AIHubScreen";
import AuthScreen from "../screens/AuthScreen";
import BillingScreen from "../screens/BillingScreen";
import CryptoScreen from "../screens/CryptoScreen";
import EscrowScreen from "../screens/EscrowScreen";
import InsuranceScreen from "../screens/InsuranceScreen";
import KYBDocumentUploadScreen from "../screens/KYBDocumentUploadScreen";
import LoyaltyScreen from "../screens/LoyaltyScreen";
import MobileMoneyScreen from "../screens/MobileMoneyScreen";
import NIPScreen from "../screens/NIPScreen";
import POSScreen from "../screens/POSScreen";
import ProfileScreen from "../screens/ProfileScreen";
import SIPScreen from "../screens/SIPScreen";
import TeamScreen from "../screens/TeamScreen";
import USSDScreen from "../screens/USSDScreen";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  APIKeys: undefined;
  Webhooks: undefined;
  Notifications: undefined;
  Disputes: undefined;
  VirtualCards: undefined;
  Settings: undefined;
  Payroll: undefined;
  TeamRoles: undefined;
  MobileMoneyRecon: undefined;
  FXDashboard: undefined;
  Checkout: undefined;
  BillPayments: undefined;
  CarbonCredits: undefined;
  Subscriptions: undefined;
  Coupons: undefined;
  BillingEngine: undefined;
  AdminOverview: undefined;
  AIHub: undefined;
  Auth: undefined;
  Billing: undefined;
  Crypto: undefined;
  Escrow: undefined;
  Insurance: undefined;
  KYBDocumentUpload: undefined;
  Loyalty: undefined;
  MobileMoney: undefined;
  NIP: undefined;
  POS: undefined;
  Profile: undefined;
  SIP: undefined;
  Team: undefined;
  USSD: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Transactions: undefined;
  Customers: undefined;
  Payouts: undefined;
  Analytics: undefined;
};

// ─── Theme ────────────────────────────────────────────────────────────────────

const colors = {
  primary: "#6366F1",
  background: "#0F172A",
  card: "#1E293B",
  text: "#F1F5F9",
  muted: "#94A3B8",
  border: "#334155",
  tabActive: "#6366F1",
  tabInactive: "#64748B",
};

// ─── Tab Icon ─────────────────────────────────────────────────────────────────

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Dashboard: "⊞",
    Transactions: "⇄",
    Customers: "◉",
    Payouts: "↑",
    Analytics: "▲",
  };
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.tabEmoji, { opacity: focused ? 1 : 0.5 }]}>
        {icons[label] ?? "•"}
      </Text>
      <Text
        style={[
          styles.tabLabel,
          { color: focused ? colors.tabActive : colors.tabInactive },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Main Tab Navigator ───────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Dashboard" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Transactions" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Customers"
        component={CustomersScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Customers" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Payouts"
        component={PayoutsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Payouts" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Analytics" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Root Stack Navigator ─────────────────────────────────────────────────────

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: colors.primary,
          background: colors.background,
          card: colors.card,
          text: colors.text,
          border: colors.border,
          notification: colors.primary,
        },
        fonts: {
          regular: { fontFamily: "System", fontWeight: "400" },
          medium: { fontFamily: "System", fontWeight: "500" },
          bold: { fontFamily: "System", fontWeight: "700" },
          heavy: { fontFamily: "System", fontWeight: "900" },
        },
      }}
    >
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="APIKeys"
          component={APIKeysScreen}
          options={{ title: "API Keys" }}
        />
        <Stack.Screen
          name="Webhooks"
          component={WebhooksScreen}
          options={{ title: "Webhooks" }}
        />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: "Notifications" }}
        />
        <Stack.Screen
          name="Disputes"
          component={DisputesScreen}
          options={{ title: "Disputes" }}
        />
        <Stack.Screen
          name="VirtualCards"
          component={VirtualCardsScreen}
          options={{ title: "Virtual Cards" }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: "Settings" }}
        />
        <Stack.Screen
          name="Payroll"
          component={PayrollScreen}
          options={{ title: "Payroll" }}
        />
        <Stack.Screen
          name="TeamRoles"
          component={TeamRolesScreen}
          options={{ title: "Team & Roles" }}
        />
        <Stack.Screen
          name="MobileMoneyRecon"
          component={MobileMoneyReconScreen}
          options={{ title: "Mobile Money Recon" }}
        />
        <Stack.Screen
          name="FXDashboard"
          component={FXDashboardScreen}
          options={{ title: "FX Dashboard" }}
        />
        <Stack.Screen
          name="Checkout"
          component={CheckoutScreen}
          options={{ title: "Checkout Links" }}
        />
        <Stack.Screen
          name="BillPayments"
          component={BillPaymentsScreen}
          options={{ title: "Bill Payments" }}
        />
        <Stack.Screen
          name="CarbonCredits"
          component={CarbonCreditsScreen}
          options={{ title: "Carbon Credits" }}
        />
        <Stack.Screen
          name="Subscriptions"
          component={SubscriptionsScreen}
          options={{ title: "Subscriptions" }}
        />
        <Stack.Screen
          name="Coupons"
          component={CouponsScreen}
          options={{ title: "Coupons" }}
        />
        <Stack.Screen
          name="BillingEngine"
          component={BillingEngineScreen}
          options={{ title: "Billing Engine" }}
        />
        <Stack.Screen
          name="AdminOverview"
          component={AdminOverviewScreen}
          options={{ title: "Admin Overview" }}
        />
        <Stack.Screen
          name="AIHub"
          component={AIHubScreen}
          options={{ title: "AI Insights Hub" }}
        />
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={{ title: "Sign In", headerShown: false }}
        />
        <Stack.Screen
          name="Billing"
          component={BillingScreen}
          options={{ title: "Billing" }}
        />
        <Stack.Screen
          name="Crypto"
          component={CryptoScreen}
          options={{ title: "Crypto Wallet" }}
        />
        <Stack.Screen
          name="Escrow"
          component={EscrowScreen}
          options={{ title: "Escrow Accounts" }}
        />
        <Stack.Screen
          name="Insurance"
          component={InsuranceScreen}
          options={{ title: "Insurance" }}
        />
        <Stack.Screen
          name="KYBDocumentUpload"
          component={KYBDocumentUploadScreen}
          options={{ title: "KYB Document Upload" }}
        />
        <Stack.Screen
          name="Loyalty"
          component={LoyaltyScreen}
          options={{ title: "Loyalty Program" }}
        />
        <Stack.Screen
          name="MobileMoney"
          component={MobileMoneyScreen}
          options={{ title: "Mobile Money" }}
        />
        <Stack.Screen
          name="NIP"
          component={NIPScreen}
          options={{ title: "NIP Transfer" }}
        />
        <Stack.Screen
          name="POS"
          component={POSScreen}
          options={{ title: "POS Terminals" }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ title: "My Profile" }}
        />
        <Stack.Screen
          name="SIP"
          component={SIPScreen}
          options={{ title: "SIP Investments" }}
        />
        <Stack.Screen
          name="Team"
          component={TeamScreen}
          options={{ title: "Team" }}
        />
        <Stack.Screen
          name="USSD"
          component={USSDScreen}
          options={{ title: "USSD Services" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabIcon: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
  },
  tabEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: "500",
  },
});
