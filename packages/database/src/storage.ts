export interface AttachmentUploadDescriptor {
  organizationId: string;
  conversationId: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
}

export interface StorageAdapterPort {
  createSignedUploadUrl(descriptor: AttachmentUploadDescriptor): Promise<{
    path: string;
    signedUrl: string;
  }>;
  createSignedReadUrl(path: string, expiresInSeconds?: number): Promise<string>;
}

export const CAREFLOW_ATTACHMENTS_BUCKET = 'support-attachments';
