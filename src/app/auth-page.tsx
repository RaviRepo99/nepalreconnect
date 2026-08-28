"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FaGoogle } from "react-icons/fa6";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const productionRedirect = "https://nepalreconnect.ccrcitclub.com";
const pendingEmailSignup = "pending-email-signup";
const emailVerificationInProgress = "email-verification-in-progress";
type AuthMode = "login" | "register";

export default function AuthPage({ mode }: { mode: AuthMode | "reset" }) {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode | "forgot" | "reset" | "verify">(mode);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationName, setVerificationName] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (!resendCooldown) return;
    const timer = window.setInterval(() => setResendCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function completeSession(sessionUser: User) {
    if (!supabase) return;
    if (window.localStorage.getItem(emailVerificationInProgress) === "true") return;
    if (window.localStorage.getItem(pendingEmailSignup) === "true") {
      const { error } = await supabase.from("profiles").upsert({ id: sessionUser.id, email: sessionUser.email || "", registered: true, full_name: sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || null }, { onConflict: "id" });
      window.localStorage.removeItem(pendingEmailSignup);
      await supabase.auth.signOut();
      if (error) { setNotice(`Could not finish account verification: ${error.message}`); return; }
      router.push("/login");
      return;
    }
    const googleMode = window.localStorage.getItem("google-auth-mode");
    if (googleMode === "register") {
      const { error } = await supabase.from("profiles").upsert({ id: sessionUser.id, email: sessionUser.email || "", registered: true, full_name: sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || null }, { onConflict: "id" });
      window.localStorage.removeItem("google-auth-mode");
      await supabase.auth.signOut();
      if (error) { setNotice(`Could not create your account: ${error.message}`); return; }
      setAuthMode("login");
      setNotice("Your account was created. Please sign in.");
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("registered").eq("id", sessionUser.id).maybeSingle();
    if (!profile?.registered) {
      await supabase.auth.signOut();
      window.localStorage.removeItem("google-auth-mode");
      setNotice("Your account is not created. Please create an account first.");
      return;
    }
    window.localStorage.removeItem("google-auth-mode");
    setNotice("Login successful. Welcome back.");
    window.setTimeout(() => router.push("/"), 700);
  }

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setAuthMode("reset");
        setRecoveryReady(true);
        setNotice("");
        return;
      }
      if (event === "SIGNED_IN" && session) void completeSession(session.user);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleGoogle() {
    if (!supabase) { setNotice("Supabase is not configured."); return; }
    window.localStorage.setItem("google-auth-mode", authMode === "register" ? "register" : "login");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.hostname === "localhost" ? `${window.location.origin}/login` : `${productionRedirect}/login` },
    });
    if (error) setNotice(`Google sign in failed: ${error.message}`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) { setNotice("Supabase is not configured."); return; }
    setLoading(true);
    setNotice("");
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    const fullName = String(formData.get("fullName") || "").trim();

    if (authMode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.hostname === "localhost" ? `${window.location.origin}/reset-password` : `${productionRedirect}/reset-password` });
      setLoading(false);
      if (error) { setNotice(`Could not send reset email: ${error.message}`); return; }
      setNotice("Password reset link sent. Check your email.");
      return;
    }

    if (authMode === "reset") {
      const confirmPassword = String(formData.get("confirmPassword") || "");
      if (password.length < 8 || password !== confirmPassword) { setLoading(false); setNotice("Use at least 8 characters and make sure both passwords match."); return; }
      const { error } = await supabase.auth.updateUser({ password });
      setLoading(false);
      if (error) { setNotice(`Could not update password: ${error.message}`); return; }
      await supabase.auth.signOut();
      setRecoveryReady(false);
      router.push("/login");
      return;
    }

    if (!email || !password) { setLoading(false); setNotice("Enter your email and password."); return; }
    if (authMode === "register") {
      if (password.length < 8) { setLoading(false); setNotice("Password must be at least 8 characters."); return; }
      if (password !== confirmPassword) { setLoading(false); setNotice("Passwords do not match."); return; }
      window.localStorage.setItem(pendingEmailSignup, "true");
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.hostname === "localhost" ? `${window.location.origin}/login` : `${productionRedirect}/login`,
        },
      });
      if (error) { window.localStorage.removeItem(pendingEmailSignup); setLoading(false); setNotice(error.message.toLowerCase().includes("already") ? "This email is already registered. Please sign in." : `Account creation failed: ${error.message}`); return; }
      if (!data.user) { window.localStorage.removeItem(pendingEmailSignup); setLoading(false); setNotice("Account creation did not complete. Please try again."); return; }
      if (!data.session) {
        setVerificationEmail(email);
        setVerificationName(fullName);
        setVerificationCode("");
        setAuthMode("verify");
        setLoading(false);
        setNotice("");
        return;
      }
      const { error: profileError } = await supabase.from("profiles").upsert({ id: data.user.id, email: data.user.email || email, registered: true, full_name: fullName || null }, { onConflict: "id" });
      window.localStorage.removeItem(pendingEmailSignup);
      if (profileError) { setLoading(false); setNotice(`Could not finish account creation: ${profileError.message}`); return; }
      await supabase.auth.signOut();
      router.push("/login");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setLoading(false); setNotice("Incorrect email or password. Check your details or create an account first."); return; }
    const { data: profile } = await supabase.from("profiles").select("registered").eq("id", data.user.id).maybeSingle();
    if (!profile?.registered) {
      await supabase.auth.signOut();
      setLoading(false);
      setNotice("This account is not verified or registered yet. Create an account first.");
      return;
    }
    setLoading(false);
    router.push("/");
  }

  async function verifySignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || verificationCode.length < 6) { setNotice("Enter the verification code from your email."); return; }
    setLoading(true);
    window.localStorage.setItem(emailVerificationInProgress, "true");
    const { data, error } = await supabase.auth.verifyOtp({ email: verificationEmail, token: verificationCode, type: "signup" });
    if (error || !data.user) { window.localStorage.removeItem(emailVerificationInProgress); setLoading(false); setNotice(error?.message || "Email verification failed. Please try again."); return; }
    const { error: profileError } = await supabase.from("profiles").upsert({ id: data.user.id, email: data.user.email || verificationEmail, registered: true, full_name: verificationName || null }, { onConflict: "id" });
    if (profileError) { window.localStorage.removeItem(emailVerificationInProgress); setLoading(false); setNotice(`Could not finish registration: ${profileError.message}`); return; }
    window.localStorage.removeItem(pendingEmailSignup);
    window.localStorage.removeItem(emailVerificationInProgress);
    await supabase.auth.signOut();
    router.push("/login");
    setVerificationCode("");
  }

  async function resendVerificationCode() {
    if (!supabase || !verificationEmail || resendCooldown > 0) return;
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: verificationEmail });
    setLoading(false);
    if (!error) setResendCooldown(60);
    setNotice(error ? `Could not resend verification email: ${error.message}` : "A new verification code was sent. Check your email and spam folder.");
  }

  const isRegister = authMode === "register";
  const isForgot = authMode === "forgot";
  const isReset = authMode === "reset";
  const isVerify = authMode === "verify";
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <button className="auth-brand" onClick={() => router.push("/")} aria-label="Nepal Reconnect home"><Image src="/media/nepalreconnect.png" alt="Nepal Reconnect" width={2200} height={700} priority /></button>
        <div className="auth-heading">
          <p className="eyebrow">{isRegister ? "Join the network" : isForgot || isReset ? "Account recovery" : isVerify ? "Email verification" : "Secure access"}</p>
          <h1>{isRegister ? "Create your account" : isForgot ? "Recover your account" : isReset ? "Set a new password" : isVerify ? "Check your email" : "Welcome back"}</h1>
          <p>{isRegister ? "Create a secure account to report and follow your cases." : isForgot ? "We will send a secure reset link to your email." : isReset ? "Choose a new password for your account." : isVerify ? `Enter the verification code sent to ${verificationEmail}.` : "Sign in to manage reports and help families reconnect."}</p>
        </div>
        {isVerify ? <form key={authMode} className="auth-form" onSubmit={verifySignup}><label>Verification code<input name="verificationCode" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" pattern="[0-9]{6,8}" maxLength={8} placeholder="000000" autoFocus required /></label>{notice && <p className="auth-page-notice" role="alert">{notice}</p>}<button className="primary-button full" type="submit" disabled={loading}>{loading ? "Please wait..." : "Verify email"}</button><button className="text-button center" type="button" onClick={() => void resendVerificationCode()} disabled={loading || resendCooldown > 0}>{resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend verification code"}</button></form> : <form key={authMode} className="auth-form" onSubmit={handleSubmit}>
          {isRegister && <label>Full name<input name="fullName" autoComplete="name" placeholder="Your full name" required /></label>}
          {!isReset && <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>}
          {!isForgot && <label>Password<input name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} minLength={isRegister || isReset ? 8 : undefined} placeholder="At least 8 characters" required /></label>}
          {isRegister && <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} placeholder="Repeat your password" required /></label>}
          {isReset && <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Repeat your new password" required /></label>}
          {notice && <p className="auth-page-notice" role="alert">{notice}</p>}
          <button className="primary-button full" type="submit" disabled={loading}>{loading ? "Please wait..." : isRegister ? "Create account" : isForgot ? "Send reset link" : isReset ? "Update password" : "Sign in"}</button>
        </form>}
        {!isForgot && !isReset && !isVerify && <button className="google-auth-button" type="button" onClick={() => void handleGoogle()}><FaGoogle aria-hidden="true" /> <span>Continue with Google</span></button>}
        <div className="auth-links">
          {authMode === "login" && <button className="text-button" onClick={() => { setAuthMode("forgot"); setNotice(""); }}>Forgot password?</button>}
          {(isForgot || isReset || isVerify) && <button className="text-button" onClick={() => { setAuthMode("login"); setNotice(""); }}>Back to sign in</button>}
          {!isForgot && !isReset && !isVerify && <button className="text-button" onClick={() => { setAuthMode(isRegister ? "login" : "register"); setNotice(""); }}>{isRegister ? "Already have an account? Sign in" : "Create a new account"}</button>}
        </div>
        <button className="auth-home-link" type="button" onClick={() => router.push("/")}><span aria-hidden="true">←</span> Back to home</button>
        {recoveryReady && <small className="muted">Your secure recovery session is ready.</small>}
      </section>
    </main>
  );
}
