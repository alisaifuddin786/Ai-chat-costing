import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Sparkles, AlertCircle, X, Minimize2, Maximize2, Bot, FileText, Download, ExternalLink, Eye, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { chatWithAI } from '../services/geminiService';
import { GroundServiceRate, TripDetails, QuotationItem, Message } from '../types';
import { generateQuotationPDF } from '../utils/pdfGenerator';
import Markdown from 'react-markdown';

interface ChatInterfaceProps {
  rates: GroundServiceRate[];
  onQuotationParsed: (details: TripDetails, items: QuotationItem[], draft?: string, skipRedirect?: boolean) => void;
  isFullPage?: boolean;
  agencySettings?: any;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  rates, 
  onQuotationParsed, 
  isFullPage = false, 
  agencySettings,
  messages,
  setMessages
}) => {
  const [isOpen, setIsOpen] = useState(isFullPage);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewingDraft, setViewingDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const result = await chatWithAI(newMessages, rates);
      const assistantMsg: Message = { 
        role: 'assistant', 
        content: result.text,
        quotation: result.quotation
      };
      
      setMessages(prev => [...prev, assistantMsg]);

      // Automatically save to history in background if quotation is generated
      if (result.quotation) {
        onQuotationParsed(result.quotation.details, result.quotation.items, result.quotation.draftText, true);
      }
    } catch (err: any) {
      console.error("Chat Error:", err);
      let errorMessage = "I'm sorry, I encountered an error. Could you please try again?";
      
      const errorString = err?.toString() || "";
      if (err?.status === 429 || errorString.includes('429') || errorString.includes('RESOURCE_EXHAUSTED') || errorString.includes('quota')) {
        errorMessage = "You have exceeded your Gemini API quota. Please check your plan and billing details at https://ai.google.dev/gemini-api/docs/rate-limits.";
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: errorMessage }]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = (q: any) => {
    generateQuotationPDF(q.details, q.items, agencySettings);
  };

  return (
    <>
      {/* Floating Toggle Button */}
      {!isFullPage && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-8 right-8 w-16 h-16 rounded-full shadow-2xl flex items-center justify-center z-50 transition-all ${
            isOpen ? 'scale-0 opacity-0 pointer-events-none' : 'bg-purple-600 text-white'
          }`}
        >
          <Bot className="w-8 h-8" />
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
        </motion.button>
      )}

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={isFullPage ? { opacity: 0 } : { opacity: 0, y: 100, scale: 0.8 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              height: isFullPage ? '100%' : (isMinimized ? '64px' : '600px')
            }}
            exit={isFullPage ? { opacity: 0 } : { opacity: 0, y: 100, scale: 0.8 }}
            className={`${
              isFullPage 
                ? 'w-full h-full flex flex-col' 
                : 'fixed bottom-8 right-8 w-[400px] bg-white rounded-3xl shadow-2xl border border-slate-200 z-50 overflow-hidden flex flex-col'
            }`}
          >
            {/* Header */}
            {!isFullPage && (
              <div className="p-4 bg-purple-600 text-white flex items-center justify-between cursor-pointer" onClick={() => setIsMinimized(!isMinimized)}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">TravelAI Assistant</h3>
                    {!isMinimized && <p className="text-[10px] text-purple-200 uppercase tracking-wider font-bold">Online & Ready</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {!isMinimized && (
              <>
                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
                  {messages.map((msg, idx) => (
                    <motion.div
                      initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={idx}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${
                        msg.role === 'user' 
                          ? 'bg-purple-600 text-white rounded-tr-none' 
                          : 'bg-white text-slate-700 border border-slate-200 shadow-sm rounded-tl-none'
                      }`}>
                        {msg.content}
                      </div>
                      
                      {msg.quotation && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-3 w-full max-w-[85%] bg-white rounded-2xl border-2 border-purple-100 shadow-lg overflow-hidden"
                        >
                          <div className="p-4 bg-purple-50 border-b border-purple-100 flex items-center gap-3">
                            <div className="p-2 bg-purple-600 rounded-lg">
                              <FileText className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-purple-900 uppercase tracking-wider">Quotation Ready</p>
                              <p className="text-sm font-bold text-slate-900">{msg.quotation.details.tripName}</p>
                            </div>
                          </div>
                          <div className="p-4 space-y-3">
                            <div className="flex justify-between text-xs text-slate-500">
                              <span>Client: {msg.quotation.details.clientName}</span>
                              <span>Pax: {msg.quotation.details.paxCount}</span>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => setViewingDraft(msg.quotation!.draftText || "No draft available.")}
                                className="flex-1 flex items-center justify-center gap-2 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-all"
                              >
                                <Eye className="w-3 h-3" />
                                View Draft
                              </button>
                              <button 
                                onClick={() => handleDownloadPDF(msg.quotation)}
                                className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all"
                              >
                                <Download className="w-3 h-3" />
                                PDF
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-slate-100">
                  <div className="relative">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Type your trip details..."
                      className="w-full pl-4 pr-12 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-purple-500 outline-none transition-all text-sm"
                      disabled={loading}
                    />
                    <button
                      type="submit"
                      disabled={loading || !input.trim()}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${
                        loading || !input.trim() 
                          ? 'text-slate-300' 
                          : 'text-purple-600 hover:bg-purple-50'
                      }`}
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 text-center flex items-center justify-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Powered by Gemini 3.1 Pro
                  </p>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Draft Viewer Modal */}
      <AnimatePresence>
        {viewingDraft && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingDraft(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-600 rounded-xl">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Quotation Draft</h3>
                </div>
                <button 
                  onClick={() => setViewingDraft(null)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 md:p-12 bg-white">
                <div className="prose prose-slate max-w-none markdown-body">
                  <Markdown>{viewingDraft}</Markdown>
                </div>
              </div>
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button 
                  onClick={() => setViewingDraft(null)}
                  className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-all"
                >
                  Close
                </button>
                <button 
                  onClick={() => {
                    if (viewingDraft) {
                      navigator.clipboard.writeText(viewingDraft);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                  className="px-6 py-3 bg-slate-800 text-white font-bold hover:bg-slate-900 rounded-xl transition-all flex items-center gap-2"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy Text'}
                </button>
                <button 
                  onClick={() => {
                    // Find the quotation associated with this draft
                    const msg = messages.find(m => m.quotation?.draftText === viewingDraft);
                    if (msg?.quotation) handleDownloadPDF(msg.quotation);
                  }}
                  className="px-6 py-3 bg-purple-600 text-white font-bold hover:bg-purple-700 rounded-xl transition-all flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
