# Deploying to Netlify with PostgreSQL

This application has been structured as a modern React Single Page Application (SPA). The current implementation uses the browser's `localStorage` as the database layer to ensure it works immediately in testing environments.

To deploy this application via Netlify and hook it up to a real PostgreSQL database, follow this recommended approach using **Supabase** (which provides a managed PostgreSQL database and an easy-to-use JS client).

## 1. Set Up Supabase (PostgreSQL)

1. Create a free account at [Supabase](https://supabase.com/).
2. Create a new project.
3. In the SQL Editor in Supabase, create your tables matching the app's types (defined in `src/lib/types.ts`).
   * `enquiries` table
   * `quotes` table
   * `orders` table
   * `customers` table
   (Ensure you use JSONB columns for nested arrays like `items` to keep things simple, or normalize them into `enquiry_items`, etc.)

## 2. Install the Supabase Client

In your local terminal for this project, run:
```bash
npm install @supabase/supabase-js
```

## 3. Create a Supabase Client Instance

Create a file `src/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)
```

## 4. Update the Data Store

Currently, `src/store/index.tsx` reads and writes to `localStorage`. You should swap out the `useEffect` and manipulation functions to make calls to Supabase.

For example, fetching enquiries:
```typescript
// Inside src/store/index.tsx

useEffect(() => {
  async function loadData() {
    const { data: enquiries, error } = await supabase.from('enquiries').select('*');
    if (!error) {
       setData(prev => ({ ...prev, enquiries }));
    }
  }
  loadData();
}, []);
```

Saving a new enquiry:
```typescript
const addEnquiry = async (enquiry: Enquiry) => {
  // Optic UI update
  setData(prev => ({ ...prev, enquiries: [enquiry, ...prev.enquiries] }));
  
  // Database update
  await supabase.from('enquiries').insert([enquiry]);
};
```

## 5. Deploying to Netlify

1. Push your code to a GitHub repository.
2. Log into [Netlify](https://www.netlify.com/) and click **"Add new site" -> "Import from an existing project"**.
3. Point it to your GitHub repository.
4. Set the build settings:
   * Build command: `npm run build`
   * Publish directory: `dist`
5. In **"Environment variables"**, add your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
6. Click **Deploy Site**.

Netlify will automatically build your Vite app and deploy it, and your users will be reading/writing transparently to your PostgreSQL database hosted on Supabase!
