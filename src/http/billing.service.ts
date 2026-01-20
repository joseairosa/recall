/**
 * Billing Service
 *
 * Handles Stripe subscription management for Recall SaaS.
 * Includes checkout session creation, customer portal, and webhook handling.
 */

import Stripe from 'stripe';
import { StorageClient } from '../persistence/storage-client.js';

// Initialize Stripe with secret key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// Price IDs from Stripe Dashboard (test mode)
const PRICE_IDS: Record<string, string> = {
  price_pro_monthly: process.env.STRIPE_PRICE_PRO || 'price_1SqTaOLUbfmx8MWFecrr4ng8',
  price_team_monthly: process.env.STRIPE_PRICE_TEAM || 'price_1SqTaOLUbfmx8MWFdxHsCoPz',
  price_workspace_addon: process.env.STRIPE_PRICE_WORKSPACE_ADDON || 'price_1Sr87zLUbfmx8MWFPESMdkwg',
  // Direct price IDs (frontend sends these)
  'price_1SqTaOLUbfmx8MWFecrr4ng8': 'price_1SqTaOLUbfmx8MWFecrr4ng8',
  'price_1SqTaOLUbfmx8MWFdxHsCoPz': 'price_1SqTaOLUbfmx8MWFdxHsCoPz',
};

// Plan limits
const PLAN_LIMITS: Record<string, { maxMemories: number; maxWorkspaces: number; maxTeamMembers: number }> = {
  free: { maxMemories: 500, maxWorkspaces: 1, maxTeamMembers: 1 },
  pro: { maxMemories: 5000, maxWorkspaces: 3, maxTeamMembers: 1 },
  team: { maxMemories: 25000, maxWorkspaces: -1, maxTeamMembers: 10 },
  enterprise: { maxMemories: -1, maxWorkspaces: -1, maxTeamMembers: -1 },
};

export interface CustomerRecord {
  tenantId: string;
  stripeCustomerId: string;
  email?: string;
  name?: string;
  plan: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  workspaceAddons?: number;  // Additional workspaces purchased as add-ons
  createdAt: number;
  updatedAt: number;
}

/**
 * Get or create a Stripe customer for a tenant
 */
export async function getOrCreateCustomer(
  storageClient: StorageClient,
  tenantId: string,
  email?: string,
  name?: string
): Promise<CustomerRecord> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  // Check if customer exists in our database
  const existingCustomer = await storageClient.hgetall(`customer:${tenantId}`);

  if (existingCustomer && existingCustomer.stripeCustomerId) {
    return {
      tenantId,
      stripeCustomerId: existingCustomer.stripeCustomerId,
      email: existingCustomer.email,
      name: existingCustomer.name,
      plan: existingCustomer.plan || 'free',
      subscriptionId: existingCustomer.subscriptionId,
      subscriptionStatus: existingCustomer.subscriptionStatus,
      workspaceAddons: parseInt(existingCustomer.workspaceAddons) || 0,
      createdAt: parseInt(existingCustomer.createdAt) || Date.now(),
      updatedAt: parseInt(existingCustomer.updatedAt) || Date.now(),
    };
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      tenantId,
    },
  });

  const record: CustomerRecord = {
    tenantId,
    stripeCustomerId: customer.id,
    email,
    name,
    plan: 'free',
    workspaceAddons: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Store in Redis
  await storageClient.hset(`customer:${tenantId}`, {
    stripeCustomerId: record.stripeCustomerId,
    email: record.email || '',
    name: record.name || '',
    plan: record.plan,
    workspaceAddons: '0',
    createdAt: record.createdAt.toString(),
    updatedAt: record.updatedAt.toString(),
  });

  // Also store reverse lookup
  await storageClient.set(`stripe_customer:${customer.id}`, tenantId);

  return record;
}

/**
 * Create a Stripe Checkout session for subscription
 */
export async function createCheckoutSession(
  storageClient: StorageClient,
  tenantId: string,
  priceId: string,
  email?: string,
  name?: string,
  successUrl?: string,
  cancelUrl?: string
): Promise<{ url: string; sessionId: string }> {
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.');
  }

  // Get or create customer
  const customer = await getOrCreateCustomer(storageClient, tenantId, email, name);

  // Map frontend price ID to actual Stripe price ID
  const actualPriceId = PRICE_IDS[priceId] || priceId;

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customer.stripeCustomerId,
    mode: 'subscription',
    line_items: [
      {
        price: actualPriceId,
        quantity: 1,
      },
    ],
    success_url: successUrl || 'https://recall.dev/dashboard/billing?success=true',
    cancel_url: cancelUrl || 'https://recall.dev/dashboard/billing?canceled=true',
    metadata: {
      tenantId,
    },
    subscription_data: {
      metadata: {
        tenantId,
      },
    },
  });

  if (!session.url) {
    throw new Error('Failed to create checkout session');
  }

  return {
    url: session.url,
    sessionId: session.id,
  };
}

/**
 * Create a Stripe Customer Portal session
 */
