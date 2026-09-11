import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Customer,
  JobSite,
  BillingProfile,
  ServiceTypeItem,
  EquipmentAsset,
  TechnicianTeamMember,
  FacilitySite,
  WorkOrder,
  Invoice,
  CameraDevice,
  IPSubnet,
  EncryptedCredential
} from '../types';
import {
  INITIAL_CUSTOMERS,
  INITIAL_TECHNICIANS,
  INITIAL_EQUIPMENT,
  INITIAL_FACILITIES,
  INITIAL_INVOICES,
  INITIAL_WORK_ORDERS,
  INITIAL_SERVICE_TYPES,
  INITIAL_CAMERAS,
  INITIAL_SUBNETS,
  INITIAL_CREDENTIALS
} from './mockData';

interface AppContextType {
  currentDate: string;
  setCurrentDate: (d: string) => void;
  activeTab: string;
  setActiveTab: (t: string) => void;
  companyName: string;
  setCompanyName: (c: string) => void;
  
  // Data
  workOrders: WorkOrder[];
  customers: Customer[];
  serviceTypes: ServiceTypeItem[];
  equipment: EquipmentAsset[];
  technicians: TechnicianTeamMember[];
  facilities: FacilitySite[];
  invoices: Invoice[];

  // MSP Site Documentation Data
  cameras: CameraDevice[];
  subnets: IPSubnet[];
  credentials: EncryptedCredential[];

  // MSP Actions
  addCamera: (cam: CameraDevice) => void;
  updateCamera: (cam: CameraDevice) => void;
  deleteCamera: (id: string) => void;

  addSubnet: (sub: IPSubnet) => void;
  updateSubnet: (sub: IPSubnet) => void;
  deleteSubnet: (id: string) => void;

  addCredential: (cred: EncryptedCredential) => void;
  updateCredential: (cred: EncryptedCredential) => void;
  deleteCredential: (id: string) => void;
  
  // Work Order Actions
  addWorkOrder: (wo: WorkOrder) => void;
  updateWorkOrder: (wo: WorkOrder) => void;
  deleteWorkOrder: (id: string) => void;
  
  // Customer & Multi-Site Actions
  addCustomer: (cust: Customer) => void;
  updateCustomer: (cust: Customer) => void;
  deleteCustomer: (id: string) => void;
  addJobSite: (customerId: string, site: JobSite) => void;
  updateJobSite: (customerId: string, site: JobSite) => void;
  deleteJobSite: (customerId: string, siteId: string) => void;
  addBillingProfile: (customerId: string, profile: BillingProfile) => void;
  updateBillingProfile: (customerId: string, profile: BillingProfile) => void;
  deleteBillingProfile: (customerId: string, profileId: string) => void;

  // Service Catalog Actions
  addServiceType: (srv: ServiceTypeItem) => void;
  updateServiceType: (srv: ServiceTypeItem) => void;
  deleteServiceType: (id: string) => void;
  
  // Equipment Actions
  addEquipment: (eq: EquipmentAsset) => void;
  updateEquipment: (eq: EquipmentAsset) => void;
  deleteEquipment: (id: string) => void;
  
  // Invoice Actions
  addInvoice: (inv: Invoice) => void;
  updateInvoice: (inv: Invoice) => void;
  deleteInvoice: (id: string) => void;
  batchGenerateInvoices: (woIds: string[]) => void;
  recordPayment: (invoiceId: string, amount: number, method: string, reference?: string) => void;
  
  // Modals & Inspection
  isWorkOrderModalOpen: boolean;
  editingWorkOrder: WorkOrder | null;
  openWorkOrderModal: (wo?: WorkOrder | null) => void;
  closeWorkOrderModal: () => void;
  
  isServicesModalOpen: boolean;
  setIsServicesModalOpen: (open: boolean) => void;

  quickInspectWO: WorkOrder | null;
  setQuickInspectWO: (wo: WorkOrder | null) => void;
  
  viewingInvoice: Invoice | null;
  setViewingInvoice: (inv: Invoice | null) => void;
  
  mobileActiveTechId: string;
  setMobileActiveTechId: (id: string) => void;

