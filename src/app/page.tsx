"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { reportPhotoBucket, supabase, supabaseConfigError } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type Report = {
  id: string; kind: "Missing" | "Found"; name: string; age: string; gender: string;
  district: string; province: string; location: string; date: string;
  status: "Active" | "Under review" | "Reconnected"; description: string; photo: string; owner?: string;
  verification: "Approved" | "Pending" | "Rejected"; reporter?: string; phone?: string; email?: string;
};

const demoReports: Report[] = [
  { id: "NR-26-00481", kind: "Missing", name: "Suman Tamang", age: "17", gender: "Male", district: "Kathmandu", province: "Bagmati", location: "Balaju, Kathmandu", date: "18 Aug 2026", status: "Active", description: "Wearing a navy jacket and grey trousers. Small scar above the left eyebrow.", photo: "ST", verification: "Approved" },
  { id: "NR-26-00466", kind: "Missing", name: "Anita Gurung", age: "29", gender: "Female", district: "Kaski", province: "Gandaki", location: "Lakeside, Pokhara", date: "15 Aug 2026", status: "Under review", description: "Last seen near Lakeside bus stop with a red backpack.", photo: "AG", verification: "Approved" },
  { id: "NR-26-00432", kind: "Found", name: "Raju Shrestha", age: "Approx. 45", gender: "Male", district: "Morang", province: "Koshi", location: "Biratnagar, Morang", date: "12 Aug 2026", status: "Active", description: "Found safe near the main market. Speaks Nepali and Maithili.", photo: "RS", verification: "Approved" },
  { id: "NR-26-00398", kind: "Found", name: "Maya Rai", age: "Approx. 63", gender: "Female", district: "Sunsari", province: "Koshi", location: "Dharan, Sunsari", date: "09 Aug 2026", status: "Reconnected", description: "Found and reunited with family after verification.", photo: "MR", verification: "Approved" },
];
const provinces = ["All provinces", "Koshi", "Madhesh", "Bagmati", "Gandaki", "Lumbini", "Karnali", "Sudurpashchim"];
const productionAuthRedirect = "https://nepalreconnect.ccrcitclub.com";

function uniqueReports(reports: Report[]): Report[] {
  return [...new Map(reports.map((report) => [report.id, report])).values()].map((report) => (
    report.status === "Reconnected" ? { ...report, kind: "Found" } : report
  )) as Report[];
}

function displayKind(report: Report) {
  return report.status === "Reconnected" ? "Found" : report.kind;
}

