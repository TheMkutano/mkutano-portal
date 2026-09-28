import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const INTERNAL_DOMAIN = "themkutano.com";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Full name is required.";
    if (!email) errs.email = "Email is required.";
    else if (!email.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`)) {
      errs.email = `Only @${INTERNAL_DOMAIN} email addresses can self-register.`;
    }
    if (!password) errs.password = "Password is required.";
    else if (password.length < 8) errs.password = "Password must be at least 8 characters.";
    if (password !== confirmPassword) errs.confirmPassword = "Passwords do not match.";
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email, password, confirmPassword }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSuccess(true);
      } else if (res.status === 422 && data.errors) {
        const fieldErrors: Record<string, string> = {};
        for (const [field, msgs] of Object.entries(data.errors as Record<string, string[]>)) {
          fieldErrors[field] = Array.isArray(msgs) ? msgs[0] : String(msgs);
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
        {/* Brand */}
        <div className="flex flex-col items-center gap-3">
          <img src="/mkutano-icon.png" alt="Mkutano" className="h-14 w-14 rounded-full object-cover shadow-sm" />
          <div className="text-center">
            <h1 className="text-[13px] font-black tracking-[0.18em] uppercase text-gray-900">Mkutano</h1>
            <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-gray-400 mt-0.5">
              Convening Management Portal
            </p>
          </div>
        </div>

        <div className="w-full border-t border-gray-100" />

        {success ? (
          <div className="w-full text-center flex flex-col items-center gap-4 py-2">
            <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
              <Mail className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-gray-900">Check your inbox</p>
              <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
                We've sent a verification link to <strong>{email}</strong>.<br />
                Click the link to activate your account. It expires in 24 hours.
              </p>
            </div>
            <Link href="/" className="text-[11px] text-gray-400 underline underline-offset-2 mt-1">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="w-full">
              <p className="text-[13px] font-semibold text-gray-900 mb-0.5">Create your account</p>
              <p className="text-[11px] text-gray-400">
                For staff with a <span className="font-medium">@{INTERNAL_DOMAIN}</span> email address.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-name" className="text-xs font-medium text-gray-600">
                  Full name
                </Label>
                <Input
                  id="reg-name"
                  type="text"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="h-10 text-sm"
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-email" className="text-xs font-medium text-gray-600">
                  Work email
                </Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder={`you@${INTERNAL_DOMAIN}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="h-10 text-sm"
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-password" className="text-xs font-medium text-gray-600">
                  Choose password
                </Label>
                <Input
                  id="reg-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="h-10 text-sm"
                />
                {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-confirm" className="text-xs font-medium text-gray-600">
                  Confirm password
                </Label>
                <Input
                  id="reg-confirm"
                  type="password"
                  placeholder="Same password again"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="h-10 text-sm"
                />
                {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword}</p>}
              </div>

              {errors._ && <p className="text-xs text-red-500 text-center">{errors._}</p>}

              <Button type="submit" size="lg" className="w-full font-medium mt-1" disabled={loading}>
                {loading ? "Creating account…" : "Create account"}
              </Button>
            </form>

            <Link
              href="/"
              className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