  resetToDefaultData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  WORK_ORDERS: 'greenscape_landscaping_wo_v3',
  CUSTOMERS: 'greenscape_landscaping_cust_v3',
  SERVICE_TYPES: 'greenscape_services_v3',
  EQUIPMENT: 'greenscape_equipment_v3',
  TECHNICIANS: 'greenscape_technicians_v3',
  FACILITIES: 'greenscape_facilities_v3',
  INVOICES: 'greenscape_invoices_v3',
  CAMERAS: 'msp_site_cameras_v1',
  SUBNETS: 'msp_site_subnets_v1',
  CREDENTIALS: 'msp_site_credentials_v1',
  DATE: 'greenscape_date_v3',
  TAB: 'greenscape_tab_v3',
  COMPANY: 'greenscape_company_name_v3'
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentDate, setCurrentDate] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.DATE) || '2026-08-28';
  });

  const [activeTab, setActiveTab] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.TAB) || 'dispatch';
  });

  const [companyName, setCompanyName] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.COMPANY) || 'Emerald Turf & Grounds - Gulf Coast HQ';
  });

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.WORK_ORDERS);
    return saved ? JSON.parse(saved) : INITIAL_WORK_ORDERS;
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    return saved ? JSON.parse(saved) : INITIAL_CUSTOMERS;
  });

  const [serviceTypes, setServiceTypes] = useState<ServiceTypeItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SERVICE_TYPES);
    return saved ? JSON.parse(saved) : INITIAL_SERVICE_TYPES;
  });

  const [equipment, setEquipment] = useState<EquipmentAsset[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.EQUIPMENT);
    return saved ? JSON.parse(saved) : INITIAL_EQUIPMENT;
  });

  const [technicians, setTechnicians] = useState<TechnicianTeamMember[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TECHNICIANS);
    return saved ? JSON.parse(saved) : INITIAL_TECHNICIANS;
  });

  const [facilities, setFacilities] = useState<FacilitySite[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.FACILITIES);
    return saved ? JSON.parse(saved) : INITIAL_FACILITIES;
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.INVOICES);
    return saved ? JSON.parse(saved) : INITIAL_INVOICES;
  });

  const [cameras, setCameras] = useState<CameraDevice[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CAMERAS);
    return saved ? JSON.parse(saved) : INITIAL_CAMERAS;
  });

  const [subnets, setSubnets] = useState<IPSubnet[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SUBNETS);
    return saved ? JSON.parse(saved) : INITIAL_SUBNETS;
  });

  const [credentials, setCredentials] = useState<EncryptedCredential[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CREDENTIALS);
    return saved ? JSON.parse(saved) : INITIAL_CREDENTIALS;
  });

  // Modal states
  const [isWorkOrderModalOpen, setIsWorkOrderModalOpen] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrder | null>(null);
  const [isServicesModalOpen, setIsServicesModalOpen] = useState(false);
  const [quickInspectWO, setQuickInspectWO] = useState<WorkOrder | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [mobileActiveTechId, setMobileActiveTechId] = useState<string>('tech-2'); // default Craig

  // Persist state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WORK_ORDERS, JSON.stringify(workOrders));
  }, [workOrders]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SERVICE_TYPES, JSON.stringify(serviceTypes));
  }, [serviceTypes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.EQUIPMENT, JSON.stringify(equipment));
  }, [equipment]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CAMERAS, JSON.stringify(cameras));
  }, [cameras]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SUBNETS, JSON.stringify(subnets));
  }, [subnets]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CREDENTIALS, JSON.stringify(credentials));
  }, [credentials]);

  // Camera Actions
  const addCamera = (cam: CameraDevice) => {
    setCameras(prev => [...prev, cam]);
  };

  const updateCamera = (cam: CameraDevice) => {
    setCameras(prev => prev.map(c => c.id === cam.id ? cam : c));
  };

  const deleteCamera = (id: string) => {
    setCameras(prev => prev.filter(c => c.id !== id));
  };

  // Subnet Actions
  const addSubnet = (sub: IPSubnet) => {
    setSubnets(prev => [...prev, sub]);
  };

  const updateSubnet = (sub: IPSubnet) => {
    setSubnets(prev => prev.map(s => s.id === sub.id ? sub : s));
  };

  const deleteSubnet = (id: string) => {
    setSubnets(prev => prev.filter(s => s.id !== id));
  };

  // Credential Actions
  const addCredential = (cred: EncryptedCredential) => {
    setCredentials(prev => [...prev, cred]);
  };

  const updateCredential = (cred: EncryptedCredential) => {
    setCredentials(prev => prev.map(c => c.id === cred.id ? cred : c));
  };

  const deleteCredential = (id: string) => {
    setCredentials(prev => prev.filter(c => c.id !== id));
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COMPANY, companyName);
  }, [companyName]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DATE, currentDate);
  }, [currentDate]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TAB, activeTab);
  }, [activeTab]);

  // Work Order actions
  const addWorkOrder = (wo: WorkOrder) => {
    setWorkOrders(prev => [wo, ...prev]);
  };

  const updateWorkOrder = (wo: WorkOrder) => {
    setWorkOrders(prev => prev.map(item => item.id === wo.id ? wo : item));
  };

  const deleteWorkOrder = (id: string) => {
    setWorkOrders(prev => prev.filter(item => item.id !== id));
  };

  // Customer actions
  const addCustomer = (cust: Customer) => {
    setCustomers(prev => [...prev, cust]);
  };

  const updateCustomer = (cust: Customer) => {
    setCustomers(prev => prev.map(c => c.id === cust.id ? cust : c));
  };

  const deleteCustomer = (id: string) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
  };

  const addJobSite = (customerId: string, site: JobSite) => {
    setCustomers(prev => prev.map(c => {
      if (c.id === customerId) {
        return {
          ...c,
          jobSites: [...c.jobSites, site]
        };
      }
      return c;
    }));
  };

  const updateJobSite = (customerId: string, site: JobSite) => {
    setCustomers(prev => prev.map(c => {
      if (c.id === customerId) {
        return {
          ...c,
          jobSites: c.jobSites.map(s => s.id === site.id ? site : s)
        };
      }
      return c;
    }));
  };

  const deleteJobSite = (customerId: string, siteId: string) => {
    setCustomers(prev => prev.map(c => {
      if (c.id === customerId) {
        return {
          ...c,
          jobSites: c.jobSites.filter(s => s.id !== siteId)
        };
      }
      return c;
    }));
  };

  const addBillingProfile = (customerId: string, profile: BillingProfile) => {
    setCustomers(prev => prev.map(c => {
      if (c.id === customerId) {
        return {
          ...c,
          billingProfiles: [...c.billingProfiles, profile]
        };
      }
      return c;
    }));
  };

  const updateBillingProfile = (customerId: string, profile: BillingProfile) => {
    setCustomers(prev => prev.map(c => {
      if (c.id === customerId) {
        return {
          ...c,
          billingProfiles: c.billingProfiles.map(p => p.id === profile.id ? profile : p)
        };
      }
      return c;
    }));
  };

  const deleteBillingProfile = (customerId: string, profileId: string) => {
    setCustomers(prev => prev.map(c => {
      if (c.id === customerId) {
        return {
          ...c,
          billingProfiles: c.billingProfiles.filter(p => p.id !== profileId)
        };
      }
      return c;
    }));
  };

  // Service Catalog actions
  const addServiceType = (srv: ServiceTypeItem) => {
    setServiceTypes(prev => [...prev, srv]);
  };

  const updateServiceType = (srv: ServiceTypeItem) => {
    setServiceTypes(prev => prev.map(s => s.id === srv.id ? srv : s));
  };

  const deleteServiceType = (id: string) => {
    setServiceTypes(prev => prev.filter(s => s.id !== id));
  };

  // Equipment actions
  const addEquipment = (eq: EquipmentAsset) => {
    setEquipment(prev => [...prev, eq]);
  };

  const updateEquipment = (eq: EquipmentAsset) => {
    setEquipment(prev => prev.map(e => e.id === eq.id ? eq : e));
  };

  const deleteEquipment = (id: string) => {
    setEquipment(prev => prev.filter(e => e.id !== id));
  };

  // Invoice actions
  const addInvoice = (inv: Invoice) => {
    setInvoices(prev => [inv, ...prev]);
  };

  const updateInvoice = (inv: Invoice) => {
    setInvoices(prev => prev.map(i => i.id === inv.id ? inv : i));
  };

  const deleteInvoice = (id: string) => {
    setInvoices(prev => prev.filter(i => i.id !== id));
  };

  const batchGenerateInvoices = (woIds: string[]) => {
    const newInvoices: Invoice[] = [];
    woIds.forEach(id => {
      const wo = workOrders.find(w => w.id === id);
      if (!wo) return;
      
      const invNumber = `INV-${wo.woNumber.replace('WO-', '')}`;
      if (invoices.some(i => i.invoiceNumber === invNumber)) return;

      const subtotal = wo.totalAmount || 150;
      const taxRate = 0.075;
      const taxAmount = Number((subtotal * taxRate).toFixed(2));
      const total = Number((subtotal + taxAmount).toFixed(2));

      newInvoices.push({
        id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        invoiceNumber: invNumber,
        workOrderId: wo.id,
        customerId: wo.customerId,
        customerName: wo.customerName,
        customerEmail: wo.customerEmail,
        billingProfileLabel: wo.billingProfileLabel,
        billingAddress: `${wo.billToAddress}, ${wo.billToCity}, ${wo.billToState} ${wo.billToZip}`,
        propertyType: wo.propertyType,
        dateCreated: 'Aug 28, 2026',
        dateCompleted: 'Aug 28, 2026',
        dueDate: 'Sep 28, 2026',
        status: wo.isPaidInFull ? 'Paid' : 'To Be Billed',
        items: [
          {
            id: 'it-gen-1',
            description: wo.serviceTypeName || wo.jobName || 'Professional Landscaping Service',
            quantity: 1,
            unitPrice: subtotal,
            amount: subtotal
          }
        ],
        subtotal,
        taxRate,
        taxAmount,
        total,
        amountPaid: wo.isPaidInFull ? total : 0,
        balanceDue: wo.isPaidInFull ? 0 : total,
        paymentMethod: wo.paymentMethod,
        hasWarning: wo.flags.hasHazard && !wo.jobSitePO
      });
    });

    if (newInvoices.length > 0) {
      setInvoices(prev => [...newInvoices, ...prev]);
    }
  };

  const recordPayment = (invoiceId: string, amount: number, method: string, reference?: string) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id === invoiceId) {
        const newPaid = inv.amountPaid + amount;
        const newBal = Math.max(0, inv.total - newPaid);
        return {
          ...inv,
          amountPaid: newPaid,
          balanceDue: newBal,
          status: newBal === 0 ? 'Paid' : 'Sent',
          paymentMethod: method,
          paymentDate: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
        };
      }
      return inv;
    }));
  };

  const openWorkOrderModal = (wo?: WorkOrder | null) => {
    setEditingWorkOrder(wo || null);
    setIsWorkOrderModalOpen(true);
  };

  const closeWorkOrderModal = () => {
    setEditingWorkOrder(null);
    setIsWorkOrderModalOpen(false);
  };

  const resetToDefaultData = () => {
    setWorkOrders(INITIAL_WORK_ORDERS);
    setCustomers(INITIAL_CUSTOMERS);
    setServiceTypes(INITIAL_SERVICE_TYPES);
    setEquipment(INITIAL_EQUIPMENT);
    setTechnicians(INITIAL_TECHNICIANS);
    setFacilities(INITIAL_FACILITIES);
    setInvoices(INITIAL_INVOICES);
    setCameras(INITIAL_CAMERAS);
    setSubnets(INITIAL_SUBNETS);
    setCredentials(INITIAL_CREDENTIALS);
    setCompanyName('Emerald Turf & Grounds - Gulf Coast HQ');
    setCurrentDate('2026-08-28');
    localStorage.clear();
  };

  return (
    <AppContext.Provider
      value={{
        currentDate,
        setCurrentDate,
        activeTab,
        setActiveTab,
        companyName,
        setCompanyName,
        workOrders,
        customers,
        serviceTypes,
        equipment,
        technicians,
        facilities,
        invoices,
        cameras,
        subnets,
        credentials,
        addCamera,
        updateCamera,
        deleteCamera,
        addSubnet,
        updateSubnet,
        deleteSubnet,
        addCredential,
        updateCredential,
        deleteCredential,
        addWorkOrder,
        updateWorkOrder,
        deleteWorkOrder,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        addJobSite,
        updateJobSite,
        deleteJobSite,
        addBillingProfile,
        updateBillingProfile,
        deleteBillingProfile,
        addServiceType,
        updateServiceType,
        deleteServiceType,
        addEquipment,
        updateEquipment,
        deleteEquipment,
        addInvoice,
        updateInvoice,
        deleteInvoice,
        batchGenerateInvoices,
        recordPayment,
        isWorkOrderModalOpen,
        editingWorkOrder,
        openWorkOrderModal,
        closeWorkOrderModal,
        isServicesModalOpen,
        setIsServicesModalOpen,
        quickInspectWO,
        setQuickInspectWO,
        viewingInvoice,
        setViewingInvoice,
        mobileActiveTechId,
        setMobileActiveTechId,
        resetToDefaultData
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
