import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";

type Tab = "mkutano" | "partner";
type MkutanoMode = "signin" | "register" | "forgotpw";
type PartnerMode = "signin" | "forgotpw" | "request";

interface PublicConvening { id: string; name: string }

const INTERNAL_DOMAIN = "themkutano.com";

function Brand() {
  return (
    <div className="flex flex-col items-center gap-3">
      <img src="/mkutano-icon.png" alt="Mkutano" className="h-16 w-16 rounded-full object-cover shadow-sm" />
      <div className="text-center">
        <h1 className="text-[13px] font-black tracking-[0.18em] uppercase text-gray-900">Mkutano</h1>
        <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-gray-400 mt-0.5">
          Convening Management Portal
        </p>
      </div>
    </div>
  );
}

export default function Login() {
  const [tab, setTab] = useState<Tab>("mkutano");
  const [mkutanoMode, setMkutanoMode] = useState<MkutanoMode>("signin");
  const [partnerMode, setPartnerMode] = useState<PartnerMode>("signin");

  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((d) => { if (d.needsSetup) window.location.replace("/setup"); })
      .catch(() => {});
  }, []);

  const urlParams = new URLSearchParams(window.location.search);
  const urlError = urlParams.get("error");
  const urlNotice = urlParams.get("notice");
  const bannerMessage =
    urlError === "invalid_token" ? "That verification link is invalid or has already been used." :
    urlError === "expired_token" ? "That verification link has expired. Please register again." :
    urlNotice === "already_registered" ? "You already have an account — please sign in below." :
    null;
  const bannerIsError = !!urlError;

  // ── Sign-in state ──────────────────────────────────────────────────────────
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [siShowPw, setSiShowPw] = useState(false);
  const [siRemember, setSiRemember] = useState(false);
  const [siError, setSiError] = useState<string | null>(null);
  const [siLoading, setSiLoading] = useState(false);

  // ── Forgot password state ──────────────────────────────────────────────────
  const [fpEmail, setFpEmail] = useState("");
  const [fpLoading, setFpLoading] = useState(false);
  const [fpSuccess, setFpSuccess] = useState(false);
  const [fpError, setFpError] = useState<string | null>(null);

  // ── Register state ─────────────────────────────────────────────────────────
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regShowPw, setRegShowPw] = useState(false);
  const [regConfirm, setRegConfirm] = useState("");
  const [regShowConfirm, setRegShowConfirm] = useState(false);
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  // ── Request access state ───────────────────────────────────────────────────
  const [convenings, setConvenings] = useState<PublicConvening[]>([]);
  const [reqConveningId, setReqConveningId] = useState("");
  const [reqName, setReqName] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqOrg, setReqOrg] = useState("");
  const [reqMessage, setReqMessage] = useState("");
  const [reqErrors, setReqErrors] = useState<Record<string, string>>({});
  const [reqLoading, setReqLoading] = useState(false);
  const [reqSuccess, setReqSuccess] = useState(false);

  // ── Partner sign-in state ──────────────────────────────────────────────────
  const [ptEmail, setPtEmail] = useState("");
  const [ptPassword, setPtPassword] = useState("");
  const [ptShowPw, setPtShowPw] = useState(false);
  const [ptRemember, setPtRemember] = useState(false);
  const [ptError, setPtError] = useState<string | null>(null);
  const [ptLoading, setPtLoading] = useState(false);

  // ── Partner forgot password state ──────────────────────────────────────────
  const [ptFpEmail, setPtFpEmail] = useState("");
  const [ptFpLoading, setPtFpLoading] = useState(false);
  const [ptFpSuccess, setPtFpSuccess] = useState(false);
  const [ptFpError, setPtFpError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "partner") return;
    if (convenings.length > 0) return;
    fetch("/api/convenings/public")
      .then((r) => r.json())
      .then(setConvenings)
      .catch(() => {});
  }, [tab]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handlePartnerSignIn(e: React.FormEvent) {
    e.preventDefault();
    setPtError(null);
    setPtLoading(true);
    try {
      const res = await fetch("/api/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ptEmail, password: ptPassword, rememberMe: ptRemember }),
        credentials: "include",
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        setPtError(data.error ?? "Invalid email or password.");
      }
    } catch {
      setPtError("Network error. Please try again.");
    } finally {
      setPtLoading(false);
    }
  }

  async function handlePartnerForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setPtFpError(null);
    if (!ptFpEmail) { setPtFpError("Please enter your email address."); return; }
    setPtFpLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ptFpEmail }),
      });
      setPtFpSuccess(true);
    } catch {
      setPtFpError("Network error. Please try again.");
    } finally {
      setPtFpLoading(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSiError(null);
    setSiLoading(true);
    try {
      const res = await fetch("/api/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: siEmail, password: siPassword, rememberMe: siRemember }),
        credentials: "include",
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        setSiError(data.error ?? "Invalid email or password.");
      }
    } catch {
      setSiError("Network error. Please try again.");
    } finally {
      setSiLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setFpError(null);
    if (!fpEmail) { setFpError("Please enter your email address."); return; }
    setFpLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail }),
      });
      setFpSuccess(true);
    } catch {
      setFpError("Network error. Please try again.");
    } finally {
      setFpLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!regName.trim()) errs.name = "Full name is required.";
    if (!regEmail) errs.email = "Email is required.";
    else if (!regEmail.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`))
      errs.email = `Only @${INTERNAL_DOMAIN} addresses can self-register.`;
    if (!regPassword) errs.password = "Password is required.";
    else if (regPassword.length < 8) errs.password = "At least 8 characters.";
    if (regPassword !== regConfirm) errs.confirmPassword = "Passwords do not match.";
    if (Object.keys(errs).length) { setRegErrors(errs); return; }
    setRegErrors({});
    setRegLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
body: JSON.stringify({ name: regName.trim(), email: regEmail, password: regPassword, confirmPassword: regConfirm }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRegSuccess(true);
      } else if (res.status === 422 && data.errors) {
        const fieldErrors: Record<string, string> = {};
        for (const [f, msgs] of Object.entries(data.errors as Record<string, string[]>)) {
          fieldErrors[f] = Array.isArray(msgs) ? msgs[0] : String(msgs);
        }
        setRegErrors(fieldErrors);
      } else {
        setRegErrors({ _: data.error ?? "Something went wrong. Please try again." });
      }
    } catch {
      setRegErrors({ _: "Network error. Please try again." });
    } finally {
      setRegLoading(false);
    }
  }

  async function handleRequestAccess(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!reqConveningId) errs.conveningId = "Please select a project.";
    if (!reqName.trim()) errs.name = "Full name is required.";
    if (!reqEmail) errs.email = "Email is required.";
    if (Object.keys(errs).length) { setReqErrors(errs); return; }
    setReqErrors({});
    setReqLoading(true);
    const selectedConvening = convenings.find((c) => c.id === reqConveningId);
    try {
      const res = await fetch("/api/auth/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: reqName.trim(),
          email: reqEmail,
          organization: reqOrg || undefined,
          message: reqMessage || undefined,
          conveningId: reqConveningId,
          conveningName: selectedConvening?.name,
        }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReqSuccess(true);
      } else if (res.status === 422 && data.errors) {
        const fieldErrors: Record<string, string> = {};
        for (const [f, msgs] of Object.entries(data.errors as Record<string, string[]>)) {
          fieldErrors[f] = Array.isArray(msgs) ? msgs[0] : String(msgs);
        }
        setReqErrors(fieldErrors);
      } else {
        setReqErrors({ _: data.error ?? "Something went wrong. Please try again." });
      }
    } catch {
      setReqErrors({ _: "Network error. Please try again." });
    } finally {
      setReqLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 px-8 py-10 flex flex-col items-center gap-6">
        <Brand />

        {bannerMessage && (
          <div className={`w-full flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12px] ${bannerIsError ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>{bannerMessage}</span>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="w-full flex rounded-xl overflow-hidden border border-gray-200 text-[13px] font-semibold">
          <button
            onClick={() => { setTab("mkutano"); setMkutanoMode("signin"); }}
            className={`flex-1 py-2.5 transition-colors ${tab === "mkutano" ? "bg-gray-900 text-white" : "bg-white text-gray-400 hover:text-gray-700"}`}
          >
            Mkutano team
          </button>
          <button
            onClick={() => setTab("partner")}
            className={`flex-1 py-2.5 transition-colors border-l border-gray-200 ${tab === "partner" ? "bg-gray-900 text-white" : "bg-white text-gray-400 hover:text-gray-700"}`}
          >
            Partner
          </button>
        </div>

        {/* ── Mkutano: sign in ── */}
        {tab === "mkutano" && mkutanoMode === "signin" && (
          <>
            <form onSubmit={handleSignIn} className="w-full flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="si-email" className="text-xs font-medium text-gray-600">Email</Label>
                <Input id="si-email" type="email" placeholder="you@themkutano.com" value={siEmail}
                  onChange={(e) => setSiEmail(e.target.value)} required autoComplete="email" className="h-10 text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="si-password" className="text-xs font-medium text-gray-600">Password</Label>
                <div className="relative">
                  <Input id="si-password" type={siShowPw ? "text" : "password"} placeholder="••••••••" value={siPassword}
                    onChange={(e) => setSiPassword(e.target.value)} required autoComplete="current-password" className="h-10 text-sm pr-10" />
                  <button type="button" tabIndex={-1} onClick={() => setSiShowPw(!siShowPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {siShowPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={siRemember} onChange={(e) => setSiRemember(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 accent-gray-900" />
                <span className="text-[12px] text-gray-500">Remember me for 30 days</span>
              </label>
              {siError && <p className="text-xs text-red-500 text-center">{siError}</p>}
              <Button type="submit" size="lg" className="w-full font-medium" disabled={siLoading}>
                {siLoading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <div className="w-full border-t border-gray-100 pt-1 flex items-center justify-between">
              <button onClick={() => { setMkutanoMode("forgotpw"); setFpSuccess(false); setFpError(null); setFpEmail(""); }}
                className="text-[11px] text-gray-400 hover:text-gray-600 font-medium transition-colors">
                Forgot password?
              </button>
              <button onClick={() => setMkutanoMode("register")}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors">
                Create an account →
              </button>
            </div>
          </>
        )}

        {/* ── Mkutano: register ── */}
        {tab === "mkutano" && mkutanoMode === "register" && (
          <>
            {regSuccess ? (
              <div className="w-full text-center flex flex-col items-center gap-4 py-2">
                <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-gray-900">Check your inbox</p>
                  <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
                    Verification link sent to <strong>{regEmail}</strong>.<br />
                    Click it to activate your account. Expires in 24 hours.
                  </p>
                </div>
                <button onClick={() => { setMkutanoMode("signin"); setRegSuccess(false); }}
                  className="text-[11px] text-gray-400 underline underline-offset-2">
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <div className="w-full -mb-2">
                  <p className="text-[13px] font-semibold text-gray-900">Create your account</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    For staff with a <span className="font-medium">@{INTERNAL_DOMAIN}</span> email address.
                  </p>
                </div>
                <form onSubmit={handleRegister} className="w-full flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-name" className="text-xs font-medium text-gray-600">Full name</Label>
                    <Input id="reg-name" type="text" placeholder="Jane Doe" value={regName}
                      onChange={(e) => setRegName(e.target.value)} autoComplete="name" className="h-10 text-sm" />
                    {regErrors.name && <p className="text-xs text-red-500">{regErrors.name}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-email" className="text-xs font-medium text-gray-600">Work email</Label>
                    <Input id="reg-email" type="email" placeholder={`you@${INTERNAL_DOMAIN}`} value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)} autoComplete="email" className="h-10 text-sm" />
                    {regErrors.email && <p className="text-xs text-red-500">{regErrors.email}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-pw" className="text-xs font-medium text-gray-600">Password</Label>
                    <div className="relative">
                      <Input id="reg-pw" type={regShowPw ? "text" : "password"} placeholder="At least 8 characters" value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)} autoComplete="new-password" className="h-10 text-sm pr-10" />
                      <button type="button" tabIndex={-1} onClick={() => setRegShowPw(!regShowPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                        {regShowPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {regErrors.password && <p className="text-xs text-red-500">{regErrors.password}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reg-confirm" className="text-xs font-medium text-gray-600">Confirm password</Label>
                    <div className="relative">
                      <Input id="reg-confirm" type={regShowConfirm ? "text" : "password"} placeholder="Same password again" value={regConfirm}
                        onChange={(e) => setRegConfirm(e.target.value)} autoComplete="new-password" className="h-10 text-sm pr-10" />
                      <button type="button" tabIndex={-1} onClick={() => setRegShowConfirm(!regShowConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                        {regShowConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {regErrors.confirmPassword && <p className="text-xs text-red-500">{regErrors.confirmPassword}</p>}
                  </div>
                  {regErrors._ && <p className="text-xs text-red-500 text-center">{regErrors._}</p>}
                  <Button type="submit" size="lg" className="w-full font-medium" disabled={regLoading}>
                    {regLoading ? "Creating account…" : "Create account"}
                  </Button>
                </form>
                <div className="w-full border-t border-gray-100 pt-1 text-center">
                  <button onClick={() => setMkutanoMode("signin")}
                    className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                    Already have an account? Sign in →
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Mkutano: forgot password ── */}
        {tab === "mkutano" && mkutanoMode === "forgotpw" && (
          <>
            {fpSuccess ? (
              <div className="w-full text-center flex flex-col items-center gap-4 py-2">
                <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-gray-900">Check your inbox</p>
                  <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
                    If <strong>{fpEmail}</strong> has an account, we've sent a reset link. It expires in 1 hour.
                  </p>
                </div>
                <button onClick={() => setMkutanoMode("signin")}
                  className="text-[11px] text-gray-400 underline underline-offset-2">
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <div className="w-full -mb-2">
                  <p className="text-[13px] font-semibold text-gray-900">Reset your password</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Enter your email and we'll send a reset link.
                  </p>
                </div>
                <form onSubmit={handleForgotPassword} className="w-full flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fp-email" className="text-xs font-medium text-gray-600">Email</Label>
                    <Input id="fp-email" type="email" placeholder="you@themkutano.com" value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)} autoComplete="email" className="h-10 text-sm" />
                  </div>
                  {fpError && <p className="text-xs text-red-500 text-center">{fpError}</p>}
                  <Button type="submit" size="lg" className="w-full font-medium" disabled={fpLoading}>
                    {fpLoading ? "Sending…" : "Send reset link"}
                  </Button>
                </form>
                <div className="w-full border-t border-gray-100 pt-1 text-center">
                  <button onClick={() => setMkutanoMode("signin")}
                    className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                    Back to sign in
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Partner: sign in ── */}
        {tab === "partner" && partnerMode === "signin" && (
          <>
            <form onSubmit={handlePartnerSignIn} className="w-full flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pt-email" className="text-xs font-medium text-gray-600">Email</Label>
                <Input id="pt-email" type="email" placeholder="you@organization.com" value={ptEmail}
                  onChange={(e) => setPtEmail(e.target.value)} required autoComplete="email" className="h-10 text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pt-password" className="text-xs font-medium text-gray-600">Password</Label>
                <div className="relative">
                  <Input id="pt-password" type={ptShowPw ? "text" : "password"} placeholder="••••••••" value={ptPassword}
                    onChange={(e) => setPtPassword(e.target.value)} required autoComplete="current-password" className="h-10 text-sm pr-10" />
                  <button type="button" tabIndex={-1} onClick={() => setPtShowPw(!ptShowPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {ptShowPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={ptRemember} onChange={(e) => setPtRemember(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 accent-gray-900" />
                <span className="text-[12px] text-gray-500">Remember me for 30 days</span>
              </label>
              {ptError && <p className="text-xs text-red-500 text-center">{ptError}</p>}
              <Button type="submit" size="lg" className="w-full font-medium" disabled={ptLoading}>
                {ptLoading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <div className="w-full border-t border-gray-100 pt-1 flex items-center justify-between">
              <button
                onClick={() => { setPartnerMode("forgotpw"); setPtFpSuccess(false); setPtFpError(null); setPtFpEmail(""); }}
                className="text-[11px] text-gray-400 hover:text-gray-600 font-medium transition-colors">
                Forgot password?
              </button>
              <button
                onClick={() => { setPartnerMode("request"); setReqSuccess(false); }}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors">
                Request access →
              </button>
            </div>
          </>
        )}

        {/* ── Partner: forgot password ── */}
        {tab === "partner" && partnerMode === "forgotpw" && (
          <>
            {ptFpSuccess ? (
              <div className="w-full text-center flex flex-col items-center gap-4 py-2">
                <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-gray-900">Check your inbox</p>
                  <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
                    If <strong>{ptFpEmail}</strong> has an account, we've sent a reset link.
                    It expires in 1 hour.
                  </p>
                  <p className="text-[11px] text-gray-400 mt-2">
                    The link goes directly to you — no one else will see it.
                  </p>
                </div>
                <button onClick={() => setPartnerMode("signin")}
                  className="text-[11px] text-gray-400 underline underline-offset-2">
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <div className="w-full -mb-2">
                  <p className="text-[13px] font-semibold text-gray-900">Reset your password</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Enter your email and we'll send a private reset link — only you will receive it.
                  </p>
                </div>
                <form onSubmit={handlePartnerForgotPassword} className="w-full flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pt-fp-email" className="text-xs font-medium text-gray-600">Email</Label>
                    <Input id="pt-fp-email" type="email" placeholder="you@organization.com" value={ptFpEmail}
                      onChange={(e) => setPtFpEmail(e.target.value)} autoComplete="email" className="h-10 text-sm" autoFocus />
                  </div>
                  {ptFpError && <p className="text-xs text-red-500 text-center">{ptFpError}</p>}
                  <Button type="submit" size="lg" className="w-full font-medium" disabled={ptFpLoading}>
                    {ptFpLoading ? "Sending…" : "Send reset link"}
                  </Button>
                </form>
                <div className="w-full border-t border-gray-100 pt-1 text-center">
                  <button onClick={() => setPartnerMode("signin")}
                    className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                    Back to sign in
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Partner: request access ── */}
        {tab === "partner" && partnerMode === "request" && (
          <>
            {reqSuccess ? (
              <div className="w-full text-center flex flex-col items-center gap-4 py-2">
                <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-gray-900">Request submitted</p>
                  <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
                    The Mkutano team has been notified and will send an invite to{" "}
                    <strong>{reqEmail}</strong>.
                  </p>
                </div>
                <button onClick={() => setPartnerMode("signin")}
                  className="text-[11px] text-gray-400 underline underline-offset-2">
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <form onSubmit={handleRequestAccess} className="w-full flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="req-convening" className="text-xs font-medium text-gray-600">
                      Which project?
                    </Label>
                    {convenings.length === 0 ? (
                      <p className="text-[12px] text-gray-400 italic">
                        Loading projects… or contact{" "}
                        <a href="mailto:info@themkutano.com" className="underline">info@themkutano.com</a>
                      </p>
                    ) : (
                      <select
                        id="req-convening"
                        value={reqConveningId}
                        onChange={(e) => setReqConveningId(e.target.value)}
                        className="w-full h-10 rounded-md border border-gray-200 px-3 text-[13px] text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-gray-900 appearance-none"
                      >
                        <option value="" disabled>Select a project…</option>
                        {convenings.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                    {reqErrors.conveningId && <p className="text-xs text-red-500">{reqErrors.conveningId}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="req-name" className="text-xs font-medium text-gray-600">Full name</Label>
                    <Input id="req-name" type="text" placeholder="Your name" value={reqName}
                      onChange={(e) => setReqName(e.target.value)} autoComplete="name" className="h-10 text-sm" />
                    {reqErrors.name && <p className="text-xs text-red-500">{reqErrors.name}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="req-email" className="text-xs font-medium text-gray-600">Email</Label>
                    <Input id="req-email" type="email" placeholder="you@organization.com" value={reqEmail}
                      onChange={(e) => setReqEmail(e.target.value)} autoComplete="email" className="h-10 text-sm" />
                    {reqErrors.email && <p className="text-xs text-red-500">{reqErrors.email}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="req-org" className="text-xs font-medium text-gray-600">
                      Organization <span className="text-gray-400 font-normal">(optional)</span>
                    </Label>
                    <Input id="req-org" type="text" placeholder="Your organization" value={reqOrg}
                      onChange={(e) => setReqOrg(e.target.value)} className="h-10 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="req-msg" className="text-xs font-medium text-gray-600">
                      Message <span className="text-gray-400 font-normal">(optional)</span>
                    </Label>
                    <textarea
                      id="req-msg"
                      placeholder="Briefly describe your role and what you need access to…"
                      value={reqMessage}
                      onChange={(e) => setReqMessage(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-gray-900 resize-none"
                    />
                  </div>
                  {reqErrors._ && <p className="text-xs text-red-500 text-center">{reqErrors._}</p>}
                  <Button type="submit" size="lg" className="w-full font-medium" disabled={reqLoading}>
                    {reqLoading ? "Submitting…" : "Submit request"}
                  </Button>
                </form>
                <div className="w-full border-t border-gray-100 pt-1 text-center">
                  <button onClick={() => setPartnerMode("signin")}
                    className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                    ← Already have access? Sign in
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
