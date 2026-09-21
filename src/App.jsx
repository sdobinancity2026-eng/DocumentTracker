import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Search, Send, CheckCircle2, Clock, AlertCircle, 
  Printer, PenTool, UserCheck, ChevronRight, ShieldCheck, 
  Building2, ArrowRightLeft, FileCheck, RefreshCw, Eye, Download, LogOut, LogIn, Lock, Mail
} from 'lucide-react';
import { supabase } from './supabaseClient';

const OFFICES = [
  { code: 'SCH-BINAN-ES', name: 'Biñan Elementary School', category: 'SCHOOL' },
  { code: 'SCH-MALABAN-NHS', name: 'Malaban National High School', category: 'SCHOOL' },
  { code: 'SDO-OSDS', name: 'Office of the Schools Division Superintendent', category: 'SDO_OFFICE' },
  { code: 'SDO-CID', name: 'Curriculum Implementation Division (CID)', category: 'SDO_OFFICE' },
  { code: 'SDO-SGOD', name: 'School Governance and Operations Division (SGOD)', category: 'SDO_OFFICE' },
  { code: 'SDO-ACCT', name: 'Accounting & Finance Unit', category: 'SDO_OFFICE' },
  { code: 'SDO-HR', name: 'Human Resource Management Office (HRMO)', category: 'SDO_OFFICE' }
];

