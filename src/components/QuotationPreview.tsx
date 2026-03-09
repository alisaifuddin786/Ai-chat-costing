import React, { useState, useEffect } from 'react';
import { TripDetails, QuotationItem, AgencySettings } from '../types';
import { Download, FileText, Share2, Printer } from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import ReactMarkdown from 'react-markdown';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

interface QuotationPreviewProps {
  details: TripDetails;
  items: QuotationItem[];
  draftText: string;
}

export const QuotationPreview: React.FC<QuotationPreviewProps> = ({ details, items, draftText }) => {
  const [agencySettings, setAgencySettings] = useState<AgencySettings | null>(null);
  const totalAmount = items.reduce((sum, i) => sum + i.totalPrice, 0);

  useEffect(() => {
    const loadSettings = async () => {
      if (auth.currentUser) {
        const docRef = doc(db, 'settings', auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setAgencySettings(docSnap.data() as AgencySettings);
        }
      }
    };
    loadSettings();
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(draftText);
    alert('Proposal copied to clipboard!');
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Header
    if (agencySettings?.agencyName) {
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(agencySettings.agencyName.toUpperCase(), 20, 15);
      doc.setFontSize(8);
      doc.text(`${agencySettings.email} | ${agencySettings.phone} | ${agencySettings.website}`, 20, 20);
      doc.setTextColor(0);
    }

    doc.setFontSize(22);
    doc.text('TRAVEL QUOTATION', 105, 35, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Client: ${details.clientName}`, 20, 50);
    doc.text(`Trip: ${details.tripName}`, 20, 57);
    doc.text(`Pax: ${details.paxCount}`, 20, 64);
    doc.text(`Dates: ${details.startDate} to ${details.endDate}`, 20, 71);
    
    // Table
    const tableData = items.map(item => [
      item.segment,
      item.description,
      item.quantity,
      `$${item.unitPrice.toLocaleString()}`,
      `$${item.totalPrice.toLocaleString()}`
    ]);
    
    (doc as any).autoTable({
      startY: 80,
      head: [['Segment', 'Description', 'Qty', 'Unit Price', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] } // Emerald-500
    });
    
    let finalY = (doc as any).lastAutoTable.finalY || 150;
    
    doc.setFontSize(14);
    doc.text(`Grand Total: $${totalAmount.toLocaleString()}`, 190, finalY + 15, { align: 'right' });
    
    // Add AI Proposal to PDF
    doc.addPage();
    doc.setFontSize(18);
    doc.text('PROPOSAL DETAILS', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    
    // Clean markdown for PDF (basic cleanup)
    const cleanText = draftText.replace(/[#*`]/g, '');
    const splitText = doc.splitTextToSize(cleanText, 170);
    doc.text(splitText, 20, 35);
    
    doc.save(`Quotation_${details.clientName}_${details.tripName}.pdf`);
  };

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-black/5 space-y-8">
      <div className="flex items-center justify-between border-b border-gray-100 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Quotation Preview</h2>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Printer className="w-5 h-5" />
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-all shadow-md active:scale-95"
          >
            <Download className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* AI Draft Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Share2 className="w-5 h-5 text-purple-500" />
              AI Drafted Proposal
            </h3>
            <button 
              onClick={copyToClipboard}
              className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1"
            >
              Copy Text
            </button>
          </div>
          <div className="prose prose-emerald max-w-none p-6 bg-purple-50/50 rounded-2xl border border-purple-100">
            <ReactMarkdown>{draftText}</ReactMarkdown>
          </div>
        </div>

        {/* Breakdown Section */}
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-gray-900">Summary Breakdown</h3>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <p className="font-semibold text-gray-900">{item.segment}</p>
                  <p className="text-xs text-gray-500">{item.quantity} pax x ${item.unitPrice.toLocaleString()}</p>
                </div>
                <p className="font-bold text-gray-900">${item.totalPrice.toLocaleString()}</p>
              </div>
            ))}
          </div>
          <div className="pt-6 border-t border-gray-100 flex justify-between items-end">
            <p className="text-sm font-medium text-gray-500">Total Amount</p>
            <p className="text-3xl font-black text-emerald-600">${totalAmount.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