export default function Home() {
  const [reports, setReports] = useState<Report[]>([]);
  const [view, setView] = useState<"home" | "reports" | "found" | "dashboard" | "admin">("home");
  const [kind, setKind] = useState<"Missing" | "Found">("Missing");
  const [search, setSearch] = useState(""); const [province, setProvince] = useState("All provinces");
  const [showForm, setShowForm] = useState(false); const [showAuth, setShowAuth] = useState(false); const [editingReport, setEditingReport] = useState<Report | null>(null); const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationName, setVerificationName] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register" | "admin">("login");
  const [user, setUser] = useState<string | null>(null); const [userRole, setUserRole] = useState<"user" | "admin">("user"); const [notice, setNotice] = useState("");
  const userReports = reports.filter((report) => report.owner === user);
  const submittedReports = reports.filter((report) => report.owner);
  const activeReportCount = submittedReports.filter((report) => report.status !== "Reconnected").length;
  const reconnectedReportCount = submittedReports.filter((report) => report.status === "Reconnected").length;
  const publicMissingReports = reports.filter((report) => report.kind === "Missing" && (!report.owner || report.verification === "Approved"));

  useEffect(() => {
    const handleOpenReport = (event: Event) => setSelectedReport((event as CustomEvent<Report>).detail);
    window.addEventListener("open-report", handleOpenReport);
    return () => window.removeEventListener("open-report", handleOpenReport);
  }, []);

  useEffect(() => {
    const menuButton = document.querySelector<HTMLButtonElement>(".menu-button");
    if (!menuButton) return;
    const toggleMenu = () => setMenuOpen((open) => !open);
    menuButton.addEventListener("click", toggleMenu);
    return () => menuButton.removeEventListener("click", toggleMenu);
  }, []);

  useEffect(() => {
    document.querySelector(".topbar")?.classList.toggle("menu-open", menuOpen);
  }, [menuOpen]);

  async function handleGoogleAuth() {
    if (!supabase) { setNotice("Supabase is not configured."); return; }
    window.localStorage.setItem("google-auth-mode", authMode);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.hostname === "localhost"
          ? window.location.origin
          : productionAuthRedirect,
      },
    });
    if (error) setNotice(`Google sign in failed: ${error.message}`);
  }

  async function handleEmailAuth() {
    if (!supabase) { setNotice("Supabase is not configured."); return; }
    const email = document.querySelector<HTMLInputElement>(".auth-modal input[type=email]")?.value.trim() || "";
    const password = document.querySelector<HTMLInputElement>(".auth-modal input[type=password]")?.value || "";
    const fullName = document.querySelector<HTMLInputElement>(".auth-modal input[type=text]")?.value.trim() || "";
    if (!email || !password) { setNotice("Enter your email and password."); return; }
    if (authMode === "register") {
      window.localStorage.removeItem("google-auth-mode");
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
      if (error) {
        setNotice(error.message.toLowerCase().includes("already") || error.message.toLowerCase().includes("registered")
          ? "Your account already exists. Please sign in."
          : `Account creation failed: ${error.message}`);
        return;
      }
      if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
        setNotice("Your account already exists. Please sign in.");
        setAuthMode("login");
        return;
      }
      let registeredUser = data.user;
      if (!data.session) {
        setVerificationEmail(email);
        setVerificationName(fullName);
        setVerificationCode("");
        setShowVerification(true);
        setShowAuth(false);
        setNotice("Verification code sent. Check your email.");
        return;
      }
      if (registeredUser) await supabase.from("profiles").update({ registered: true, full_name: fullName || null }).eq("id", registeredUser.id);
      setUser(email); setShowAuth(false); setNotice("Account created and email verified."); return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setNotice("Your account is not registered or the password is incorrect. Create an account first."); return; }
    const { data: profile } = await supabase.from("profiles").select("registered").eq("id", data.user.id).maybeSingle();
    if (!profile) { const { error: profileError } = await supabase.from("profiles").upsert({ id: data.user.id, email, registered: true }, { onConflict: "id" }); if (profileError) { await supabase.auth.signOut(); setNotice("Your account is not registered. Create an account first."); return; } }
    else if (!profile.registered) { await supabase.auth.signOut(); setNotice("Your account is not registered. Create an account first."); return; }
    setUser(email); setShowAuth(false); setNotice("Welcome back.");
  }

  async function verifyEmailCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || verificationCode.trim().length !== 8) { setNotice("Enter the 8-digit verification code from your email."); return; }
    const { data, error } = await supabase.auth.verifyOtp({ email: verificationEmail, token: verificationCode.trim(), type: "signup" });
    if (error) { setNotice(`Email verification failed: ${error.message}`); return; }
    if (data.user) await supabase.from("profiles").update({ registered: true, full_name: verificationName || null }).eq("id", data.user.id);
    setUser(data.user?.email || verificationEmail);
    setShowVerification(false);
    setNotice("Account created and email verified.");
  }

  useEffect(() => {
    const logoutButton = document.querySelector<HTMLButtonElement>(".account .outline-button");
    if (!logoutButton || !user) return;
    const logout = () => {
      window.localStorage.removeItem("google-auth-mode");
      if (supabase) void supabase.auth.signOut();
      setUser(null);
      setUserRole("user");
      setView("home");
      setNotice("You have been logged out.");
    };
    logoutButton.addEventListener("click", logout, true);
    return () => logoutButton.removeEventListener("click", logout, true);
  }, [user]);

  async function finishGoogleAuth(sessionUser: User) {
    if (!supabase) return;
    const mode = window.localStorage.getItem("google-auth-mode");
    const { data: profile } = await supabase.from("profiles").select("registered").eq("id", sessionUser.id).maybeSingle();
    if (mode === "login" && !profile?.registered) {
      await supabase.auth.signOut();
      setUser(null);
      setNotice("Your account is not registered. Create an account first.");
      return;
    }
    if (mode === "register") {
      await supabase.from("profiles").update({ registered: true }).eq("id", sessionUser.id);
    }
    window.localStorage.removeItem("google-auth-mode");
    setUser(sessionUser.email || sessionUser.user_metadata?.full_name || "Google user");
    setShowAuth(false);
  }

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user;
      if (sessionUser) void finishGoogleAuth(sessionUser);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user;
      if (sessionUser) void finishGoogleAuth(sessionUser);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authMode === "admin") return;
    const authButton = document.querySelector<HTMLButtonElement>(".auth-modal .primary-button");
    if (!authButton) return;
    const googleButton = document.createElement("button");
    googleButton.type = "button";
    googleButton.className = "google-auth-button";
    const googleIcon = document.createElement("span");
    googleIcon.className = "google-icon";
    googleIcon.textContent = "G";
    googleButton.append(googleIcon, "Continue with Google");
    const googleClick = () => void handleGoogleAuth();
    googleButton.addEventListener("click", googleClick);
    authButton.before(googleButton);
    return () => { googleButton.removeEventListener("click", googleClick); googleButton.remove(); };
  }, [authMode, showAuth]);

  useEffect(() => {
    if (authMode === "admin") return;
    const authButton = document.querySelector<HTMLButtonElement>(".auth-modal .primary-button");
    if (!authButton) return;
    const submitEmailAuth = (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); void handleEmailAuth(); };
    authButton.addEventListener("click", submitEmailAuth, true);
    return () => authButton.removeEventListener("click", submitEmailAuth, true);
  }, [authMode, showAuth]);

  useEffect(() => {
    const saved = window.localStorage.getItem("nepal-reconnect-reports");
    if (supabase) return;
    if (!saved) { setReportsLoading(false); return; }
    const savedReports = JSON.parse(saved).map((report: Report) => ({ ...report, verification: report.verification || (report.owner ? "Pending" : "Approved") }));
    setReports(uniqueReports([...savedReports, ...demoReports]));
    setReportsLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) { setReportsLoading(false); return; }
    const client = supabase;
    let mounted = true;
    async function loadReports() {
      const { data, error } = await client.from("reports").select("*").order("created_at", { ascending: false });
      if (!mounted) return;
      if (error || !data) { setReportsLoading(false); return; }
      setReports(uniqueReports(data.map((report) => ({ ...report, date: report.report_date, photo: report.photo || report.name.slice(0, 2).toUpperCase() })) as Report[]));
      setReportsLoading(false);
    }
    void loadReports();
    return () => { mounted = false; };
  }, []);

  const visibleReports = useMemo(() => reports.filter((report) => {
    if (reportsLoading) return false;
    const matchesKind = view === "reports"
      ? kind === "Missing"
        ? report.kind === "Missing" && report.status !== "Reconnected"
        : report.status === "Reconnected"
      : view === "found"
        ? report.status === "Reconnected"
        : true;
    const haystack = `${report.name} ${report.district} ${report.location} ${report.id}`.toLowerCase();
    const isPublic = !report.owner || report.verification === "Approved";
    return isPublic && matchesKind && (province === "All provinces" || report.province === province) && haystack.includes(search.toLowerCase());
  }), [reports, reportsLoading, view, kind, province, search]);
  function openAuth(mode: "login" | "register" | "admin" = "login") { setAuthMode(mode); setShowAuth(true); setNotice(""); }
  function startReport(nextKind: "Missing" | "Found") { if (!user) { openAuth(); return; } setKind(nextKind); setShowForm(true); }
  function saveReports(next: Report[]) { setReports(next); window.localStorage.setItem("nepal-reconnect-reports", JSON.stringify(next)); }
  async function deleteReport(id: string) { if (supabase) await supabase.from("reports").delete().eq("id", id); saveReports(reports.filter((report) => report.id !== id)); setNotice("Report deleted."); }
  async function markReconnected(id: string) { if (supabase) { const result = await supabase.from("reports").update({ status: "Reconnected", kind: "Found" }).eq("id", id); if (result.error) { setNotice(`Could not mark report as found: ${result.error.message}`); return; } } saveReports(reports.map((report) => report.id === id ? { ...report, status: "Reconnected", kind: "Found" } : report)); setNotice("Report marked as found and moved to Found reports."); }
  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    if (supabaseConfigError) { setNotice(`${supabaseConfigError} Update .env.local and restart the dev server.`); return; }
    const reportData = { kind, name: String(data.get("name")), age: String(data.get("age")), gender: String(data.get("gender")), district: String(data.get("district")), province: String(data.get("province")), location: String(data.get("location")), date: String(data.get("date")), status: "Active" as const, description: String(data.get("description")), photo: String(data.get("name")).slice(0, 2).toUpperCase(), owner: user || undefined, verification: "Approved" as const, reporter: String(data.get("reporter")), phone: String(data.get("phone")), email: String(data.get("email")) };
    const newReport: Report = editingReport ? { ...editingReport, ...reportData } : { id: `NR-26-${Math.floor(10000 + Math.random() * 89999)}`, ...reportData };
    if (supabase) {
      const photoFile = event.currentTarget.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0] || null;
      let photoUrl: string | null = null;
      if (!photoFile && !newReport.photo.startsWith("http")) { setNotice("Please upload a photo before saving this report."); return; }
      if (photoFile instanceof File && photoFile.size > 0) {
        const filePath = `${user || "guest"}/${newReport.id}-${photoFile.name}`;
        const upload = await supabase.storage.from(reportPhotoBucket).upload(filePath, photoFile, { upsert: true, contentType: photoFile.type });
        if (upload.error) { setNotice(`Could not upload photo: ${upload.error.message}`); return; }
        photoUrl = supabase.storage.from(reportPhotoBucket).getPublicUrl(filePath).data.publicUrl;
      }
      const payload = { id: newReport.id, kind: newReport.kind, name: newReport.name, age: newReport.age, gender: newReport.gender, district: newReport.district, province: newReport.province, location: newReport.location, report_date: newReport.date, status: newReport.status, verification: newReport.verification, description: newReport.description, reporter: newReport.reporter || "", phone: newReport.phone || "", email: newReport.email || "", photo: photoUrl || newReport.photo, owner: user || "guest" };
      const result = editingReport ? await supabase.from("reports").update(payload).eq("id", newReport.id) : await supabase.from("reports").insert(payload);
      if (result.error) { setNotice(`Could not save to Supabase: ${result.error.message}`); return; }
    }
    const next = [newReport, ...reports.filter((report) => !demoReports.includes(report) && report.id !== newReport.id)]; setReports(next); window.localStorage.setItem("nepal-reconnect-reports", JSON.stringify(next)); setShowForm(false); setNotice(editingReport ? `Report ${newReport.id} updated.` : `Report submitted. Your Report ID is ${newReport.id}`); setView("dashboard");
    setEditingReport(null);
  }

  if (showVerification) return <main className="site-shell verification-page"><section className="verification-card"><span className="brand-mark large">NR</span><p className="eyebrow">Verify your email</p><h1>Check your inbox</h1><p>We sent an 8-digit verification code to <strong>{verificationEmail}</strong>.</p><p className="verification-hint">Can&apos;t find it? Please check your spam or junk folder.</p><form onSubmit={verifyEmailCode}><label>8-digit verification code<input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" pattern="[0-9]{8}" maxLength={8} autoFocus required /></label><button className="primary-button full" type="submit">Verify email</button></form><button className="text-button center" onClick={() => { window.localStorage.removeItem("google-auth-mode"); setShowVerification(false); setAuthMode("register"); setShowAuth(true); }}>Back to account</button></section></main>;
  return <main className="site-shell">
    <header className="topbar"><button className="brand" onClick={() => setView("home")} aria-label="Nepal Reconnect home"><Image className="brand-logo" src="/media/nepalreconnect.png" alt="Nepal Reconnect" width={2200} height={700} priority /></button><nav><button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>Home</button><button className={view === "reports" ? "active" : ""} onClick={() => setView("reports")}>Public reports</button><button onClick={() => user ? setView(userRole === "admin" ? "admin" : "dashboard") : openAuth()}>My dashboard</button></nav><div className="account">{user ? <button className="outline-button" onClick={() => { setUser(null); setUserRole("user"); setNotice("You have been logged out."); }}>Log out</button> : <button className="outline-button" onClick={() => openAuth()}>Sign in</button>}<button className="menu-button">☰</button></div></header>
    {notice && !showAuth && !showVerification && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
    {showAuth && notice && <div className="auth-notice" role="status">{notice}</div>}
    {view === "home" && <><section className="hero"><div className="hero-copy"><p className="eyebrow">A public service for Nepal</p><h1>Let&apos;s reconnect<br /><em>missing loved ones.</em></h1><p className="hero-lede">A trusted place to report, search and safely reconnect families across Nepal.</p><div className="hero-actions"><button className="primary-button" onClick={() => startReport("Missing")}><span>+</span> Report missing</button><button className="found-button" onClick={() => startReport("Found")}><span>✓</span> Report found</button></div><div className="hero-note"><span className="shield">✓</span><span>Reports are reviewed by our verification team.<br /><b>Your contact details stay private.</b></span></div></div><div className="hero-art"><Image className="hero-cover" src="/media/banner2.png" alt="Nepal Reconnect cover banner" width={1664} height={941} priority /></div></section><section className="search-panel"><div><p className="eyebrow">Find a report</p><h2>Search the national register</h2></div><div className="search-controls"><label className="search-input"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, district, location or Report ID" /></label><button className="primary-button small" onClick={() => setView("reports")}>Search reports</button></div></section><section className="info-band"><div><span className="stat-number">{activeReportCount.toLocaleString()}</span><span className="stat-label">active reports</span></div><div><span className="stat-number">{reconnectedReportCount.toLocaleString()}</span><span className="stat-label">reconnected this year</span></div><p>For urgent danger or immediate help, call Nepal Police <b>100</b></p></section><section className="home-reports"><div className="section-heading"><div><p className="eyebrow">Latest missing reports</p><h2>People who need to be found</h2></div><button className="text-button" onClick={() => { setKind("Missing"); setView("reports"); }}>View all missing reports →</button></div><div className="report-grid">{publicMissingReports.slice(0, 3).map((report) => <ReportCard key={report.id} report={report} />)}</div></section></>}
    {view === "reports" && <section className="reports-page"><div className="page-heading"><div><p className="eyebrow">Public register</p><h1>Reports across Nepal</h1><p>Search the latest missing and found person reports. Verified details are shared with care.</p></div><button className="primary-button" onClick={() => startReport(kind)}>+ Report {kind.toLowerCase()}</button></div><div className="filter-bar"><div className="segmented"><button className={kind === "Missing" ? "selected missing" : ""} onClick={() => setKind("Missing")}>Missing people</button><button className={kind === "Found" ? "selected found" : ""} onClick={() => setKind("Found")}>Found people</button></div><label className="search-input compact"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or Report ID" /></label><select value={province} onChange={(event) => setProvince(event.target.value)}>{provinces.map((item) => <option key={item}>{item}</option>)}</select></div><p className="result-count">Showing <b>{visibleReports.length}</b> {kind.toLowerCase()} reports</p><div className="report-grid">{visibleReports.map((report) => <ReportCard key={report.id} report={report} />)}{!visibleReports.length && <div className="empty">No reports match your search.</div>}</div></section>}
    {view === "dashboard" && <section className="dashboard"><div className="page-heading"><div><p className="eyebrow">Your secure space</p><h1>Welcome back, {user || "there"}</h1><p>Manage the reports you have submitted and follow each verification step.</p></div><button className="primary-button" onClick={() => startReport("Missing")}>+ New report</button></div><div className="dashboard-stats"><div><b>{userReports.length}</b><span>Your reports</span></div><div><b>{userReports.filter((item) => item.status === "Under review").length}</b><span>Under review</span></div><div><b>{userReports.filter((item) => item.status === "Reconnected").length}</b><span>Reconnected</span></div></div><div className="dashboard-table"><div className="table-head"><span>Report</span><span>Type</span><span>Submitted</span><span>Status</span><span /></div>{userReports.map((report) => <div className="table-row" key={report.id}><div><strong>{report.name}</strong><small>{report.id}</small></div><span>{report.kind}</span><span>{report.date}</span><span className="status">{report.status}</span><div className="row-actions"><button onClick={() => { setEditingReport(report); setKind(report.kind); setShowForm(true); }}>Edit</button>{report.status !== "Reconnected" && <button onClick={() => markReconnected(report.id)}>Mark found</button>}<button onClick={() => deleteReport(report.id)}>Delete</button></div></div>)}{!userReports.length && <div className="empty">Your submitted reports will appear here.</div>}</div></section>}
    <footer><div className="brand footer-brand"><Image className="brand-logo" src="/media/white.png" alt="Nepal Reconnect" width={2200} height={700} /></div><div className="footer-copy"><p>A safer way home for every family.</p><small>© 2026 Nepal Reconnect. All rights reserved.</small></div><div><a href="#privacy">Privacy policy</a><a href="#terms">Terms of use</a><a href="#abuse">Report abuse</a></div></footer>
    {selectedReport && <div className="modal-backdrop" onClick={() => setSelectedReport(null)}><article className="modal detail-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelectedReport(null)}>×</button><div className={`detail-photo person-photo ${selectedReport.kind.toLowerCase()}`}>{selectedReport.photo.startsWith("http") ? <Image src={selectedReport.photo} alt={selectedReport.name} fill sizes="(max-width: 700px) 100vw, 420px" /> : <span>{selectedReport.photo}</span>}<i>{selectedReport.kind}</i></div><div className="detail-body"><div className="report-top"><span className={`tag ${selectedReport.kind.toLowerCase()}`}>{selectedReport.kind}</span><span className="report-id">{selectedReport.id}</span></div><h2>{selectedReport.name}</h2><div className="detail-facts"><span><b>Age</b>{selectedReport.age}</span><span><b>Gender</b>{selectedReport.gender}</span><span><b>Date</b>{selectedReport.date}</span><span><b>Location</b>{selectedReport.location}</span></div><h3>Description</h3><p>{selectedReport.description}</p><h3>Contact details</h3><div className="detail-contact"><span><b>Reported by</b>{selectedReport.reporter || "Not provided"}</span><span><b>Phone</b>{selectedReport.phone || "Not provided"}</span><span><b>Email</b>{selectedReport.email || "Not provided"}</span></div><div className="detail-private">Please use these contact details responsibly and only for helping reconnect this person with their family.</div></div></article></div>}
    {showAuth && <div className="modal-backdrop" onClick={() => setShowAuth(false)}><div className="modal auth-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowAuth(false)}>×</button><span className="brand-mark large">NR</span><p className="eyebrow">{authMode === "admin" ? "Restricted access" : "Secure access"}</p><h2>{authMode === "login" ? "Sign in to report" : authMode === "admin" ? "Administrator sign in" : "Create your account"}</h2><p>{authMode === "login" ? "Log in to submit a report and keep your family’s information protected." : authMode === "admin" ? "This area is reserved for verified Nepal Reconnect administrators." : "Create a secure account to submit and track your reports."}</p>{authMode === "register" && <label>Full name<input type="text" placeholder="Your full name" /></label>}<label>Email address<input type="email" placeholder={authMode === "admin" ? "admin@nepalreconnect.org" : "you@example.com"} /></label><label>Password<input type="password" placeholder="••••••••" /></label><button className="primary-button full" onClick={() => { setUser(authMode === "admin" ? "Administrator" : "Demo user"); setUserRole(authMode === "admin" ? "admin" : "user"); setShowAuth(false); setNotice(authMode === "admin" ? "Administrator access granted." : authMode === "login" ? "Welcome to your secure dashboard." : "Your account has been created."); }}>{authMode === "login" ? "Sign in" : authMode === "admin" ? "Enter admin panel" : "Create account"}</button>{authMode === "admin" ? <button className="text-button center" onClick={() => setAuthMode("login")}>Return to user sign in</button> : authMode === "login" ? <><button className="text-button center" onClick={() => setAuthMode("register")}>Create an account</button><button className="admin-link" onClick={() => setAuthMode("admin")}>Administrator access</button></> : <button className="text-button center" onClick={() => setAuthMode("login")}>Already have an account? Sign in</button>}<small className="muted">{authMode === "login" ? "Forgot password? We can help you recover access." : authMode === "admin" ? "Admin credentials are required." : "We will verify your email before publishing reports."}</small></div></div>}
    {showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}><form className="modal report-modal" onSubmit={submitReport} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowForm(false)}>×</button><p className="eyebrow">{editingReport ? "Edit" : "New"} {kind.toLowerCase()} report</p><h2>Help bring someone home.</h2><p className="modal-intro">Only verified information is published. Your phone and email remain private.</p><div className="form-grid"><label>Name or approximate name<input name="name" required defaultValue={editingReport?.name} placeholder="Full name" /></label><label>Age<input name="age" required defaultValue={editingReport?.age} placeholder="Age" /></label><label>Gender<select name="gender" defaultValue={editingReport?.gender}><option>Male</option><option>Female</option><option>Other</option><option>Unknown</option></select></label><label>Province<select name="province" defaultValue={editingReport?.province}>{provinces.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label><label>District<input name="district" required defaultValue={editingReport?.district} placeholder="District" /></label><label>Last seen / found date<input name="date" required type="date" defaultValue={editingReport?.date} /></label><label className="wide">Location<input name="location" required defaultValue={editingReport?.location} placeholder="Municipality, ward or landmark" /></label><label className="wide">Photo upload<input type="file" accept="image/*" /></label><label className="wide">Description and identifying marks<textarea name="description" required defaultValue={editingReport?.description} placeholder="Clothing, marks, language, or other helpful details" /></label></div><div className="private-fields"><b>Reporter contact</b><label>Your name<input name="reporter" required defaultValue={editingReport?.reporter} placeholder="Your full name" /></label><label>Phone number<input name="phone" required defaultValue={editingReport?.phone} placeholder="98XXXXXXXX" /></label><label>Email address<input name="email" required defaultValue={editingReport?.email} type="email" placeholder="you@example.com" /></label></div><button className="primary-button full" type="submit">{editingReport ? "Save changes" : "Publish report"}</button></form></div>}
  </main>;
}

function ReportCard({ report }: { report: Report }) { return <article className="report-card"><div className={`person-photo ${report.kind.toLowerCase()}`}>{report.photo.startsWith("http") ? <Image src={report.photo} alt={report.name} fill sizes="(max-width: 700px) 100vw, 340px" /> : <span>{report.photo}</span>}<i>{report.kind}</i></div><div className="report-content"><div className="report-top"><span className={`tag ${report.kind.toLowerCase()}`}>{report.kind}</span><span className="report-id">{report.id}</span></div><h3>{report.name}</h3><p>{report.age} <span>•</span> {report.gender}</p><div className="location">⌖ {report.location}</div><div className="card-footer"><span>{report.date}</span><button onClick={() => window.dispatchEvent(new CustomEvent("open-report", { detail: report }))}>View details →</button></div></div></article>; }
