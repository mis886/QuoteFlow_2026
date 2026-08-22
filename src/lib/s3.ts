import { supabase } from "./supabase";

const bucketName = import.meta.env.VITE_S3_BUCKET || "Docs";

// We fallback to supabase storage API which avoids S3 CORS issues from the browser.
export const s3Client = supabase; // Keep export for backwards compatibility if needed, though not strictly an S3 client.

export async function uploadToS3(file: File, path: string) {
  if (!supabase || !bucketName) {
    console.warn("Storage not configured, upload skipped");
    return null;
  }

  try {
    const { error } = await supabase
      .storage
      .from(bucketName)
      .upload(path, file, {
        contentType: file.type,
        upsert: true
      });
      
    if (error) throw error;

    console.log("File uploaded successfully:", path);
    return path;
  } catch (error) {
    console.error("Storage Upload Error:", error);
    return null;
  }
}

export async function getS3SignedUrl(path: string, download: boolean = false) {
  if (!supabase || !bucketName) return null;

  try {
    // If it's the fallback local path, return it directly so image rendering can handle gracefully or fail
    if (path.startsWith('local/')) return null;

    const { data, error } = await supabase
      .storage
      .from(bucketName)
      .createSignedUrl(path, 3600, { download });
      
    if (error) throw error;
    
    return data.signedUrl;
  } catch (error) {
    console.error("Storage Signed URL Error:", error);
    return null;
  }
}