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
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2025-01-27.acacia' })
  : null;

// Price IDs from Stripe Dashboard (test mode)
const PRICE_IDS: Record<string, string> = {
  price_pro_monthly: process.env.STRIPE_PRICE_PRO || 'price_1SqGK8LUbfmx8MWFMzZ2WTsz',
  price_team_monthly: process.env.STRIPE_PRICE_TEAM || 'price_1SqGL4LUbfmx8MWFjxlB3B7F',
  // Direct price IDs (frontend sends these)
  'price_1SqGK8LUbfmx8MWFMzZ2WTsz': 'price_1SqGK8LUbfmx8MWFMzZ2WTsz',
  'price_1SqGL4LUbfmx8MWFjxlB3B7F': 'price_1SqGL4LUbfmx8MWFjxlB3B7F',
};

// Plan limits
const PLAN_LIMITS: Record<string, { maxMemories: number; maxWorkspaces: number }> = {
  free: { maxMemories: 500, maxWorkspaces: 1 },
  pro: { maxMemories: 10000, maxWorkspaces: 5 },
  team: { maxMemories: 50000, maxWorkspaces: -1 },
  enterprise: { maxMemories: -1, maxWorkspaces: -1 },
};

export interface CustomerRecord {
  tenantId: string;
  stripeCustomerId: string;
  email?: string;
  name?: string;
  plan: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
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
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Store in Redis
  await storageClient.hset(`customer:${tenantId}`, {
    stripeCustomerId: record.stripeCustomerId,
    email: record.email || '',
    name: record.name || '',
    plan: record.plan,
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
  let tenantId = subscription.metadata?.tenantId;

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

  if (priceId) {
    if (priceId.includes('pro') || priceId === PRICE_IDS.price_pro_monthly) {
      plan = 'pro';
    } else if (priceId.includes('team') || priceId === PRICE_IDS.price_team_monthly) {
      plan = 'team';
    }
  }

  // Update customer record
  await storageClient.hset(`customer:${tenantId}`, {
    plan,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    updatedAt: Date.now().toString(),
  });

  // Update API key record with new plan
  const apiKeys = await storageClient.smembers(`tenant:${tenantId}:apikeys`);
  for (const keyId of apiKeys) {
    await storageClient.hset(`apikey:${keyId}`, {
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
  let tenantId = subscription.metadata?.tenantId;

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