export default function App() {
  // Authentication & Session States
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Main Application States
  const [currentAccount, setCurrentAccount] = useState(OFFICES[0]);
  const [activeTab, setActiveTab] = useState('track');
  const [searchTrackingNo, setSearchTrackingNo] = useState('');
  const [trackedDocument, setTrackedDocument] = useState(null);
  const [officeDocuments, setOfficeDocuments] = useState([]);
  const [selectedDocForModal, setSelectedDocForModal] = useState(null);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  
  // Submit Form State
  const [formData, setFormData] = useState({
    title: '',
    doc_type: 'Travel Order',
    destination_office_code: 'SDO-OSDS',
    priority: 'Normal',
    requires_signature: false
  });

  // E-Signature Pad Canvas Ref
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [forwardDestination, setForwardDestination] = useState('SDO-CID');
  const [actionRemarks, setActionRemarks] = useState('');

  // 1. Listen for Supabase Authentication State
  useEffect(() => {
    supabase?.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserProfile(session.user.id);
      else setAuthLoading(false);
    });

    const { data: { subscription } } = supabase?.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setProfile(null);
        setAuthLoading(false);
      }
    }) || { data: { subscription: { unsubscribe: () => {} } } };

    return () => subscription.unsubscribe();
  }, []);

  // Fetch User Profile and automatically assign office/dashboard unit
  const fetchUserProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setProfile(data);
        const matchingOffice = OFFICES.find(o => o.code === data.office_code);
        if (matchingOffice) setCurrentAccount(matchingOffice);
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchOfficeDocuments();
    }
  }, [currentAccount, session]);

  // Auth Functions: Login & Logout
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setAuthLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    if (error) {
      setLoginError(error.message);
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Generate Tracking Number SDOB-YYYY-XXXX
  const generateTrackingNumber = () => {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `SDOB-${year}-${random}`;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const trackingNo = generateTrackingNumber();

    const newDoc = {
      tracking_number: trackingNo,
      title: formData.title,
      doc_type: formData.doc_type,
      origin_office_code: currentAccount.code,
      current_office_code: formData.destination_office_code,
      destination_office_code: formData.destination_office_code,
      priority: formData.priority,
      status: 'SUBMITTED',
      requires_signature: formData.requires_signature,
      is_signed: false
    };

    if (supabase) {
      const { data, error } = await supabase.from('documents').insert([newDoc]).select();
      if (!error && data) {
        await supabase.from('document_logs').insert([{
          document_id: data[0].id,
          office_code: currentAccount.code,
          action: 'SUBMITTED',
          remarks: `Document submitted by ${currentAccount.name}`,
          actor_name: currentAccount.name
        }]);
      }
    }

    alert(`Document Submitted Successfully! Tracking No: ${trackingNo}`);
    setSearchTrackingNo(trackingNo);
    setActiveTab('track');
    handleSearchDocument(trackingNo);
  };

  const handleSearchDocument = async (queryNo) => {
    const query = queryNo || searchTrackingNo;
    if (!query) return;

    if (supabase) {
      const { data: docData } = await supabase.from('documents').select('*').eq('tracking_number', query).single();
      if (docData) {
        const { data: logsData } = await supabase.from('document_logs').select('*').eq('document_id', docData.id).order('timestamp', { ascending: true });
        setTrackedDocument({ ...docData, logs: logsData || [] });
        return;
      }
    }

    // Fallback Simulation Data if Supabase is offline
    setTrackedDocument({
      tracking_number: query,
      title: 'Sample Request for ARAL Program Materials',
      doc_type: 'Project Proposal',
      origin_office_code: 'SCH-BINAN-ES',
      current_office_code: 'SDO-CID',
      priority: 'Urgent',
      status: 'IN_REVIEW',
      requires_signature: true,
      is_signed: false,
      logs: [
        { action: 'SUBMITTED', office_code: 'SCH-BINAN-ES', timestamp: new Date(Date.now() - 36000000).toISOString(), remarks: 'Submitted to SDO CID' },
        { action: 'RECEIVED', office_code: 'SDO-CID', timestamp: new Date(Date.now() - 18000000).toISOString(), remarks: 'Received by CID Receiving Section' }
      ]
    });
  };

  const fetchOfficeDocuments = async () => {
    if (supabase) {
      const { data } = await supabase.from('documents').select('*').or(`current_office_code.eq.${currentAccount.code},origin_office_code.eq.${currentAccount.code}`);
      if (data) setOfficeDocuments(data);
    }
  };

  // E-Signature Drawing Pad Controls
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    const signatureData = canvas.toDataURL();

    if (selectedDocForModal && supabase) {
      await supabase.from('documents').update({
        is_signed: true,
        signature_data: signatureData,
        status: 'SIGNED'
      }).eq('id', selectedDocForModal.id);

      await supabase.from('document_logs').insert([{
        document_id: selectedDocForModal.id,
        office_code: currentAccount.code,
        action: 'SIGNED',
        remarks: `E-Signature attached by ${currentAccount.name}`,
        actor_name: currentAccount.name
      }]);
    }

    alert('E-Signature Applied Successfully!');
    setIsSignModalOpen(false);
    fetchOfficeDocuments();
  };

  // Render Loading Screen while validating auth state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <RefreshCw className="w-8 h-8 animate-spin text-yellow-400 mb-3" />
        <p className="text-sm font-medium text-slate-300">Loading DepEd SDO Biñan DTS Portal...</p>
      </div>
    );
  }

  // RENDER LOGIN SCREEN IF USER IS NOT LOGGED IN
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex bg-yellow-400 text-blue-900 font-bold px-4 py-2 rounded-xl text-2xl shadow-sm mb-1">
              SDO Biñan
            </div>
            <h1 className="text-xl font-bold text-slate-800">Document Tracking & E-Signature</h1>
            <p className="text-xs text-slate-500">Sign in with your DepEd Office Credentials</p>
          </div>

          {loginError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Office Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input 
                  type="email" 
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="office@deped.gov.ph"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input 
                  type="password" 
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="w-full bg-blue-900 hover:bg-blue-800 text-white font-semibold py-2.5 rounded-lg text-sm transition shadow flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" /> Sign In to Dashboard
            </button>
          </form>

          <div className="text-center border-t border-slate-100 pt-4">
            <p className="text-[11px] text-slate-400">Department of Education • Region IV-A CALABARZON</p>
          </div>
        </div>
      </div>
    );
  }

  // RENDER MAIN APPLICATION DASHBOARD WHEN AUTHENTICATED
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Top Header */}
      <header className="bg-blue-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-400 text-blue-900 font-bold p-2.5 rounded-lg text-xl shadow">SDO</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">DepEd SDO Biñan City</h1>
              <p className="text-xs text-blue-200">Online Document Tracking & E-Signature System</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Office Identity Badge */}
            <div className="flex items-center gap-2 bg-blue-800/80 px-3 py-1.5 rounded-lg border border-blue-700">
              <Building2 className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-blue-200">Logged in as:</span>
              <select 
                value={currentAccount.code}
                onChange={(e) => setCurrentAccount(OFFICES.find(o => o.code === e.target.value))}
                className="bg-transparent text-white text-xs font-semibold focus:outline-none cursor-pointer"
              >
                {OFFICES.map(off => (
                  <option key={off.code} value={off.code} className="text-slate-900">{off.name}</option>
                ))}
              </select>
            </div>

            {/* Logout Button */}
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1.5 bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition border border-red-500 shadow-sm"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Navigation Tabs */}
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 flex gap-2">
          <button 
            onClick={() => setActiveTab('track')}
            className={`flex items-center gap-2 py-3 px-4 font-medium text-sm border-b-2 transition ${activeTab === 'track' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <Search className="w-4 h-4" /> Track Document
          </button>
          <button 
            onClick={() => setActiveTab('submit')}
            className={`flex items-center gap-2 py-3 px-4 font-medium text-sm border-b-2 transition ${activeTab === 'submit' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <Send className="w-4 h-4" /> Submit Document
          </button>
          <button 
            onClick={() => setActiveTab('inbox')}
            className={`flex items-center gap-2 py-3 px-4 font-medium text-sm border-b-2 transition ${activeTab === 'inbox' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <FileText className="w-4 h-4" /> Office Action Hub
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* TAB 1: SHOPEE-STYLE TRACKING SYSTEM */}
        {activeTab === 'track' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-2xl mx-auto">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2 text-slate-800">
                <Search className="w-5 h-5 text-blue-600" /> Enter Document Tracking Number
              </h2>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="e.g. SDOB-2026-8821" 
                  value={searchTrackingNo}
                  onChange={(e) => setSearchTrackingNo(e.target.value)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button 
                  onClick={() => handleSearchDocument()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium shadow transition flex items-center gap-2"
                >
                  Track Document
                </button>
              </div>
            </div>

            {trackedDocument && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="flex flex-col md:flex-row justify-between border-b pb-4 gap-4">
                  <div>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wide">
                      {trackedDocument.priority} Priority
                    </span>
                    <h3 className="text-xl font-bold text-slate-800 mt-2">{trackedDocument.title}</h3>
                    <p className="text-xs text-slate-500 mt-1">Tracking Code: <span className="font-mono font-bold text-slate-700">{trackedDocument.tracking_number}</span></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => { setSelectedDocForModal(trackedDocument); setIsPrintModalOpen(true); }}
                      className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium text-sm transition"
                    >
                      <Printer className="w-4 h-4" /> Print Route Slip
                    </button>
                  </div>
                </div>

                {/* Visual Shopee-Style Milestone Tracker */}
                <div className="py-6">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Document Progress Timeline</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 relative">
                    {['SUBMITTED', 'RECEIVED', 'IN_REVIEW', 'SIGNED', 'RELEASED'].map((step, idx) => {
                      const isCompleted = trackedDocument.status === step || idx < ['SUBMITTED', 'RECEIVED', 'IN_REVIEW', 'SIGNED', 'RELEASED'].indexOf(trackedDocument.status);
                      return (
                        <div key={step} className="flex flex-col items-center text-center z-10">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow ${isCompleted ? 'bg-emerald-500 text-white ring-4 ring-emerald-100' : 'bg-slate-200 text-slate-500'}`}>
                            {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                          </div>
                          <p className={`text-xs font-semibold mt-2 ${isCompleted ? 'text-slate-800' : 'text-slate-400'}`}>{step.replace('_', ' ')}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Audit Logs */}
                <div className="border-t pt-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Activity Logs</h4>
                  <div className="space-y-3">
                    {trackedDocument.logs?.map((log, i) => (
                      <div key={i} className="flex gap-3 text-xs border-l-2 border-blue-500 pl-3 py-1">
                        <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                        <div>
                          <p className="font-semibold text-slate-700">{log.action} - <span className="text-blue-600">{log.office_code}</span></p>
                          <p className="text-slate-500">{log.remarks}</p>
                          <span className="text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SUBMIT DOCUMENT */}
        {activeTab === 'submit' && (
          <div className="max-w-2xl mx-auto bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold mb-4 text-slate-800 flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-600" /> Submit New Document
            </h2>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Document Title</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Request for Supplemental Budget" 
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Document Type</label>
                  <select 
                    value={formData.doc_type}
                    onChange={(e) => setFormData({...formData, doc_type: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="Travel Order">Travel Order</option>
                    <option value="Project Proposal">Project Proposal</option>
                    <option value="Purchase Request">Purchase Request</option>
                    <option value="Leave Application">Leave Application</option>
                    <option value="Official Endorsement">Official Endorsement</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Destination SDO Office</label>
                  <select 
                    value={formData.destination_office_code}
                    onChange={(e) => setFormData({...formData, destination_office_code: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {OFFICES.filter(o => o.category === 'SDO_OFFICE').map(off => (
                      <option key={off.code} value={off.code}>{off.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="reqSig" 
                  checked={formData.requires_signature}
                  onChange={(e) => setFormData({...formData, requires_signature: e.target.checked})}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="reqSig" className="text-xs font-semibold text-slate-700">Requires E-Signature / Initials</label>
              </div>

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium text-sm transition shadow">
                Submit & Generate Routing Slip
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: OFFICE ACTION HUB */}
        {activeTab === 'inbox' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Inbox & Outbox: {currentAccount.name}</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {officeDocuments.map((doc) => (
                <div key={doc.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{doc.tracking_number}</span>
                      <h3 className="font-bold text-slate-800 mt-1">{doc.title}</h3>
                      <p className="text-xs text-slate-500">{doc.doc_type}</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full font-bold">{doc.status}</span>
                  </div>

                  <div className="flex gap-2 pt-2 border-t">
                    {doc.requires_signature && !doc.is_signed && (
                      <button 
                        onClick={() => { setSelectedDocForModal(doc); setIsSignModalOpen(true); }}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1"
                      >
                        <PenTool className="w-3.5 h-3.5" /> Sign Document
                      </button>
                    )}
                    <button 
                      onClick={() => { setSelectedDocForModal(doc); setIsPrintModalOpen(true); }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* E-SIGNATURE DRAWING MODAL */}
      {isSignModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
              <PenTool className="w-5 h-5 text-emerald-600" /> Draw E-Signature / Initials
            </h3>
            <p className="text-xs text-slate-500">Sign inside the box below to attach your electronic seal.</p>
            
            <canvas 
              ref={canvasRef}
              width={380}
              height={150}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              className="border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 cursor-crosshair w-full"
            />

            <div className="flex justify-between items-center">
              <button onClick={clearCanvas} className="text-xs text-red-600 font-semibold hover:underline">Clear Canvas</button>
              <div className="flex gap-2">
                <button onClick={() => setIsSignModalOpen(false)} className="px-3 py-1.5 text-xs text-slate-600 border rounded-lg">Cancel</button>
                <button onClick={saveSignature} className="px-4 py-1.5 text-xs bg-emerald-600 text-white rounded-lg font-semibold">Apply Signature</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE ROUTING SLIP MODAL */}
      {isPrintModalOpen && selectedDocForModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white p-8 rounded-xl max-w-2xl w-full space-y-6 printable-route-slip">
            <div className="text-center border-b-2 border-slate-800 pb-4">
              <h2 className="font-serif text-lg font-bold">DEPARTMENT OF EDUCATION</h2>
              <h3 className="font-serif text-md font-semibold text-slate-700">REGION IV-A CALABARZON</h3>
              <h4 className="font-serif text-sm font-bold text-blue-900">SCHOOLS DIVISION OFFICE OF BIÑAN CITY</h4>
              <p className="text-xs text-slate-500 mt-1">DOCUMENT ROUTING SLIP</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div><strong className="text-slate-600">Tracking No:</strong> <span className="font-mono font-bold text-slate-800">{selectedDocForModal.tracking_number}</span></div>
              <div><strong className="text-slate-600">Date Created:</strong> {new Date().toLocaleDateString()}</div>
              <div><strong className="text-slate-600">Document Title:</strong> {selectedDocForModal.title}</div>
              <div><strong className="text-slate-600">Priority Level:</strong> {selectedDocForModal.priority}</div>
            </div>

            <div className="border border-slate-300 rounded p-4 text-xs space-y-2">
              <p className="font-bold text-slate-700">Signatory & Approval Status:</p>
              {selectedDocForModal.is_signed ? (
                <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Electronically Signed by {currentAccount.name}
                </div>
              ) : (
                <p className="text-slate-400 italic">Pending Signature</p>
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t no-print">
              <button onClick={() => setIsPrintModalOpen(false)} className="px-4 py-2 text-xs border rounded-lg">Close</button>
              <button onClick={() => window.print()} className="px-4 py-2 text-xs bg-blue-600 text-white rounded-lg font-semibold flex items-center gap-1">
                <Printer className="w-4 h-4" /> Print Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}