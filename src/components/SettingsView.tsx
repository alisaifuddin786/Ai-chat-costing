import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { AgencySettings } from '../types';
import { Building2, Mail, Phone, Globe, Save, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface SettingsViewProps {
  userId: string;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ userId }) => {
  const [settings, setSettings] = useState<AgencySettings>({
    agencyName: '',
    email: '',
    phone: '',
    website: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [userId]);

  const loadSettings = async () => {
    try {
      const docRef = doc(db, 'settings', userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSettings(docSnap.data() as AgencySettings);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', userId), settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={handleSave} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            Agency Name
          </label>
          <input
            type="text"
            value={settings.agencyName}
            onChange={e => setSettings({ ...settings, agencyName: e.target.value })}
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            placeholder="e.g. Dream Travels Co."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400" />
              Business Email
            </label>
            <input
              type="email"
              value={settings.email}
              onChange={e => setSettings({ ...settings, email: e.target.value })}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              placeholder="contact@agency.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Phone className="w-4 h-4 text-slate-400" />
              Phone Number
            </label>
            <input
              type="text"
              value={settings.phone}
              onChange={e => setSettings({ ...settings, phone: e.target.value })}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              placeholder="+1 234 567 890"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-400" />
            Website
          </label>
          <input
            type="url"
            value={settings.website}
            onChange={e => setSettings({ ...settings, website: e.target.value })}
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            placeholder="https://www.agency.com"
          />
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={saving}
            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold transition-all shadow-lg ${saved ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95'}`}
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : saved ? (
              <>
                <CheckCircle className="w-5 h-5" />
                Settings Saved!
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </form>

      <div className="mt-8 p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
        <h4 className="font-bold text-emerald-900 mb-2">Why set these?</h4>
        <p className="text-sm text-emerald-700 leading-relaxed">
          Your agency details will be automatically included in the header of your exported PDF quotations, making them look professional and ready for clients.
        </p>
      </div>
    </div>
  );
};
