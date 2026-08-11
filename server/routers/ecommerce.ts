// server/routers/ecommerce.ts
// Full e-commerce tRPC router: products, cart, checkout, orders, fulfilment webhooks.
// Wired to: PostgreSQL (Drizzle), Stripe PaymentIntents, TigerBeetle (ledger),
//           Kafka (order events), Temporal (fulfilment workflows).

import { z } from "zod";
import { eq, and, desc, asc, inArray, sql, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { db } from "../db";
import {
  products, productVariants, carts, cartItems,
  checkoutSessions, orders, orderItems, fulfilmentEvents,
} from "../../drizzle/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${ts}-${rand}`;
}

async function recalcCart(cartId: string) {
  const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cartId));
  const subtotal = items.reduce((s, i) => s + Number(i.totalPriceKobo), 0);
  await db.update(carts)
    .set({ subtotalKobo: subtotal, totalKobo: subtotal, updatedAt: new Date() })
    .where(eq(carts.id, cartId));
}

// Publish Kafka event (fire-and-forget, non-blocking)
async function publishKafkaEvent(topic: string, payload: Record<string, unknown>) {
  const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL;
  if (!bridgeUrl) return;
  try {
    await fetch(`${bridgeUrl}/kafka/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify({ topic, payload }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Non-blocking — Kafka publish failures are logged by the bridge
  }
}

// Record TigerBeetle double-entry transfer
async function recordTigerBeetleTransfer(opts: {
  ledgerId: number;
  debitAccountId: bigint;
  creditAccountId: bigint;
  amountKobo: number;
  code: number;
  userData: bigint;
}): Promise<bigint | null> {
  const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL;
  if (!bridgeUrl) return null;
  try {
    const res = await fetch(`${bridgeUrl}/tigerbeetle/transfer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify(opts),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { transferId?: string };
    return json.transferId ? BigInt(json.transferId) : null;
  } catch {
    return null;
  }
}

// Start Temporal fulfilment workflow
async function startFulfilmentWorkflow(orderId: string, merchantId: string): Promise<string | null> {
  const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL;
  if (!bridgeUrl) return null;
  try {
    const res = await fetch(`${bridgeUrl}/temporal/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify({
        namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
        taskQueue: "ecommerce-fulfilment",
        workflowType: "FulfilmentWorkflow",
        workflowId: `fulfilment-${orderId}`,
        input: { orderId, merchantId },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { workflowId?: string };
    return json.workflowId ?? null;
  } catch {
    return null;
  }
}

// ─── Products Sub-router ──────────────────────────────────────────────────────

const productsRouter = router({
  list: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(),
      status: z.enum(["draft", "active", "archived"]).optional(),
      category: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      sortBy: z.enum(["createdAt", "name", "priceKobo"]).default("createdAt"),
      sortDir: z.enum(["asc", "desc"]).default("desc"),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (input.merchantId) conditions.push(eq(products.merchantId, input.merchantId));
      if (input.status) conditions.push(eq(products.status, input.status));
      if (input.category) conditions.push(eq(products.category, input.category));
      if (input.search) {
        conditions.push(or(
          like(products.name, `%${input.search}%`),
          like(products.description, `%${input.search}%`),
        )!);
      }

      const orderCol = input.sortBy === "name" ? products.name
        : input.sortBy === "priceKobo" ? products.priceKobo
        : products.createdAt;
      const orderFn = input.sortDir === "asc" ? asc(orderCol) : desc(orderCol);

      const rows = await db.select().from(products)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(orderFn)
        .limit(input.limit)
        .offset(input.offset);

      const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(products)
        .where(conditions.length ? and(...conditions) : undefined);

      return { products: rows, total: Number(total) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [product] = await db.select().from(products).where(eq(products.id, input.id));
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      const variants = await db.select().from(productVariants)
        .where(eq(productVariants.productId, input.id))
        .orderBy(asc(productVariants.position));
      return { product, variants };
    }),

  create: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      tenantId: z.string(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      status: z.enum(["draft", "active", "archived"]).default("draft"),
      priceKobo: z.number().int().positive(),
      comparePriceKobo: z.number().int().positive().optional(),
      currency: z.string().default("NGN"),
      sku: z.string().optional(),
      barcode: z.string().optional(),
      trackInventory: z.boolean().default(false),
      inventoryQty: z.number().int().min(0).default(0),
      imageUrls: z.array(z.string().url()).default([]),
      tags: z.array(z.string()).default([]),
      category: z.string().optional(),
      taxable: z.boolean().default(true),
      requiresShipping: z.boolean().default(true),
      variants: z.array(z.object({
        title: z.string(),
        sku: z.string().optional(),
        priceKobo: z.number().int().positive(),
        inventoryQty: z.number().int().min(0).default(0),
        options: z.record(z.string(), z.string()).default({}),
      })).default([]),
    }))
    .mutation(async ({ input }) => {
      const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
      const [product] = await db.insert(products).values({
        ...input,
        slug,
        variants: undefined,
      } as any).returning();

      if (input.variants.length > 0) {
        await db.insert(productVariants).values(
          input.variants.map((v, i) => ({
            productId: product.id,
            title: v.title,
            sku: v.sku,
            priceKobo: v.priceKobo,
            inventoryQty: v.inventoryQty,
            options: v.options,
            position: i,
          })),
        );
      }

      await publishKafkaEvent(`${input.tenantId}.product.created`, {
        productId: product.id, merchantId: input.merchantId, name: input.name,
      });

      return product;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      status: z.enum(["draft", "active", "archived"]).optional(),
      priceKobo: z.number().int().positive().optional(),
      comparePriceKobo: z.number().int().positive().optional(),
      inventoryQty: z.number().int().min(0).optional(),
      imageUrls: z.array(z.string().url()).optional(),
      tags: z.array(z.string()).optional(),
      category: z.string().optional(),
      taxable: z.boolean().optional(),
      requiresShipping: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const [product] = await db.update(products)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(products.id, id))
        .returning();
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      return product;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const [product] = await db.update(products)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(products.id, input.id))
        .returning();
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      return { success: true };
    }),
});

// ─── Cart Sub-router ──────────────────────────────────────────────────────────

const cartRouter = router({
  get: publicProcedure
    .input(z.object({
      cartId: z.string().optional(),
      sessionToken: z.string().optional(),
    }))
    .query(async ({ input }) => {
      if (!input.cartId && !input.sessionToken) return null;

      const condition = input.cartId
        ? eq(carts.id, input.cartId)
        : eq(carts.sessionToken, input.sessionToken!);

      const [cart] = await db.select().from(carts).where(condition);
      if (!cart) return null;

      const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id));
      return { cart, items };
    }),

  create: publicProcedure
    .input(z.object({
      merchantId: z.string(),
      tenantId: z.string(),
      consumerId: z.string().optional(),
      sessionToken: z.string().optional(),
      currency: z.string().default("NGN"),
    }))
    .mutation(async ({ input }) => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const [cart] = await db.insert(carts).values({ ...input, expiresAt }).returning();
      return cart;
    }),

  addItem: publicProcedure
    .input(z.object({
      cartId: z.string(),
      productId: z.string(),
      variantId: z.string().optional(),
      quantity: z.number().int().positive().default(1),
    }))
    .mutation(async ({ input }) => {
      const [cart] = await db.select().from(carts).where(eq(carts.id, input.cartId));
      if (!cart) throw new TRPCError({ code: "NOT_FOUND", message: "Cart not found" });

      const [product] = await db.select().from(products).where(eq(products.id, input.productId));
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      if (product.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Product is not available" });

      let unitPriceKobo = Number(product.priceKobo);
      if (input.variantId) {
        const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, input.variantId));
        if (variant) unitPriceKobo = Number(variant.priceKobo);
      }

      // Check if item already in cart
      const existing = await db.select().from(cartItems).where(
        and(eq(cartItems.cartId, input.cartId), eq(cartItems.productId, input.productId),
          input.variantId ? eq(cartItems.variantId, input.variantId) : sql`variant_id IS NULL`),
      );

      if (existing.length > 0) {
        const newQty = existing[0].quantity + input.quantity;
        await db.update(cartItems).set({
          quantity: newQty,
          totalPriceKobo: unitPriceKobo * newQty,
          updatedAt: new Date(),
        }).where(eq(cartItems.id, existing[0].id));
      } else {
        await db.insert(cartItems).values({
          cartId: input.cartId,
          productId: input.productId,
          variantId: input.variantId,
          quantity: input.quantity,
          unitPriceKobo,
          totalPriceKobo: unitPriceKobo * input.quantity,
          productSnapshot: { name: product.name, imageUrl: (product.imageUrls as string[])?.[0], sku: product.sku ?? undefined },
        });
      }

      await recalcCart(input.cartId);
      const [updatedCart] = await db.select().from(carts).where(eq(carts.id, input.cartId));
      const items = await db.select().from(cartItems).where(eq(cartItems.cartId, input.cartId));
      return { cart: updatedCart, items };
    }),

  removeItem: publicProcedure
    .input(z.object({ cartItemId: z.string() }))
    .mutation(async ({ input }) => {
      const [item] = await db.select().from(cartItems).where(eq(cartItems.id, input.cartItemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Cart item not found" });
      await db.delete(cartItems).where(eq(cartItems.id, input.cartItemId));
      await recalcCart(item.cartId);
      const [cart] = await db.select().from(carts).where(eq(carts.id, item.cartId));
      const items = await db.select().from(cartItems).where(eq(cartItems.cartId, item.cartId));
      return { cart, items };
    }),

  updateQuantity: publicProcedure
    .input(z.object({ cartItemId: z.string(), quantity: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const [item] = await db.select().from(cartItems).where(eq(cartItems.id, input.cartItemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Cart item not found" });
      await db.update(cartItems).set({
        quantity: input.quantity,
        totalPriceKobo: Number(item.unitPriceKobo) * input.quantity,
        updatedAt: new Date(),
      }).where(eq(cartItems.id, input.cartItemId));
      await recalcCart(item.cartId);
      const [cart] = await db.select().from(carts).where(eq(carts.id, item.cartId));
      const items = await db.select().from(cartItems).where(eq(cartItems.cartId, item.cartId));
      return { cart, items };
    }),

  clear: publicProcedure
    .input(z.object({ cartId: z.string() }))
    .mutation(async ({ input }) => {
      await db.delete(cartItems).where(eq(cartItems.cartId, input.cartId));
      await db.update(carts).set({
        subtotalKobo: 0, totalKobo: 0, updatedAt: new Date(),
      }).where(eq(carts.id, input.cartId));
      return { success: true };
    }),
});

// ─── Checkout Sub-router ──────────────────────────────────────────────────────

const checkoutRouter = router({
  createSession: publicProcedure
    .input(z.object({
      cartId: z.string(),
      merchantId: z.string(),
      tenantId: z.string(),
      consumerId: z.string().optional(),
      paymentMethod: z.enum(["card", "bank_transfer", "ussd", "bnpl", "usdc"]).default("card"),
      shippingName: z.string(),
      shippingPhone: z.string(),
      shippingEmail: z.string().email(),
      shippingLine1: z.string(),
      shippingLine2: z.string().optional(),
      shippingCity: z.string(),
      shippingState: z.string(),
      shippingCountry: z.string().default("NG"),
      shippingPostalCode: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [cart] = await db.select().from(carts).where(eq(carts.id, input.cartId));
      if (!cart) throw new TRPCError({ code: "NOT_FOUND", message: "Cart not found" });
      if (Number(cart.totalKobo) <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Cart is empty" });

      // Create Stripe PaymentIntent for card payments
      let paymentIntentId: string | undefined;
      let stripeClientSecret: string | undefined;

      if (input.paymentMethod === "card" && process.env.STRIPE_SECRET_KEY) {
        try {
          const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.STRIPE_SECRET_KEY}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              amount: String(Number(cart.totalKobo)),
              currency: "ngn",
              "payment_method_types[]": "card",
              "metadata[cartId]": input.cartId,
              "metadata[merchantId]": input.merchantId,
            }).toString(),
          });
          if (stripeRes.ok) {
            const pi = await stripeRes.json() as { id: string; client_secret: string };
            paymentIntentId = pi.id;
            stripeClientSecret = pi.client_secret;
          }
        } catch {
          // Stripe unavailable — proceed without PaymentIntent (NIBSS fallback)
        }
      }

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min
      const [session] = await db.insert(checkoutSessions).values({
        cartId: input.cartId,
        merchantId: input.merchantId,
        tenantId: input.tenantId,
        consumerId: input.consumerId,
        paymentMethod: input.paymentMethod,
        paymentIntentId,
        stripeClientSecret,
        amountKobo: Number(cart.totalKobo),
        currency: cart.currency,
        shippingName: input.shippingName,
        shippingPhone: input.shippingPhone,
        shippingEmail: input.shippingEmail,
        shippingLine1: input.shippingLine1,
        shippingLine2: input.shippingLine2,
        shippingCity: input.shippingCity,
        shippingState: input.shippingState,
        shippingCountry: input.shippingCountry,
        shippingPostalCode: input.shippingPostalCode,
        expiresAt,
      }).returning();

      await publishKafkaEvent(`${input.tenantId}.checkout.session_created`, {
        sessionId: session.id, cartId: input.cartId, merchantId: input.merchantId,
        amountKobo: Number(cart.totalKobo),
      });

      return session;
    }),

  confirmPayment: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      paymentIntentId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [session] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Checkout session not found" });
      if (session.status === "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Already completed" });
      if (session.status === "expired") throw new TRPCError({ code: "BAD_REQUEST", message: "Session expired" });

      // Verify Stripe PaymentIntent status
      if (session.paymentIntentId && process.env.STRIPE_SECRET_KEY) {
        const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${session.paymentIntentId}`, {
          headers: { "Authorization": `Bearer ${process.env.STRIPE_SECRET_KEY}` },
        });
        if (piRes.ok) {
          const pi = await piRes.json() as { status: string };
          if (pi.status !== "succeeded" && pi.status !== "processing") {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Payment not confirmed: ${pi.status}` });
          }
        }
      }

      // Mark session completed
      await db.update(checkoutSessions).set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(checkoutSessions.id, input.sessionId));

      // Fetch cart items to create order
      const cartItemRows = await db.select().from(cartItems).where(eq(cartItems.cartId, session.cartId));
      if (cartItemRows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Cart is empty" });

      // Create order
      const orderNumber = generateOrderNumber();
      const [order] = await db.insert(orders).values({
        orderNumber,
        merchantId: session.merchantId,
        tenantId: session.tenantId,
        consumerId: session.consumerId,
        checkoutSessionId: session.id,
        status: "confirmed",
        paymentMethod: session.paymentMethod,
        paymentIntentId: session.paymentIntentId,
        paidAt: new Date(),
        subtotalKobo: Number(session.amountKobo),
        totalKobo: Number(session.amountKobo),
        currency: session.currency,
        shippingName: session.shippingName,
        shippingPhone: session.shippingPhone,
        shippingEmail: session.shippingEmail,
        shippingLine1: session.shippingLine1,
        shippingLine2: session.shippingLine2,
        shippingCity: session.shippingCity,
        shippingState: session.shippingState,
        shippingCountry: session.shippingCountry,
        shippingPostalCode: session.shippingPostalCode,
      }).returning();

      // Create order items from cart items
      await db.insert(orderItems).values(cartItemRows.map(ci => ({
        orderId: order.id,
        productId: ci.productId,
        variantId: ci.variantId,
        quantity: ci.quantity,
        unitPriceKobo: Number(ci.unitPriceKobo),
        totalPriceKobo: Number(ci.totalPriceKobo),
        productSnapshot: ci.productSnapshot as any,
      })));

      // Record TigerBeetle ledger entry (order revenue)
      const tbTransferId = await recordTigerBeetleTransfer({
        ledgerId: 1,
        debitAccountId: BigInt(1001),   // Consumer liability account
        creditAccountId: BigInt(2001),  // Merchant revenue account
        amountKobo: Number(session.amountKobo),
        code: 1100, // Order payment code
        userData: BigInt("0x" + order.id.replace(/-/g, "").slice(0, 16)),
      });

      if (tbTransferId) {
        await db.update(orders).set({ tigerBeetleTransferId: Number(tbTransferId) }).where(eq(orders.id, order.id));
      }

      // Start Temporal fulfilment workflow
      const workflowId = await startFulfilmentWorkflow(order.id, session.merchantId);
      if (workflowId) {
        await db.update(orders).set({ temporalWorkflowId: workflowId }).where(eq(orders.id, order.id));
      }

      // Record first fulfilment event
      await db.insert(fulfilmentEvents).values({
        orderId: order.id,
        merchantId: session.merchantId,
        eventType: "payment_received",
        status: "confirmed",
        message: `Payment of ₦${(Number(session.amountKobo) / 100).toLocaleString()} confirmed`,
        actorType: "system",
        webhookSource: session.paymentMethod === "card" ? "stripe" : "nibss",
      });

      // Publish Kafka order.created event
      await publishKafkaEvent(`${session.tenantId}.order.created`, {
        orderId: order.id,
        orderNumber,
        merchantId: session.merchantId,
        amountKobo: Number(session.amountKobo),
        paymentMethod: session.paymentMethod,
        temporalWorkflowId: workflowId,
      });

      // Clear cart
      await db.update(carts).set({ completedAt: new Date() }).where(eq(carts.id, session.cartId));

      return { order, orderNumber };
    }),

  getStatus: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const [session] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      return session;
    }),
});

// ─── Orders Sub-router ────────────────────────────────────────────────────────

const ordersRouter = router({
  list: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(),
      status: z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"]).optional(),
      fulfilmentStatus: z.enum(["unfulfilled", "partial", "fulfilled", "returned"]).optional(),
      search: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions = [];
      if (input.merchantId) conditions.push(eq(orders.merchantId, input.merchantId));
      if (input.status) conditions.push(eq(orders.status, input.status));
      if (input.fulfilmentStatus) conditions.push(eq(orders.fulfilmentStatus, input.fulfilmentStatus));
      if (input.search) {
        conditions.push(or(
          like(orders.orderNumber, `%${input.search}%`),
          like(orders.shippingName, `%${input.search}%`),
          like(orders.shippingEmail, `%${input.search}%`),
        )!);
      }

      const rows = await db.select().from(orders)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(orders.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(orders)
        .where(conditions.length ? and(...conditions) : undefined);

      return { orders: rows, total: Number(total) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [order] = await db.select().from(orders).where(eq(orders.id, input.id));
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.id));
      const events = await db.select().from(fulfilmentEvents)
        .where(eq(fulfilmentEvents.orderId, input.id))
        .orderBy(asc(fulfilmentEvents.createdAt));

      return { order, items, events };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["confirmed", "processing", "shipped", "delivered", "cancelled"]),
      trackingNumber: z.string().optional(),
      trackingCarrier: z.string().optional(),
      cancelReason: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [order] = await db.select().from(orders).where(eq(orders.id, input.id));
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });

      const updates: Partial<typeof orders.$inferInsert> = {
        status: input.status,
        updatedAt: new Date(),
      };

      if (input.status === "shipped") {
        updates.shippedAt = new Date();
        updates.trackingNumber = input.trackingNumber;
        updates.trackingCarrier = input.trackingCarrier;
        updates.fulfilmentStatus = "partial";
      }
      if (input.status === "delivered") {
        updates.deliveredAt = new Date();
        updates.fulfilmentStatus = "fulfilled";
      }
      if (input.status === "cancelled") {
        updates.cancelledAt = new Date();
        updates.cancelReason = input.cancelReason;
      }
      if (input.notes) updates.notes = input.notes;

      const [updated] = await db.update(orders).set(updates).where(eq(orders.id, input.id)).returning();

      // Record fulfilment event
      await db.insert(fulfilmentEvents).values({
        orderId: input.id,
        merchantId: order.merchantId,
        eventType: input.status,
        status: input.status,
        message: input.notes ?? `Order status updated to ${input.status}`,
        trackingNumber: input.trackingNumber,
        trackingCarrier: input.trackingCarrier,
        actorId: String(ctx.user.id),
        actorType: "merchant",
        webhookSource: "manual",
      });

      // Publish Kafka event
      await publishKafkaEvent(`${order.tenantId}.order.status_updated`, {
        orderId: input.id,
        orderNumber: order.orderNumber,
        merchantId: order.merchantId,
        previousStatus: order.status,
        newStatus: input.status,
        trackingNumber: input.trackingNumber,
      });

      return updated;
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [order] = await db.select().from(orders).where(eq(orders.id, input.id));
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      if (["shipped", "delivered"].includes(order.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot cancel a shipped or delivered order" });
      }

      const [updated] = await db.update(orders).set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: input.reason,
        updatedAt: new Date(),
      }).where(eq(orders.id, input.id)).returning();

      await db.insert(fulfilmentEvents).values({
        orderId: input.id,
        merchantId: order.merchantId,
        eventType: "cancelled",
        status: "cancelled",
        message: input.reason ?? "Order cancelled by merchant",
        actorId: String(ctx.user.id),
        actorType: "merchant",
        webhookSource: "manual",
      });

      await publishKafkaEvent(`${order.tenantId}.order.cancelled`, {
        orderId: input.id, orderNumber: order.orderNumber, merchantId: order.merchantId,
        reason: input.reason,
      });

      return updated;
    }),

  bulkUpdateStatus: protectedProcedure
    .input(z.object({
      ids: z.array(z.string()).min(1).max(50),
      status: z.enum(["confirmed", "processing", "shipped", "delivered", "cancelled"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.update(orders).set({ status: input.status, updatedAt: new Date() })
        .where(inArray(orders.id, input.ids));

      // Bulk fulfilment events
      const orderRows = await db.select({ id: orders.id, merchantId: orders.merchantId })
        .from(orders).where(inArray(orders.id, input.ids));

      if (orderRows.length > 0) {
        await db.insert(fulfilmentEvents).values(orderRows.map(o => ({
          orderId: o.id,
          merchantId: o.merchantId,
          eventType: input.status,
          status: input.status,
          message: `Bulk status update to ${input.status}`,
          actorId: String(ctx.user.id),
          actorType: "merchant" as const,
          webhookSource: "manual",
        })));
      }

      return { updated: input.ids.length };
    }),
});

// ─── Fulfilment Sub-router ────────────────────────────────────────────────────

const fulfilmentRouter = router({
  webhook: publicProcedure
    .input(z.object({
      source: z.enum(["stripe", "temporal", "manual"]),
      eventType: z.string(),
      orderId: z.string().optional(),
      paymentIntentId: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      let order: typeof orders.$inferSelect | undefined;

      // Resolve order by paymentIntentId or orderId
      if (input.paymentIntentId) {
        const rows = await db.select().from(orders).where(eq(orders.paymentIntentId, input.paymentIntentId));
        order = rows[0];
      } else if (input.orderId) {
        const rows = await db.select().from(orders).where(eq(orders.id, input.orderId));
        order = rows[0];
      }

      if (!order) {
        // Webhook for unknown order — log and return 200 to avoid Stripe retries
        return { received: true, matched: false };
      }

      // Map Stripe event types to order status
      const statusMap: Record<string, typeof orders.$inferInsert["status"]> = {
        "payment_intent.succeeded": "confirmed",
        "payment_intent.payment_failed": "cancelled",
        "charge.refunded": "refunded",
      };

      const newStatus = statusMap[input.eventType];
      if (newStatus) {
        await db.update(orders).set({ status: newStatus, updatedAt: new Date() }).where(eq(orders.id, order.id));
      }

      // Record fulfilment event
      await db.insert(fulfilmentEvents).values({
        orderId: order.id,
        merchantId: order.merchantId,
        eventType: input.eventType,
        status: newStatus ?? "updated",
        message: `Webhook received from ${input.source}: ${input.eventType}`,
        actorType: "system",
        webhookSource: input.source,
        metadata: (input.metadata ?? {}) as Record<string, unknown>,
      });

      // Publish Kafka event
      await publishKafkaEvent(`${order.tenantId}.order.webhook`, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        merchantId: order.merchantId,
        source: input.source,
        eventType: input.eventType,
        newStatus,
      });

      return { received: true, matched: true, orderId: order.id };
    }),

  getTimeline: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      const events = await db.select().from(fulfilmentEvents)
        .where(eq(fulfilmentEvents.orderId, input.orderId))
        .orderBy(asc(fulfilmentEvents.createdAt));
      return events;
    }),
});

// ─── Root E-Commerce Router ───────────────────────────────────────────────────

export const ecommerceRouter = router({
  products: productsRouter,
  cart: cartRouter,
  checkout: checkoutRouter,
  orders: ordersRouter,
  fulfilment: fulfilmentRouter,
});
