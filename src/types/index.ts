export type JobStatus = 'urgent' | 'active' | 'scheduled' | 'attention' | 'completed' | 'unassigned';
export type PropertyType = 'Residential' | 'Commercial' | 'HOA' | 'Industrial' | 'Municipal';
export type BillingType = 'Personal' | 'Business';

export interface BillingProfile {
  id: string;
  label: string; // e.g. "Personal Card", "Venetozzi Holdings LLC"
  billingType: BillingType;
  companyName?: string;
  billingAddress: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  email: string;
  phone: string;
  paymentMethod: 'Credit Card' | 'ACH / Bank Transfer' | 'Net 30 Invoice' | 'Check' | 'Cash';
  cardBrand?: string;
  cardLast4?: string;
  taxExempt: boolean;
  taxId?: string;
  isDefault: boolean;
}

export interface JobSite {
  id: string;
  customerId: string;
  name: string; // e.g. "Main Residence", "North Business Park", "Rental Quadplex"
  propertyType: PropertyType;
  address: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
  crossStreet?: string;
  lat: number;
  lng: number;
  turfSqFt: number; // e.g. 15,000 sq ft
  grassType: 'St. Augustine' | 'Bermuda' | 'Zoysia' | 'Centipede' | 'Bahia' | 'Mixed Turf';
  mowFrequency: 'Weekly' | 'Bi-Weekly' | 'Monthly' | 'On-Demand';
  cutHeightInches?: number; // e.g. 2.5, 3.0, 3.5, 4.0
  gateCode?: string;
  hazards?: string; // e.g. "Pond bank steep slope, two dogs in backyard"
  dogsOnSite?: boolean;
  leedProject?: boolean;
  defaultBillingProfileId?: string;
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  company?: string;
  email: string;
  phone: string;
  cell: string;
  billingProfiles: BillingProfile[];
  jobSites: JobSite[];
  category: PropertyType;
  salesRep: string;
  referredBy?: string;
  balance: number;
  notes?: string;
}

export interface ServiceTypeItem {
  id: string;
  name: string; // e.g. "Weekly Premium Mowing & Edging", "Pine Straw Delivery & Install"
  category: 'Mowing & Maintenance' | 'Turf & Soil Care' | 'Plant & Tree Care' | 'Materials & Installation' | 'Seasonal & Cleanups';
  chargeUnit: 'per_cut' | 'per_sqft' | 'per_acre' | 'per_yard' | 'per_pallet' | 'per_hour' | 'flat';
  unitLabel: string; // e.g. "$ / Cut", "$ / Cu Yard", "$ / Pallet", "$ / Hour", "Flat Rate"
  defaultRate: number; // e.g. 65.00
  estimatedMinutes: number; // e.g. 45 min
  requiredEquipment: string; // e.g. "60\" Commercial Zero-Turn Mower"
  defaultMaterial?: string; // e.g. "Dark Hardwood Mulch"
  description?: string;
}

export interface EquipmentAsset {
  id: string;
  assetNumber: string; // e.g. "Mower-01", "Trailer-03", "Aerator-02", "Bobcat-SVL75"
  type: '60" Commercial Zero-Turn' | '52" Stand-On Mower' | '36" Walk-Behind Mower' | 'Stand-On Core Aerator' | 'Commercial Dump Trailer' | 'Compact Skid Steer' | 'Hydroseeder Rig' | 'Heavy Duty Sod Cutter';
  status: 'Available' | 'In Use' | 'Maintenance';
  location: string; // e.g. "Main Shop Yard", "Pace Laydown Yard", "Assigned to Crew A"
  address?: string;
  daysOut: number;
  assignedTechnician?: string;
  specs?: string; // e.g. "Scag Turf Tiger II 61in Deck"
}

export interface TechnicianTeamMember {
  id: string;
  name: string;
  role: 'Lead Lawn Specialist' | 'Grounds Crew Lead' | 'Turf Care Specialist' | 'Irrigation Technician';
  phone: string;
  vehicle: string; // e.g. "Ford F-350 Landscape Rig #12"
  status: 'On-Route' | 'At Job Site' | 'Available' | 'Off-Duty';
  currentLat: number;
  currentLng: number;
  color: string;
}

export interface FacilitySite {
  id: string;
  name: string;
  type: 'HQ / Operations Shop' | 'Equipment Laydown Yard' | 'Green Waste Compost Depot' | 'Bulk Nursery Supplier' | 'Commercial Fuel Station';
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  hours?: string;
}

export interface JournalLog {
  id: string;
  timestamp: string;
  author: string;
  message: string;
  type: 'status' | 'edit' | 'field_note' | 'payment';
}

export interface WorkOrder {
  id: string;
  woNumber: string; // e.g. "WO-16701"
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  billingProfileId: string;
  billingProfileLabel: string;
  billToAddress: string;
  billToCity: string;
  billToState: string;
  billToZip: string;

