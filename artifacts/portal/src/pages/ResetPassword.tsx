import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Eye, EyeOff, AlertCircle } from "lucide-react";

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

export default function ResetPassword() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 px-8 py-10 flex flex-col items-center gap-6">
          <Brand />
          <div className="w-full flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12px] bg-red-50 text-red-700">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>This reset link is invalid. Please request a new one.</span>
          </div>
          <a href="/" className="text-[12px] text-blue-600 hover:text-blue-800 font-medium">← Back to sign in</a>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!password) errs.password = "Password is required.";
    else if (password.length < 8) errs.password = "At least 8 characters.";
    if (password !== confirm) errs.confirmPassword = "Passwords do not match.";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword: confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSuccess(true);
      } else if (res.status === 422 && data.errors) {
        const fieldErrors: Record<string, string> = {};
        for (const [f, msgs] of Object.entries(data.errors as Record<string, string[]>)) {
          fieldErrors[f] = Array.isArray(msgs) ? msgs[0] : String(msgs);
        }
        setErrors(fieldErrors);
      } else {
        setErrors({ _: data.error ?? "Something went wrong. Please try again." });
      }
    } catch {
      setErrors({ _: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 px-8 py-10 flex flex-col items-center gap-6">
        <Brand />

        {success ? (
          <div className="w-full text-center flex flex-col items-center gap-4 py-2">
            <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-gray-900">Password updated</p>
              <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
                Your password has been reset. You can now sign in with your new password.
              </p>
            </div>
            <a
              href="/"
              className="w-full block text-center bg-gray-900 text-white text-[13px] font-semibold py-2.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Go to sign in
            </a>
          </div>
        ) : (
          <>
            <div className="w-full -mb-2">
              <p className="text-[13px] font-semibold text-gray-900">Choose a new password</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Must be at least 8 characters.</p>
            </div>
            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-pw" className="text-xs font-medium text-gray-600">New password</Label>
                <div className="relative">
                  <Input
                    id="rp-pw"
                    type={showPw ? "text" : "password"}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-10 text-sm pr-10"
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-confirm" className="text-xs font-medium text-gray-600">Confirm new password</Label>
                <div className="relative">
                  <Input
                    id="rp-confirm"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Same password again"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className="h-10 text-sm pr-10"
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword}</p>}
              </div>
              {errors._ && (
                <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12px] bg-red-50 text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>{errors._}</span>
                </div>
              )}
              <Button type="submit" size="lg" className="w-full font-medium" disabled={loading}>
                {loading ? "Updating…" : "Set new password"}
              </Button>
            </form>
            <div className="w-full border-t border-gray-100 pt-1 text-center">
              <a href="/" className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                Back to sign in
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
