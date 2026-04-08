import { createAdminClient } from "./admin";

const BUCKET = "documents";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

let bucketEnsured = false;

async function ensureBucket() {
  if (bucketEnsured) return;
  const supabase = createAdminClient();
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }
  bucketEnsured = true;
}

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "text/csv",
];

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit` };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `File type "${file.type}" is not allowed. Allowed: PDF, Word, Excel, PNG, JPG, CSV`,
    };
  }
  return { valid: true };
}

export async function uploadFile(
  organisationId: string,
  fileId: string,
  fileName: string,
  file: File
): Promise<{ path: string; error?: string }> {
  await ensureBucket();
  const supabase = createAdminClient();
  const path = `${organisationId}/${fileId}-${fileName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return { path: "", error: error.message };
  }

  return { path };
}

export async function deleteFile(path: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function getSignedUrl(
  path: string,
  expiresInSeconds = 3600
): Promise<{ url: string; error?: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return { url: "", error: error?.message ?? "Failed to generate URL" };
  }

  return { url: data.signedUrl };
}