  // Job Site Info
  jobSiteId: string;
  jobName: string;
  propertyType: PropertyType; // 'Residential' | 'Commercial'
  jobContact: string;
  jobCell: string;
  jobAddress: string;
  jobCity: string;
  jobState: string;
  jobZip: string;
  jobCounty: string;
  jobCrossStreet?: string;
  turfSqFt?: number;
  grassType?: string;
  cutHeightInches?: number;
  leedProject: boolean;
  hazards: string;
  lat: number;
  lng: number;
  distanceMiles: number;
  jobSitePO?: string;
  oneTime: boolean;

  // Requirements & Dispatch
  status: JobStatus;
  serviceTypeId?: string;
  serviceTypeName: string; // e.g. "Weekly Premium Mowing & Edging"
  technicianId: string;
  technicianName: string; // Formerly driverName
  sequenceNum: number; // e.g. 20, 21, 22, 31, 32, 33
  date: string; // "2026-08-28"
  autoScheduled: boolean;
  qtyAsset: number;
  assetType: string;
  assetId?: string;
  material: string; // e.g. "Dark Hardwood Mulch (8 Cu Yds)", "Bermuda Sod (4 Pallets)"
  materialQuantity?: string;
  notes: string;
  laydownDepotName?: string;

  // Visual status flags (matching inspiration icons)
  flags: {
    hasDocument: boolean;  // 📝 Work Order
    hasHazard: boolean;    // ⚠️ Site Hazard / Gate code
    hasNotes: boolean;     // ✏️ Field Notes
    hasEquipment: boolean; // 🚚 Trailer / Heavy Mower
    hasMaterial: boolean;  // 🛢️ Bulk Material / Mulch
    hasDriver: boolean;    // 👷 Technician
    isCompleted: boolean;  // ✅ Completed
    isNested: boolean;     // ◻️ Nested sub-job
  };

  // Financials
  balanceDue: number;
  totalAmount: number;
  paymentMethod?: string;
  reference?: string;
  isPaidInFull: boolean;

  // Mobile Field Checklist
  fieldChecklist?: {
    mowed?: boolean;
    edged?: boolean;
    weedTrimming?: boolean;
    debrisBlown?: boolean;
    gateClosedAndLocked?: boolean;
    beforePhotoTaken?: boolean;
    afterPhotoTaken?: boolean;
    customerSigned?: boolean;
    signedBy?: string;
    completedAt?: string;
  };

  journalLogs: JournalLog[];
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  workOrderId?: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  billingProfileLabel?: string;
  billingAddress: string;
  propertyType?: PropertyType;
  dateCreated: string;
  dateCompleted: string;
  dueDate: string;
  status: 'To Be Billed' | 'Draft' | 'Sent' | 'Paid' | 'Overdue';
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  paymentMethod?: string;
  paymentDate?: string;
  hasWarning?: boolean;
  warningMessage?: string;
}

// ── MSP Customer Site Documentation Types ──

export interface CameraDevice {
  id: string;
  siteId: string;
  name: string; // e.g. "CAM-01 Main Lobby / Entrance"
  location: string; // e.g. "Building A - Front Door"
  ipAddress: string; // e.g. "192.168.10.101"
  macAddress: string; // e.g. "00:1A:2B:3C:4D:5E"
  rtspUrl?: string; // e.g. "rtsp://192.168.10.101:554/stream1"
  nvrChannel?: number; // e.g. 1
  resolution?: string; // e.g. "4K 3840x2160"
  status: 'Online' | 'Offline' | 'Warning';
  credentialId?: string;
  notes?: string;
}

export interface StaticIPAssignment {
  id: string;
  ipAddress: string; // e.g. "192.168.10.5"
  deviceName: string; // e.g. "Primary Firewall - SonicWall TZ400"
  deviceType: 'Firewall' | 'Switch' | 'Server' | 'NVR' | 'Camera' | 'Access Point' | 'Printer' | 'UPS';
  macAddress?: string;
  notes?: string;
}

export interface IPSubnet {
  id: string;
  siteId: string;
  vlanId?: number; // e.g. 10
  name: string; // e.g. "Management & Server VLAN"
  cidr: string; // e.g. "192.168.10.0/24"
  gateway: string; // e.g. "192.168.10.1"
  dnsServers: string[]; // e.g. ["1.1.1.1", "8.8.8.8"]
  dhcpRange?: string; // e.g. "192.168.10.100 - 192.168.10.250"
  staticAllocations: StaticIPAssignment[];
}

export interface EncryptedCredential {
  id: string;
  siteId: string;
  title: string; // e.g. "SonicWall Firewall Admin Login"
  assetType: 'Firewall / Router' | 'Switch' | 'Server' | 'NVR / CCTV' | 'WiFi WPA2/3 Key' | 'Domain Admin' | 'Web Portal';
  username: string;
  password: string; // Encrypted or plain secret text
  lastRotated?: string;
  notes?: string;
}
