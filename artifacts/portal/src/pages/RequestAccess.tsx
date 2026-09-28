import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function RequestAccess() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required.";
    if (!email.trim()) errs.email = "Email is required.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, organization: organization || undefined, message: message || undefined }),
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
            <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-gray-900">Request received</p>
              <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
                The Mkutano team has been notified. You'll receive an email at <strong>{email}</strong> once your access is approved.
              </p>
            </div>
            <Link href="/" className="text-[11px] text-gray-400 underline underline-offset-2 mt-1">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="w-full">
              <p className="text-[13px] font-semibold text-gray-900 mb-0.5">Request portal access</p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                For partners and external stakeholders. The Mkutano team will review your request and grant access to the relevant sections.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="req-name" className="text-xs font-medium text-gray-600">Full name</Label>
                <Input
                  id="req-name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="h-10 text-sm"
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="req-email" className="text-xs font-medium text-gray-600">Email</Label>
                <Input
                  id="req-email"
                  type="email"
                  placeholder="you@organization.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="h-10 text-sm"
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="req-org" className="text-xs font-medium text-gray-600">
                  Organization <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="req-org"
                  type="text"
                  placeholder="Your organization"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="req-message" className="text-xs font-medium text-gray-600">
                  Why do you need access? <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="req-message"
                  placeholder="Briefly describe your role and what you need access to…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="text-sm resize-none"
                  rows={3}
                />
              </div>

              {errors._ && <p className="text-xs text-red-500 text-center">{errors._}</p>}

              <Button type="submit" size="lg" className="w-full font-medium mt-1" disabled={loading}>
                {loading ? "Submitting…" : "Submit request"}
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
