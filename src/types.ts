export interface GroundServiceRate {
  segment: string;
  paxRange: string; // e.g., "1-2", "3-5", "6-10"
  minPax: number;
  maxPax: number;
  rate: number;
  currency: string;
}

export interface TripDetails {
  clientName: string;
  tripName: string;
  paxCount: number;
  startDate: string;
  endDate: string;
  segments: string[];
  additionalNotes: string;
}

export interface Quotation {
  id?: string;
  details: TripDetails;
  items: QuotationItem[];
  totalAmount: number;
  currency: string;
  draftText: string;
  createdAt: number;
}

export interface QuotationItem {
  segment: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface AgencySettings {
  agencyName: string;
  email: string;
  phone: string;
  website: string;
  logoUrl?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  quotation?: {
    details: TripDetails;
    items: QuotationItem[];
    draftText?: string;
  };
}
