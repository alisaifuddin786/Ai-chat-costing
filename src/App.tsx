import React, { useState, useEffect } from 'react';
import { ExcelUploader } from './components/ExcelUploader';
import { QuotationPreview } from './components/QuotationPreview';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { ChatInterface } from './components/ChatInterface';
import { GroundServiceRate, TripDetails, QuotationItem, Message } from './types';
import { draftQuotationText } from './services/geminiService';
import { Plane, Sparkles, ChevronRight, History, Settings, LayoutDashboard, LogIn, LogOut, User, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { handleFirestoreError, OperationType } from './utils/errorHandlers';
import { collection, addDoc, query, where, getDocs, deleteDoc, doc, writeBatch, serverTimestamp, getDocFromServer, getDoc } from 'firebase/firestore';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [rates, setRates] = useState<GroundServiceRate[]>([]);
  const [currentView, setCurrentView] = useState<'admin' | 'chat' | 'preview' | 'history' | 'settings'>('chat');
  const [tripDetails, setTripDetails] = useState<TripDetails | null>(null);
  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>([]);
  const [draftText, setDraftText] = useState<string>('');
  const [agencySettings, setAgencySettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm your TravelAI Assistant. Describe the trip you're planning, and I'll build the quotation for you instantly. For example: 'Quotation for John Doe, 3-day Paris trip for 2 pax starting June 1st.'" }
  ]);

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthReady(true);
      if (user) {
        loadRates(user.uid);
        loadSettings(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadRates = async (uid: string) => {
    setLoading(true);
    setLoadingMessage('Loading your rates...');
    const path = 'serviceRates';
    try {
      const q = query(collection(db, path), where('uid', '==', uid));
      const querySnapshot = await getDocs(q);
      const loadedRates: GroundServiceRate[] = [];
      querySnapshot.forEach((doc) => {
        loadedRates.push(doc.data() as GroundServiceRate);
      });
      if (loadedRates.length > 0) {
        setRates(loadedRates);
        if (currentView === 'admin') setCurrentView('chat');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async (uid: string) => {
    try {
      const docRef = doc(db, 'settings', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setAgencySettings(docSnap.data());
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setRates([]);
      setCurrentView('chat');
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleRatesLoaded = async (newRates: GroundServiceRate[]) => {
    if (!user) {
      setRates(newRates);
      setCurrentView('chat');
      return;
    }

    setLoading(true);
    setLoadingMessage('Saving rates to cloud...');
    const path = 'serviceRates';
    try {
      // Clear old rates for this user
      const q = query(collection(db, path), where('uid', '==', user.uid));
      const querySnapshot = await getDocs(q);
      const batch = writeBatch(db);
      querySnapshot.forEach((document) => {
        batch.delete(doc(db, path, document.id));
      });
      await batch.commit();

      // Save new rates
      const saveBatch = writeBatch(db);
      newRates.forEach((rate) => {
        const newDocRef = doc(collection(db, path));
        saveBatch.set(newDocRef, { ...rate, uid: user.uid });
      });
      await saveBatch.commit();
      
      setRates(newRates);
      setCurrentView('chat');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuotation = async (details: TripDetails, items: QuotationItem[], customDraft?: string, skipRedirect = false) => {
    setLoading(true);
    setLoadingMessage('AI is drafting your quotation...');
    setTripDetails(details);
    setQuotationItems(items);
    
    const draft = customDraft || await draftQuotationText(details, items);
    setDraftText(draft);
    
    if (user) {
      const path = 'quotations';
      try {
        await addDoc(collection(db, path), {
          clientName: details.clientName,
          tripName: details.tripName,
          paxCount: details.paxCount,
          startDate: details.startDate,
          endDate: details.endDate,
          items,
          draftText: draft,
          totalAmount: items.reduce((sum, i) => sum + i.totalPrice, 0),
          uid: user.uid,
          createdAt: Date.now()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    }
    
    setLoading(false);
    if (!skipRedirect) {
      setCurrentView('preview');
    }
  };

  const handleSelectHistory = (q: any) => {
    setTripDetails({
      clientName: q.clientName,
      tripName: q.tripName,
      paxCount: q.paxCount,
      startDate: q.startDate,
      endDate: q.endDate,
      segments: q.items.map((i: any) => i.segment),
      additionalNotes: q.additionalNotes || ''
    });
    setQuotationItems(q.items);
    setDraftText(q.draftText);
    setCurrentView('preview');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Sidebar Navigation */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 p-6 hidden lg:block">
        <div className="flex items-center gap-3 mb-12">
          <div className="p-2 bg-emerald-600 rounded-xl shadow-lg shadow-emerald-200">
            <Plane className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-900">TravelAI</h1>
        </div>

        <nav className="space-y-2">
          <button 
            onClick={() => setCurrentView('chat')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'chat' ? 'bg-purple-50 text-purple-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Sparkles className="w-5 h-5" />
            Frontend (Chat)
          </button>
          <button 
            onClick={() => setCurrentView('admin')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'admin' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Backend (Rates)
          </button>
          <button 
            onClick={() => setCurrentView('history')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'history' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <History className="w-5 h-5" />
            History
          </button>
          <button 
            onClick={() => setCurrentView('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === 'settings' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Settings className="w-5 h-5" />
            Settings
          </button>
        </nav>

        <div className="absolute bottom-8 left-6 right-6">
          {user ? (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <User className="w-5 h-5 text-emerald-600" />
                  )}
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-slate-900 truncate">{user.displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl transition-all"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
            >
              <LogIn className="w-5 h-5" />
              Sign In
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-8 max-w-7xl mx-auto">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-12">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 uppercase tracking-widest mb-1">
              <Sparkles className="w-4 h-4" />
              AI Powered
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">
              {currentView === 'chat' && "AI Trip Planner"}
              {currentView === 'admin' && "Backend Rate Management"}
              {currentView === 'preview' && "Your Quotation is Ready"}
              {currentView === 'history' && "Your History"}
              {currentView === 'settings' && "Agency Settings"}
            </h2>
            <p className="text-slate-500 mt-1">
              {!user && "Sign in to save your rates and quotations to the cloud."}
              {currentView === 'chat' && "Tell me what you need, and I'll build the quotation for you."}
              {user && currentView === 'admin' && "Upload your rates to get started with AI-generated quotations."}
              {currentView === 'preview' && "Review the details and export your quotation as a PDF."}
              {currentView === 'history' && "View and manage your previous quotations."}
              {currentView === 'settings' && "Configure your agency details for PDF exports."}
            </p>
          </div>
          
          <div className="flex items-center gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
            <div className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${currentView === 'admin' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>Backend</div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <div className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${currentView === 'chat' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>Frontend</div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <div className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${currentView === 'preview' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>Review</div>
          </div>
        </header>

        {/* Content Area */}
        <div className="relative">
          {loading && (
            <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-emerald-100 rounded-full" />
                <div className="absolute top-0 left-0 w-20 h-20 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-xl font-bold text-slate-900 mt-6">{loadingMessage}</p>
              <p className="text-slate-500 mt-1">This will only take a moment.</p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {currentView === 'admin' && (
              <motion.div
                key="admin"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-2xl mx-auto"
              >
                <ExcelUploader onRatesLoaded={handleRatesLoaded} />
                
                {rates.length > 0 && (
                  <div className="mt-8 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-1">Current Rates</p>
                      <p className="text-lg font-bold text-slate-900">{rates.length} service rates loaded</p>
                    </div>
                    <button 
                      onClick={() => setCurrentView('chat')}
                      className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all active:scale-95"
                    >
                      Go to Frontend
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {currentView === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto"
              >
                {rates.length === 0 ? (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col items-center justify-center p-12 text-center h-[600px]">
                    <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
                      <LayoutDashboard className="w-10 h-10" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-2">Welcome to the Frontend</h3>
                    <p className="text-slate-500 mb-8 max-w-md">
                      To start generating AI quotations, you need to configure your service rates in the Backend first.
                    </p>
                    <button 
                      onClick={() => setCurrentView('admin')}
                      className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                    >
                      Go to Backend (Upload Rates)
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col h-[600px]">
                    <div className="p-6 bg-purple-600 text-white flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">AI Trip Planner</h3>
                        <p className="text-purple-100 text-sm">Describe your trip and I'll handle the costing</p>
                      </div>
                    </div>
                    <ChatInterface 
                      rates={rates} 
                      onQuotationParsed={handleGenerateQuotation} 
                      isFullPage={true}
                      agencySettings={agencySettings}
                      messages={messages}
                      setMessages={setMessages}
                    />
                  </div>
                )}
              </motion.div>
            )}

            {currentView === 'preview' && tripDetails && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <QuotationPreview 
                  details={tripDetails} 
                  items={quotationItems} 
                  draftText={draftText} 
                />
                <div className="mt-8 flex justify-center">
                  <button 
                    onClick={() => setCurrentView('chat')}
                    className="px-8 py-4 bg-white text-slate-900 border border-slate-200 rounded-2xl font-bold hover:bg-slate-50 transition-all active:scale-95"
                  >
                    Back to Chat
                  </button>
                </div>
              </motion.div>
            )}

            {currentView === 'history' && user && (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <HistoryView userId={user.uid} onSelect={handleSelectHistory} />
              </motion.div>
            )}

            {currentView === 'settings' && user && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <SettingsView userId={user.uid} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Global Floating AI Assistant */}
      {rates.length > 0 && currentView !== 'chat' && (
        <ChatInterface 
          rates={rates} 
          onQuotationParsed={handleGenerateQuotation} 
          agencySettings={agencySettings}
          messages={messages}
          setMessages={setMessages}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}


