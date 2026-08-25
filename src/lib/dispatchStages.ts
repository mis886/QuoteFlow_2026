// Stage-checklist templates for the Dispatch module's Order → Dispatch phase.
//
// Sourced and verified directly from the two real FMS Google Sheets:
//   - Delivery:    HTPL Delivery FMS v.3      → DO1-DO8 (Order → Dispatch half of DO1-DO12)
//   - Self Pickup: HTPL Self Pickup FMS v.2   → SP1-SP7 (Order → Dispatch half of SP1-SP11)
//
// The two paths are genuinely different pipelines, not just a different
// intake form: Self Pickup's payment-receipt SLA is 12h (vs Delivery's 4h),
// its payment-follow-up stage is owned by CRM instead of Samata, and it has
// no separate "material available" check — that's folded into the final
// "make DO + confirm vehicle number" stage since there's no external
// transporter to coordinate with.
//
// Dispatch → Sent (SP8-SP11 / DO9-DO12 + Payment Status) is out of scope —
// deferred per the user's explicit instruction — so it has no template here.

import { DispatchFulfillmentType, DispatchStage } from './types';

type StageTemplate = Omit<DispatchStage, 'planned' | 'actual' | 'status' | 'delayHours'>;

export const DELIVERY_TO_DISPATCH_TEMPLATE: StageTemplate[] = [
  { code: 'DO1', label: 'Check offered price, payment terms in email trail', owner: 'Samata', how: 'By trailing email', slaHours: 1 },
  { code: 'DO2', label: 'If payment terms advance, send PI', owner: 'Samata', how: 'By email', slaHours: 1 },
  { code: 'DO3', label: 'Check receipt of payment', owner: 'Samata', how: 'By checking account', slaHours: 4 },
  { code: 'DO4', label: 'Check overdue of bills', owner: 'Samata', how: 'Tally Prime', slaHours: 1 },
  { code: 'DO5', label: 'If overdue, confirm with management', owner: 'Samata', how: 'WhatsApp/Phone', slaHours: 1 },
  { code: 'DO6', label: 'If yes, request and receive payment', owner: 'Samata', how: 'WhatsApp/Phone', slaHours: 1 },
  { code: 'DO7', label: 'Material available or not', owner: 'Samata', how: 'WhatsApp', slaHours: 1 },
  { code: 'DO8', label: 'Get transporter confirmation and issue DO to party/warehouse', owner: 'Samata', how: 'Manually', slaHours: 12 },
];

export const SELF_PICKUP_TO_DISPATCH_TEMPLATE: StageTemplate[] = [
  { code: 'SP1', label: 'Check offered price, payment terms in email trail', owner: 'Samata', how: 'By trailing email', slaHours: 1 },
  { code: 'SP2', label: 'If payment terms advance, send PI', owner: 'Samata', how: 'By email', slaHours: 1 },
  { code: 'SP3', label: 'Check receipt of payment', owner: 'Samata', how: 'By checking account', slaHours: 12 },
  { code: 'SP4', label: 'Check overdue of bills', owner: 'Samata', how: 'Tally Prime', slaHours: 1 },
  { code: 'SP5', label: 'If overdue, confirm with management', owner: 'Samata', how: 'WhatsApp/Phone', slaHours: 1 },
  { code: 'SP6', label: 'If yes, request and receive payment', owner: 'CRM', how: 'WhatsApp/Phone', slaHours: 1 },
  { code: 'SP7', label: 'If self pickup, make DO and confirm vehicle number', owner: 'Samata', how: 'Manually', slaHours: 1 },
];

export function templateFor(type: DispatchFulfillmentType): StageTemplate[] {
  return type === 'self_pickup' ? SELF_PICKUP_TO_DISPATCH_TEMPLATE : DELIVERY_TO_DISPATCH_TEMPLATE;
}

// Builds a fresh stage checklist for a new dispatch entry: deep-clones the
// template for the chosen fulfillment type and stamps a `planned` date on
// each stage by walking forward from `startDate` (defaults to now) using
// each stage's own SLA — stage N's planned date is stage N-1's planned date
// plus stage N-1's SLA hours. `actual`/`delayHours` start null and `status`
// starts 'pending'; the Dispatch page fills those in as stages are marked
// done via advanceDispatchStage() in the store.
export function buildStagesFor(type: DispatchFulfillmentType, startDate: Date = new Date()): DispatchStage[] {
  const template = templateFor(type);
  let cursor = new Date(startDate.getTime());
  return template.map((stage): DispatchStage => {
    const planned = new Date(cursor.getTime());
    cursor = new Date(cursor.getTime() + stage.slaHours * 60 * 60 * 1000);
    return {
      ...stage,
      planned: planned.toISOString(),
      actual: null,
      status: 'pending',
      delayHours: null,
    };
  });
}
