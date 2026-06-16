import { createClient } from '@supabase/supabase-js';
import { AppSettings } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Database features will be disabled.');
}

export const supabase = createClient(
  supabaseUrl || 'https://nheujyknkqeimgpdfyiw.supabase.co',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZXVqeWtua3FlaW1ncGRmeWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMzM2ODIsImV4cCI6MjA5NjkwOTY4Mn0.5j_CYqyjCNY1tGozklqY4iUnQh3HLpFBw8EiNeu05Dw'
);

async function urlToBase64(url: string): Promise<string> {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function getSettings(): Promise<AppSettings | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 'config')
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching settings:', error);
    return null;
  }
  if (data) {
    if (data.header_url?.startsWith('http')) {
      try { data.header_url = await urlToBase64(data.header_url); } catch { data.header_url = null; }
    }
    if (data.sig_url?.startsWith('http')) {
      try { data.sig_url = await urlToBase64(data.sig_url); } catch { data.sig_url = null; }
    }
  }
  return data;
}

export async function updateSettings(settings: Partial<AppSettings>) {
  const { data, error } = await supabase
    .from('app_settings')
    .upsert({ id: 'config', ...settings, updated_at: new Date().toISOString() });
  
  return { data, error };
}

export async function uploadPublicFile(bucket: string, path: string, file: File | Blob) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true });
  
  if (error) return { data: null, error };
  
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return { data: urlData.publicUrl, error: null };
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}
