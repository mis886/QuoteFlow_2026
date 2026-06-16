# Database & Schema Details

This document provides details on how the frontend models map to the Supabase database schema for reference, in case any future modifications or direct queries are required. 

## Mappings
The application translates internal properties to their corresponding `snake_case` PostgreSQL names prior to insertions/updates. This prevents issues like passing undefined JSON keys (`qRef`, `siteId`) to Supabase. This translation behaves precisely like the `Customer Master` which stores properties under identical property names.

### 1. Customers
`Customer` -> `customers` table
- `id` -> `id`
- `code` -> `code`
- `name` -> `name`
- `seg` -> `seg`
- `gstin` -> `gstin`
- `inco` -> `inco`
- `curr` -> `curr`
- `pay` -> `pay`
- `sites` -> `sites (JSONB)`

*(No mapping abstraction required because keys match exactly)*

### 2. Enquiries
`Enquiry` -> `enquiries` table
- `id` -> `id`
- `recv` -> `recv (TIMESTAMPTZ)`
- `src` -> `src`
- `cust` -> `cust`
- `siteId` -> `site_id`
- `contactId` -> `contact_id`
- `contact` -> `contact`
- `email` -> `email`
- `urg` -> `urg`
- `status` -> `status`
- `assigned` -> `assigned`
- `notes` -> `notes`
- `ageH` -> `age_h (INTEGER)`
- `qRef` -> `q_ref`
- `items` -> `items (JSONB)`
- `attachments` -> `attachments (JSONB)`

### 3. Quotes
`Quote` -> `quotes` table
- `id` -> `id`
- `enqRef` -> `enq_ref`
- `cust` -> `cust`
- `date` -> `date (DATE)`
- `validity` -> `validity (DATE)`
- `status` -> `status`
- `inco` -> `inco`
- `curr` -> `curr`
- `pay` -> `pay`
- `items` -> `items (JSONB)`

### 4. Orders
`Order` -> `orders` table
- `id` -> `id`
- `quoteRef` -> `quote_ref`
- `enqRef` -> `enq_ref`
- `cust` -> `cust`
- `poNo` -> `po_no`
- `poDate` -> `po_date (DATE)`
- `dlvDate` -> `dlv_date (DATE)`
- `status` -> `status`
- `value` -> `value (NUMERIC)`
- `items` -> `items (JSONB)`

## Security & Access
Row-Level Security (RLS) is strictly enforced for all 4 tables. Policies are formulated to authenticate specific users against their `@himalayaterpene.com` workspace. 

Failed insertion requests generally occur for two reasons:
1. Properties mapped inaccurately causing PostgreSQL to fail looking up mapped keys (now fixed with strict mapping handlers inside `store/index.tsx`).
2. Authentication failures when accessing Supabase using unverified RLS roles.
