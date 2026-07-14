// @ts-nocheck
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { CreditCard, Building2, Phone, Smartphone, DollarSign, CheckCircle2, ArrowLeft, Loader2, MapPin, User, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function fmt(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PAYMENT_METHODS = [
  { id: "card", label: "Debit/Credit Card", icon: CreditCard, desc: "Visa, Mastercard, Verve" },
  { id: "bank_transfer", label: "Bank Transfer", icon: Building2, desc: "NIP instant transfer" },
  { id: "ussd", label: "USSD", icon: Phone, desc: "*737# and others" },
  { id: "bnpl", label: "Buy Now Pay Later", icon: Smartphone, desc: "Pay in 3 instalments" },
  { id: "usdc", label: "USDC Stablecoin", icon: DollarSign, desc: "Pay with USDC" },
] as const;

const STEPS = ["Shipping", "Payment", "Review"] as const;

export default function CheckoutPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const cartId = params.get("cartId") ?? localStorage.getItem("paygate_cart_id");

  const [step, setStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank_transfer" | "ussd" | "bnpl" | "usdc">("card");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<{ orderNumber: string; orderId: string } | null>(null);

  const [shipping, setShipping] = useState({
    name: "", phone: "", email: "", line1: "", line2: "",
    city: "", state: "", country: "NG", postalCode: "",
  });

  const { data: cartData, isLoading: cartLoading } = trpc.ecommerce.cart.get.useQuery(
    { cartId: cartId ?? undefined },
    { enabled: !!cartId, staleTime: 10_000 },
  );

  const createSessionMutation = trpc.ecommerce.checkout.createSession.useMutation();
  const confirmPaymentMutation = trpc.ecommerce.checkout.confirmPayment.useMutation();

  const cart = cartData?.cart;
  const items = cartData?.items ?? [];

  const handleShippingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipping.name || !shipping.phone || !shipping.email || !shipping.line1 || !shipping.city || !shipping.state) {
      toast.error("Please fill in all required shipping fields");
      return;
    }
    setStep(1);
  };

  const handlePaymentSubmit = () => {
    setStep(2);
  };

  const handleConfirmOrder = async () => {
    if (!cartId || !cart) return;
    setIsSubmitting(true);
    try {
      // Create checkout session
      const session = await createSessionMutation.mutateAsync({
        cartId,
        merchantId: "default",
        tenantId: "default",
        paymentMethod,
        shippingName: shipping.name,
        shippingPhone: shipping.phone,
        shippingEmail: shipping.email,
        shippingLine1: shipping.line1,
        shippingLine2: shipping.line2 || undefined,
        shippingCity: shipping.city,
        shippingState: shipping.state,
        shippingCountry: shipping.country,
        shippingPostalCode: shipping.postalCode || undefined,
      });

      // For card payments, in production Stripe.js would confirm the PaymentIntent here.
      // For other methods (bank transfer, USSD), the payment is confirmed via webhook.
      // We simulate confirmation for demo purposes.
      const result = await confirmPaymentMutation.mutateAsync({ sessionId: session.id });

      localStorage.removeItem("paygate_cart_id");
      setCompletedOrder({ orderNumber: result.orderNumber, orderId: result.order.id });
      toast.success("Order placed successfully!");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to place order");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (completedOrder) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Order Confirmed!</h2>
          <p className="text-muted-foreground mb-1">Your order has been placed successfully.</p>
          <p className="text-sm font-mono font-semibold text-indigo-600 mb-6">{completedOrder.orderNumber}</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => navigate("/storefront")}>
              Continue Shopping
            </Button>
            <Button onClick={() => navigate(`/orders/${completedOrder.orderId}`)}>
              Track Order
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/cart")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Cart
        </Button>
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Checkout</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              i < step ? "bg-emerald-500 text-white" : i === step ? "bg-indigo-600 text-white" : "bg-muted text-muted-foreground"
            }`}>
              {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-sm font-medium ${i === step ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
            {i < STEPS.length - 1 && <div className="w-8 h-px bg-border mx-1" />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form */}
        <div className="lg:col-span-2">
          {/* Step 0: Shipping */}
          {step === 0 && (
            <form onSubmit={handleShippingSubmit} className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-500" /> Shipping Address
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <div className="relative mt-1">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input id="name" placeholder="John Doe" value={shipping.name} onChange={e => setShipping(s => ({ ...s, name: e.target.value }))} className="pl-8" required />
                  </div>
                </div>
                <div>
                  <Label htmlFor="phone">Phone *</Label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input id="phone" placeholder="+234 801 234 5678" value={shipping.phone} onChange={e => setShipping(s => ({ ...s, phone: e.target.value }))} className="pl-8" required />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input id="email" type="email" placeholder="john@example.com" value={shipping.email} onChange={e => setShipping(s => ({ ...s, email: e.target.value }))} className="pl-8" required />
                  </div>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="line1">Address Line 1 *</Label>
                  <Input id="line1" placeholder="123 Victoria Island" value={shipping.line1} onChange={e => setShipping(s => ({ ...s, line1: e.target.value }))} className="mt-1" required />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="line2">Address Line 2</Label>
                  <Input id="line2" placeholder="Apartment, suite, etc." value={shipping.line2} onChange={e => setShipping(s => ({ ...s, line2: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input id="city" placeholder="Lagos" value={shipping.city} onChange={e => setShipping(s => ({ ...s, city: e.target.value }))} className="mt-1" required />
                </div>
                <div>
                  <Label htmlFor="state">State *</Label>
                  <Input id="state" placeholder="Lagos State" value={shipping.state} onChange={e => setShipping(s => ({ ...s, state: e.target.value }))} className="mt-1" required />
                </div>
                <div>
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input id="postalCode" placeholder="100001" value={shipping.postalCode} onChange={e => setShipping(s => ({ ...s, postalCode: e.target.value }))} className="mt-1" />
                </div>
              </div>
              <Button type="submit" className="w-full mt-2">Continue to Payment</Button>
            </form>
          )}

          {/* Step 1: Payment */}
          {step === 1 && (
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-500" /> Payment Method
              </h2>
              <div className="space-y-2">
                {PAYMENT_METHODS.map(m => (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      paymentMethod === m.id
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20"
                        : "border-border hover:border-indigo-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={m.id}
                      checked={paymentMethod === m.id}
                      onChange={() => setPaymentMethod(m.id)}
                      className="sr-only"
                    />
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      paymentMethod === m.id ? "bg-indigo-600 text-white" : "bg-muted text-muted-foreground"
                    }`}>
                      <m.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="text-xs text-muted-foreground">{m.desc}</p>
                    </div>
                    {paymentMethod === m.id && (
                      <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                    )}
                  </label>
                ))}
              </div>

              {paymentMethod === "card" && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Card Details</p>
                  <Input placeholder="Card number" className="font-mono" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="MM / YY" className="font-mono" />
                    <Input placeholder="CVV" className="font-mono" />
                  </div>
                  <Input placeholder="Cardholder name" />
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    Secured by Stripe — PCI DSS Level 1
                  </div>
                </div>
              )}

              {paymentMethod === "bank_transfer" && (
                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 text-sm">
                  <p className="font-medium mb-1">Bank Transfer Instructions</p>
                  <p className="text-muted-foreground text-xs">A virtual account number will be generated after you confirm. Transfer the exact amount within 30 minutes.</p>
                </div>
              )}

              {paymentMethod === "ussd" && (
                <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg p-4 text-sm">
                  <p className="font-medium mb-1">USSD Payment</p>
                  <p className="text-muted-foreground text-xs">Dial *737# or your bank's USSD code after confirming. Enter the reference number provided.</p>
                </div>
              )}

              {paymentMethod === "bnpl" && (
                <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4 text-sm">
                  <p className="font-medium mb-1">Buy Now, Pay Later</p>
                  <p className="text-muted-foreground text-xs">Split into 3 equal payments. First payment due today, remaining over 60 days. Subject to credit check.</p>
                  {cart && (
                    <p className="text-xs font-mono font-semibold mt-2 text-amber-700">
                      {fmt(Math.ceil(Number(cart.totalKobo) / 3))} × 3 instalments
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(0)} className="flex-1">Back</Button>
                <Button onClick={handlePaymentSubmit} className="flex-1">Review Order</Button>
              </div>
            </div>
          )}

          {/* Step 2: Review */}
          {step === 2 && (
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h2 className="font-semibold text-lg">Review Your Order</h2>

              {/* Shipping summary */}
              <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-1">
                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-2">Shipping To</p>
                <p className="font-medium">{shipping.name}</p>
                <p className="text-muted-foreground">{shipping.line1}{shipping.line2 ? `, ${shipping.line2}` : ""}</p>
                <p className="text-muted-foreground">{shipping.city}, {shipping.state}, {shipping.country}</p>
                <p className="text-muted-foreground">{shipping.phone} · {shipping.email}</p>
              </div>

              {/* Payment summary */}
              <div className="bg-muted/50 rounded-lg p-4 text-sm">
                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-2">Payment Method</p>
                <p className="font-medium">{PAYMENT_METHODS.find(m => m.id === paymentMethod)?.label}</p>
              </div>

              {/* Items */}
              <div className="space-y-2">
                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Items ({items.length})</p>
                {items.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground truncate flex-1 mr-2">
                      {(item.productSnapshot as any)?.name} × {item.quantity}
                    </span>
                    <span className="font-mono font-medium flex-shrink-0">{fmt(Number(item.totalPriceKobo))}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
                <Button
                  onClick={handleConfirmOrder}
                  disabled={isSubmitting}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Placing Order...</>
                  ) : (
                    <>Place Order · {cart ? fmt(Number(cart.totalKobo)) : ""}</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Order summary sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-card rounded-xl border border-border p-5 sticky top-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Order Summary</h3>
            {cartLoading ? (
              <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
            ) : (
              <>
                <div className="space-y-2 text-sm mb-3">
                  {items.map((item: any) => (
                    <div key={item.id} className="flex justify-between">
                      <span className="text-muted-foreground truncate flex-1 mr-2 text-xs">
                        {(item.productSnapshot as any)?.name} ×{item.quantity}
                      </span>
                      <span className="font-mono text-xs">{fmt(Number(item.totalPriceKobo))}</span>
                    </div>
                  ))}
                </div>
                <Separator className="my-2" />
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-mono">{fmt(Number(cart?.subtotalKobo ?? 0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className="font-mono text-emerald-600">Free</span>
                  </div>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span className="font-mono">{fmt(Number(cart?.totalKobo ?? 0))}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