export async function createPortalSession(
  storageClient: StorageClient,
  tenantId: string,
  returnUrl?: string
): Promise<{ url: string }> {
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.');
  }

  // Get customer
  const customerData = await storageClient.hgetall(`customer:${tenantId}`);

  if (!customerData || !customerData.stripeCustomerId) {
    throw new Error('No Stripe customer found for this account');
  }

  // Create portal session
  const session = await stripe.billingPortal.sessions.create({
    customer: customerData.stripeCustomerId,
    return_url: returnUrl || 'https://recall.dev/dashboard/billing',
  });

  return {
    url: session.url,
  };
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhookEvent(
  storageClient: StorageClient,
  event: Stripe.Event
): Promise<void> {
  console.log(`[Billing] Processing webhook event: ${event.type}`);

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionChange(storageClient, subscription);
      // Also sync add-on quantities (handles portal modifications)
      await syncSubscriptionAddons(storageClient, subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionCanceled(storageClient, subscription);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      console.log(`[Billing] Payment failed for invoice ${invoice.id}`);
      // Could send email notification here
      break;
    }

    default:
      console.log(`[Billing] Unhandled event type: ${event.type}`);
  }
}

/**
 * Handle subscription creation or update
 */
async function handleSubscriptionChange(
  storageClient: StorageClient,
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  // Get tenant ID from subscription metadata first (most reliable)
  // Fall back to reverse lookup if not in metadata
  let tenantId: string | null | undefined = subscription.metadata?.tenantId;

  if (!tenantId) {
    tenantId = await storageClient.get(`stripe_customer:${customerId}`);
  }

  if (!tenantId) {
    console.error(`[Billing] No tenant found for Stripe customer ${customerId}`);
    return;
  }

  // Ensure reverse lookup exists for future use
  await storageClient.set(`stripe_customer:${customerId}`, tenantId);

  // Determine plan from price
  let plan = 'free';
  const priceId = subscription.items.data[0]?.price?.id;

  console.log(`[Billing] Processing subscription for tenant ${tenantId}, priceId: ${priceId}`);

  if (priceId) {
    // Check against actual price IDs
    if (priceId === 'price_1SqTaOLUbfmx8MWFecrr4ng8' || priceId.includes('pro')) {
      plan = 'pro';
    } else if (priceId === 'price_1SqTaOLUbfmx8MWFdxHsCoPz' || priceId.includes('team')) {
      plan = 'team';
    }
  }

  console.log(`[Billing] Determined plan: ${plan}`);

  // Update customer record
  await storageClient.hset(`customer:${tenantId}`, {
    plan,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    updatedAt: Date.now().toString(),
  });

  // Update API key record with new plan
  const apiKeys = await storageClient.smembers(`tenant:${tenantId}:apikeys`);
  console.log(`[Billing] Found ${apiKeys.length} API keys for tenant: ${JSON.stringify(apiKeys.map(k => k.substring(0, 10) + '...'))}`);

  for (const apiKey of apiKeys) {
    console.log(`[Billing] Updating apikey:${apiKey.substring(0, 10)}... to plan: ${plan}`);
    await storageClient.hset(`apikey:${apiKey}`, {
      plan,
    });
  }

  console.log(`[Billing] Updated tenant ${tenantId} to plan: ${plan}`);
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionCanceled(
  storageClient: StorageClient,
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  // Get tenant ID from subscription metadata first, then reverse lookup
  let tenantId: string | null | undefined = subscription.metadata?.tenantId;

  if (!tenantId) {
    tenantId = await storageClient.get(`stripe_customer:${customerId}`);
  }

  if (!tenantId) {
    console.error(`[Billing] No tenant found for Stripe customer ${customerId}`);
    return;
  }

  // Downgrade to free plan
  await storageClient.hset(`customer:${tenantId}`, {
    plan: 'free',
    subscriptionId: '',
    subscriptionStatus: 'canceled',
    updatedAt: Date.now().toString(),
  });

  // Update API key records
  const apiKeys = await storageClient.smembers(`tenant:${tenantId}:apikeys`);
  for (const keyId of apiKeys) {
    await storageClient.hset(`apikey:${keyId}`, {
      plan: 'free',
    });
  }

  console.log(`[Billing] Downgraded tenant ${tenantId} to free plan`);
}

/**
 * Sync workspace add-on quantities from subscription items
 * Called when subscription is created/updated to ensure add-on count is accurate
 */
async function syncSubscriptionAddons(
  storageClient: StorageClient,
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  // Get tenant ID
  let tenantId: string | null | undefined = subscription.metadata?.tenantId;
  if (!tenantId) {
    tenantId = await storageClient.get(`stripe_customer:${customerId}`);
  }

  if (!tenantId) {
    console.error(`[Billing] syncAddons: No tenant found for Stripe customer ${customerId}`);
    return;
  }

  // Find workspace addon item in subscription
  const addonPriceId = PRICE_IDS.price_workspace_addon;
  const addonItem = subscription.items.data.find(
    (item) => item.price.id === addonPriceId
  );

  const addonQuantity = addonItem?.quantity || 0;

  // Get current stored quantity
  const customerData = await storageClient.hgetall(`customer:${tenantId}`);
  const currentStored = parseInt(customerData?.workspaceAddons || '0') || 0;

  // Only update if different (avoid unnecessary writes)
  if (addonQuantity !== currentStored) {
    console.log(
      `[Billing] Syncing workspace add-ons for tenant ${tenantId}: ${currentStored} -> ${addonQuantity}`
    );

    await storageClient.hset(`customer:${tenantId}`, {
      workspaceAddons: addonQuantity.toString(),
      updatedAt: Date.now().toString(),
    });
  }
}

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return !!stripe;
}

