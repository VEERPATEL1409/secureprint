export type ShopStatus = 'pending' | 'active' | 'suspended' | 'blocked' | 'rejected';
export type JobStatus = 'WAITING' | 'REVIEWING' | 'PRINTING' | 'PRINTED' | 'REJECTED' | 'EXPIRED' | 'DELETED_BY_CUSTOMER';
export type CustomerSessionStatus = 'active' | 'expired' | 'blocked';
export type FileStatus = 'ready' | 'printing' | 'printed' | 'deleted';
export type UserRole = 'shop' | 'admin' | 'customer';

export interface Shop {
  id: string;
  name: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin?: string;
  status: ShopStatus;
  isOpen: boolean;
  publicCode: string;
  printerTypes?: string[];
  settings?: {
    bwRate?: number;
    colorRate?: number;
    doubleSidedDiscount?: number;
    autoAcceptJobs?: boolean;
    soundAlerts?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSession {
  id: string;
  shopId: string;
  shopPublicCode?: string;
  token: string;
  customerName: string;
  customerPhone?: string;
  phone?: string;
  guestUid?: string;
  isAnonymous?: boolean;
  lastActiveAt?: string;
  status: CustomerSessionStatus;
  isBlocked?: boolean;
  blockReason?: string;
  createdAt: string;
  expiresAt: string;
}

export interface PrintSettings {
  colorMode?: 'BW' | 'COLOR';
  copies: number;
  isDoubleSided?: boolean;
  paperSize?: 'A4' | 'A3' | 'Legal' | 'Letter';
  pageRange?: string;
  notes?: string;
  orientation?: 'portrait' | 'landscape';
  margin?: 'normal' | 'narrow' | 'none';
  fitMode?: 'fit' | 'fill' | 'actual';
  duplexEdge?: 'long' | 'short';
}

export interface FileAttachment {
  id?: string;
  name: string;
  size: number;
  type: string;
  downloadUrl: string;
  storagePath?: string;
  pages?: number;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  uploadedAt?: string;
}

export interface PrintFile {
  id: string;
  jobId: string;
  sessionId: string;
  shopId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  storageUrl?: string;
  storagePath?: string;
  pages?: number;
  status: FileStatus;
  settings?: PrintSettings;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId?: string;
  jobId?: string;
  senderRole: 'customer' | 'shop';
  text: string;
  timestamp: string;
  files?: FileAttachment[];
  printSettings?: PrintSettings;
  isDeleted?: boolean;
  deletedForEveryone?: boolean;
}

export interface PrintMessage {
  id: string;
  jobId: string;
  sender: 'customer' | 'shop';
  text: string;
  createdAt: string;
}

export interface PrintJob {
  id: string;
  sessionId: string;
  shopId: string;
  token: string;
  customerName: string;
  status: JobStatus;
  totalFiles: number;
  files: FileAttachment[];
  settings?: PrintSettings;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface BlockedSession {
  id: string;
  sessionId: string;
  shopId: string;
  reason: string;
  blockedBy: string;
  active: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  performedBy: string;
  targetType: string;
  targetId: string;
  details: string;
  timestamp: string;
}

export interface SystemSettings {
  maxFileSizeMb: number;
  maxFilesPerJob: number;
  expirationHours: number;
  allowedExtensions: string;
  maintenanceMode: boolean;
  bannerNotice?: string;
}