/**
 * Get plan limits
 */
export function getPlanLimits(plan: string): { maxMemories: number; maxWorkspaces: number } {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

/**
 * Get current add-ons for a customer
 */
export async function getCustomerAddons(
  storageClient: StorageClient,
  tenantId: string
): Promise<{ workspaceAddons: number }> {
  const customerData = await storageClient.hgetall(`customer:${tenantId}`);
  return {
    workspaceAddons: parseInt(customerData?.workspaceAddons || '0') || 0,
  };
}

/**
 * Purchase or update workspace add-ons
 * If customer has an active subscription, adds a subscription item
 * Otherwise, creates a new checkout session
 */
export async function purchaseWorkspaceAddons(
  storageClient: StorageClient,
  tenantId: string,
  quantity: number,
  successUrl?: string,
  cancelUrl?: string
): Promise<{ url?: string; updated?: boolean; newTotal?: number }> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  if (quantity < 1) {
    throw new Error('Quantity must be at least 1');
  }

  // Get customer record
  const customerData = await storageClient.hgetall(`customer:${tenantId}`);

  if (!customerData || !customerData.stripeCustomerId) {
    throw new Error('No Stripe customer found. Please subscribe to a plan first.');
  }

  const currentAddons = parseInt(customerData.workspaceAddons || '0') || 0;

  // Check if customer has an active subscription
  if (customerData.subscriptionId && customerData.subscriptionStatus === 'active') {
    // Add or update subscription item for workspace add-ons
    const subscription = await stripe.subscriptions.retrieve(customerData.subscriptionId);

    // Check if workspace addon item already exists
    const addonPriceId = PRICE_IDS.price_workspace_addon;
    const existingItem = subscription.items.data.find(
      (item) => item.price.id === addonPriceId
    );

    const newTotal = currentAddons + quantity;

    if (existingItem) {
      // Update existing item quantity
      await stripe.subscriptionItems.update(existingItem.id, {
        quantity: newTotal,
      });
    } else {
      // Add new subscription item
      await stripe.subscriptionItems.create({
        subscription: customerData.subscriptionId,
        price: addonPriceId,
        quantity: newTotal,
      });
    }

    // Update customer record
    await storageClient.hset(`customer:${tenantId}`, {
      workspaceAddons: newTotal.toString(),
      updatedAt: Date.now().toString(),
    });

    return { updated: true, newTotal };
  } else {
    // No active subscription - create checkout session for add-ons
    // Customer needs to have a base plan first
    throw new Error('Active subscription required. Please subscribe to a plan first.');
  }
}

/**
 * Update workspace add-on quantity (can increase or decrease)
 */
export async function updateWorkspaceAddons(
  storageClient: StorageClient,
  tenantId: string,
  newQuantity: number
): Promise<{ updated: boolean; newTotal: number }> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  if (newQuantity < 0) {
    throw new Error('Quantity cannot be negative');
  }

  // Get customer record
  const customerData = await storageClient.hgetall(`customer:${tenantId}`);

  if (!customerData || !customerData.stripeCustomerId) {
    throw new Error('No Stripe customer found');
  }

  if (!customerData.subscriptionId || customerData.subscriptionStatus !== 'active') {
    throw new Error('Active subscription required');
  }

  const subscription = await stripe.subscriptions.retrieve(customerData.subscriptionId);
  const addonPriceId = PRICE_IDS.price_workspace_addon;
  const existingItem = subscription.items.data.find(
    (item) => item.price.id === addonPriceId
  );

  if (newQuantity === 0) {
    // Remove the add-on item if it exists
    if (existingItem) {
      await stripe.subscriptionItems.del(existingItem.id);
    }
  } else if (existingItem) {
    // Update existing item quantity
    await stripe.subscriptionItems.update(existingItem.id, {
      quantity: newQuantity,
    });
  } else {
    // Create new subscription item
    await stripe.subscriptionItems.create({
      subscription: customerData.subscriptionId,
      price: addonPriceId,
      quantity: newQuantity,
    });
  }

  // Update customer record
  await storageClient.hset(`customer:${tenantId}`, {
    workspaceAddons: newQuantity.toString(),
    updatedAt: Date.now().toString(),
  });

  return { updated: true, newTotal: newQuantity };
}
