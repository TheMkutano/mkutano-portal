import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetPartner,
  useListEngagements,
  useCreateEngagement,
  useDeleteEngagement,
  useUpdateEngagement,
  useUpdatePartnerEngagement,
  useListEngagementStageHistory,
  getListEngagementsQueryKey,
  getGetPartnerQueryKey,
  getListPartnersQueryKey,
  getListEngagementStageHistoryQueryKey,
} from "@workspace/api-client-react";
import ImageUpload from "@/components/ui/ImageUpload";
import { useConvening } from "@/contexts/ConveningContext";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Building2, MapPin, ChevronRight, Mail, Phone, User, Clock, ArrowRight, Trash2 } from "lucide-react";
import { label } from "@/lib/labels";

const ENGAGEMENT_STAGES = ["Prospect", "Negotiation", "ContractSigned", "Onboarded", "PostEvent"];
const PAYMENT_STATUSES = ["Unpaid", "PartiallyPaid", "Paid"];
const PACKAGE_TYPES = ["Standard", "Custom"];

const stageColor: Record<string, string> = {
  Prospect: "bg-gray-100 text-gray-700",
  Negotiation: "bg-amber-100 text-amber-800",
  ContractSigned: "bg-blue-100 text-blue-800",
  Onboarded: "bg-green-100 text-green-800",
  PostEvent: "bg-purple-100 text-purple-700",
};

const paymentColor: Record<string, string> = {
  Unpaid: "bg-red-50 text-red-700 border-red-100",
  PartiallyPaid: "bg-amber-50 text-amber-800 border-amber-200",
  Paid: "bg-[rgba(0,250,196,0.18)] text-[#04342C] border-[rgba(0,250,196,0.4)]",
};

const tierColor: Record<string, string> = {
  Platinum: "bg-[#EEF1F6] text-[#0A2F5C]",
  Gold: "bg-[#FBF3E2] text-[#8A6516]",
  Silver: "bg-[#F0F2F4] text-[#5A6472]",
  CredibilityOnly: "bg-blue-50 text-blue-700",
  InKind: "bg-purple-50 text-purple-700",
};

function Field({ label: lbl, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-[13px] text-gray-500 shrink-0">{lbl}</span>
      <span className="text-[13px] text-gray-900 text-right font-medium">
        {children ?? (value || <span className="text-gray-300 font-normal">—</span>)}
      </span>
    </div>
  );
}

export default function PartnerDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { activeConveningId } = useConvening();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"overview" | "engagement" | "history">("overview");
  const refreshScoped = () => {
    queryClient.invalidateQueries({ queryKey: getListEngagementsQueryKey(engParams) });
    queryClient.invalidateQueries({ queryKey: getListPartnersQueryKey({ conveningId: activeConveningId ?? "" }) });
  };

  const detailParams = { conveningId: activeConveningId ?? "" };
  const { data: partner, isLoading: partnerLoading } = useGetPartner(id ?? "", detailParams, {
    query: { enabled: !!id && !!activeConveningId, queryKey: getGetPartnerQueryKey(id ?? "", detailParams) },
  });

  const engParams = { conveningId: activeConveningId ?? "", partnerId: id ?? "" };
  const { data: engagements } = useListEngagements(
    engParams,
    { query: { enabled: !!activeConveningId && !!id, queryKey: getListEngagementsQueryKey(engParams) } },
  );

  const createEngagement = useCreateEngagement({
    mutation: {
      onSuccess: refreshScoped,
      onError: (error) => toast({ title: "Could not save engagement", description: error.message, variant: "destructive" }),
    },
  });
  const deleteEngagement = useDeleteEngagement({
    mutation: {
      onSuccess: refreshScoped,
      onError: (error) => toast({ title: "Could not remove partner", description: error.message, variant: "destructive" }),
    },
  });

  const updateEngagement = useUpdateEngagement({
    mutation: {
      onSuccess: refreshScoped,
      onError: (error) => toast({ title: "Could not save engagement", description: error.message, variant: "destructive" }),
    },
  });

  const updatePartner = useUpdatePartnerEngagement({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetPartnerQueryKey(id ?? "", detailParams) }); refreshScoped(); },
      onError: (error) => toast({ title: "Could not save partner", description: error.message, variant: "destructive" }),
    },
  });

  const engagement = engagements?.[0] ?? null;

  const historyKey = getListEngagementStageHistoryQueryKey(engagement?.id ?? "");
  const { data: stageHistory = [] } = useListEngagementStageHistory(
    engagement?.id ?? "",
    { query: { enabled: !!engagement?.id, queryKey: historyKey } },
  );

  const [paymentSaving, setPaymentSaving] = useState(false);
  const [pkgSaving, setPkgSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState<{ engagementId: string; paymentStatus: string; paymentDueDate: string } | null>(null);
  const [pkgForm, setPkgForm] = useState<{ engagementId: string; packageName: string; packageType: string; packageBenefits: string } | null>(null);

  useEffect(() => {
    setPaymentForm(null);
    setPkgForm(null);
    setPaymentSaving(false);
    setPkgSaving(false);
  }, [activeConveningId]);

  if (!id) return null;
  if (partnerLoading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading...</div>;
  if (!partner) return <div className="text-center py-20 text-gray-500">Partner not found.</div>;

  const handleStageChange = async (newStatus: string) => {
    try {
      if (engagement) {
        await updateEngagement.mutateAsync({ id: engagement.id, data: { status: newStatus as "Prospect" } });
      } else if (activeConveningId) {
        await createEngagement.mutateAsync({
          data: { conveningId: activeConveningId, partnerId: id, status: newStatus as "Prospect" },
        });
      }
    } catch { /* mutation displays the API error */ }
  };

  const handlePaymentSave = async () => {
    if (!engagement || !paymentForm || paymentForm.engagementId !== engagement.id) return;
    setPaymentSaving(true);
    try {
      await updateEngagement.mutateAsync({
        id: engagement.id,
        data: {
          paymentStatus: paymentForm.paymentStatus as "Unpaid",
          paymentDueDate: paymentForm.paymentDueDate || null,
        },
      });
      setPaymentForm(null);
    } catch { /* keep form open; mutation displays the API error */ }
    finally { setPaymentSaving(false); }
  };

  const handlePkgSave = async () => {
    if (!engagement || !pkgForm || pkgForm.engagementId !== engagement.id) return;
    setPkgSaving(true);
    try {
      await updateEngagement.mutateAsync({
        id: engagement.id,
        data: {
          packageName: pkgForm.packageName || null,
          packageType: (pkgForm.packageType || null) as "Standard" | null,
          packageBenefits: pkgForm.packageBenefits || null,
        },
      });
      setPkgForm(null);
    } catch { /* keep form open; mutation displays the API error */ }
    finally { setPkgSaving(false); }
  };

  const handleRemove = async () => {
    if (!engagement || !activeConveningId ||
      !confirm(`Remove "${partner.institutionName}" from this convening? Its directory record and relationships with other convenings remain unchanged.`)) return;
    try {
      await deleteEngagement.mutateAsync({ id: engagement.id });
      queryClient.removeQueries({ queryKey: getGetPartnerQueryKey(id, detailParams) });
      setPaymentForm(null);
      setPkgForm(null);
      toast({ title: "Removed from this convening" });
      navigate("/partners");
    } catch { /* mutation displays the API error */ }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/partners">
          <Button variant="ghost" size="sm" className="gap-2 text-gray-500 hover:text-gray-900 -ml-2">
            <ArrowLeft className="h-4 w-4" /> Partners
          </Button>
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-300" />
        <span className="text-sm text-gray-500">{partner.institutionName}</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <ImageUpload
            conveningId={activeConveningId}
            currentUrl={partner.logoUrl}
            shape="square"
            size="md"
            placeholder="Add logo"
            onUpload={async (objectPath) => {
              await updatePartner.mutateAsync({ id: id!, data: { conveningId: activeConveningId!, partner: { logoUrl: objectPath } } });
            }}
            onRemove={async () => {
              await updatePartner.mutateAsync({ id: id!, data: { conveningId: activeConveningId!, partner: { logoUrl: null } } });
            }}
          />
          <div>
            <h1 className="text-[22px] font-semibold text-gray-900">{partner.institutionName}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {partner.location && (
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <MapPin className="h-3.5 w-3.5" />{partner.location}
                </div>
              )}
              <Badge className={`text-xs ${tierColor[partner.potentialTier] || "bg-gray-100 text-gray-700"}`}>
                {label(partner.potentialTier)}
              </Badge>
              {engagement?.status && (
                <Badge variant="outline" className={`text-xs ${stageColor[engagement.status] || ""}`}>
                  {label(engagement.status)}
                </Badge>
              )}
              {engagement?.paymentStatus && (
                <Badge variant="outline" className={`text-xs ${paymentColor[engagement.paymentStatus] || ""}`}>
                  {label(engagement.paymentStatus)}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {activeConveningId && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Pipeline stage:</span>
            <Select value={engagement?.status ?? ""} onValueChange={handleStageChange}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="Set stage" />
              </SelectTrigger>
              <SelectContent>
                {ENGAGEMENT_STAGES.map((s) => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}
              </SelectContent>
            </Select>
            {engagement && (
              <Button variant="outline" size="sm" onClick={() => { void handleRemove(); }}
                disabled={deleteEngagement.isPending} className="text-red-700 gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(["overview", "engagement", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {t === "history" ? (
              <span className="flex items-center gap-1.5">
                Stage history
                {stageHistory.length > 0 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold bg-[var(--brand-tint)] text-[var(--brand-primary)]">
                    {stageHistory.length}
                  </span>
                )}
              </span>
            ) : t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Building2 className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <p className="text-gray-700">{partner.description || "No description provided."}</p>
              </div>
              {partner.historicalEngagement && (
                <div>
                  <span className="text-xs font-medium text-gray-400 uppercase">Historical Engagement</span>
                  <p className="mt-1 text-gray-700">{partner.historicalEngagement}</p>
                </div>
              )}
              {partner.fitWithThem && (
                <div>
                  <span className="text-xs font-medium text-gray-400 uppercase">Fit</span>
                  <p className="mt-1 text-gray-700">{partner.fitWithThem}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Contact Person</CardTitle>
            </CardHeader>
            <CardContent>
              {partner.contactName ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{partner.contactName}</p>
                      {partner.contactTitle && (
                        <p className="text-xs text-gray-500">{partner.contactTitle}</p>
                      )}
                    </div>
                  </div>
                  {partner.contactEmail && (
                    <a
                      href={`mailto:${partner.contactEmail}`}
                      className="flex items-center gap-2 text-sm text-[var(--brand-primary)] hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" />{partner.contactEmail}
                    </a>
                  )}
                  {partner.contactPhone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="h-3.5 w-3.5 shrink-0" />{partner.contactPhone}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No contact person added yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Principals</CardTitle>
            </CardHeader>
            <CardContent>
              {Array.isArray(partner.principals) && partner.principals.length > 0 ? (
                <ul className="space-y-2">
                  {(partner.principals as string[]).map((p, i) => (
                    <li key={i} className="text-sm text-gray-700 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />{p}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">No principals listed.</p>
              )}
            </CardContent>
          </Card>

          {partner.historicalNotes && (
            <Card className="md:col-span-2 shadow-sm border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Historical Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700">{partner.historicalNotes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "engagement" && engagement && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Financial */}
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Financial</CardTitle>
            </CardHeader>
            <CardContent className="text-sm pt-0">
              <Field label="Amount">
                <span className="font-semibold">{engagement.currency} {(engagement.financialAmount ?? 0).toLocaleString("en-GB")}</span>
              </Field>
              <Field label="Invoice sent">
                <Badge variant={engagement.invoiceSent ? "default" : "secondary"} className="text-xs">{engagement.invoiceSent ? "Yes" : "No"}</Badge>
              </Field>
              <Field label="Invoice paid">
                <Badge variant={engagement.invoicePaid ? "default" : "secondary"} className="text-xs">{engagement.invoicePaid ? "Yes" : "No"}</Badge>
              </Field>
            </CardContent>
          </Card>

          {/* Payment Status */}
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Payment</CardTitle>
              {paymentForm?.engagementId !== engagement.id && (
                <button
                    onClick={() => setPaymentForm({ engagementId: engagement.id, paymentStatus: engagement.paymentStatus ?? "Unpaid", paymentDueDate: engagement.paymentDueDate ?? "" })}
                  className="text-[11px] text-gray-400 hover:text-gray-700 font-medium"
                >
                  Edit
                </button>
              )}
            </CardHeader>
            <CardContent className="text-sm pt-0">
              {paymentForm?.engagementId === engagement.id ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Status</label>
                    <Select value={paymentForm.paymentStatus} onValueChange={v => setPaymentForm(f => f ? { ...f, paymentStatus: v } : f)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Due Date</label>
                    <Input type="date" className="h-8 text-sm" value={paymentForm.paymentDueDate} onChange={e => setPaymentForm(f => f ? { ...f, paymentDueDate: e.target.value } : f)} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 text-xs bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white" onClick={handlePaymentSave} disabled={paymentSaving}>{paymentSaving ? "Saving…" : "Save"}</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPaymentForm(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <Field label="Payment status">
                    {engagement.paymentStatus ? (
                      <Badge variant="outline" className={`text-xs ${paymentColor[engagement.paymentStatus] ?? ""}`}>{label(engagement.paymentStatus)}</Badge>
                    ) : undefined}
                  </Field>
                  <Field label="Due date" value={engagement.paymentDueDate ?? null} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Package */}
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Sponsorship Package</CardTitle>
              {pkgForm?.engagementId !== engagement.id && (
                <button
                    onClick={() => setPkgForm({ engagementId: engagement.id, packageName: engagement.packageName ?? "", packageType: engagement.packageType ?? "Standard", packageBenefits: engagement.packageBenefits ?? "" })}
                  className="text-[11px] text-gray-400 hover:text-gray-700 font-medium"
                >
                  Edit
                </button>
              )}
            </CardHeader>
            <CardContent className="text-sm pt-0">
              {pkgForm?.engagementId === engagement.id ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Package Name</label>
                    <Input className="h-8 text-sm" value={pkgForm.packageName} onChange={e => setPkgForm(f => f ? { ...f, packageName: e.target.value } : f)} placeholder="e.g. Gold Sponsor Package" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Package Type</label>
                    <Select value={pkgForm.packageType} onValueChange={v => setPkgForm(f => f ? { ...f, packageType: v } : f)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{PACKAGE_TYPES.map(t => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Benefits / Notes</label>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                      rows={2}
                      value={pkgForm.packageBenefits}
                      onChange={e => setPkgForm(f => f ? { ...f, packageBenefits: e.target.value } : f)}
                      placeholder="Logo on banner, 2 delegate passes…"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 text-xs bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white" onClick={handlePkgSave} disabled={pkgSaving}>{pkgSaving ? "Saving…" : "Save"}</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPkgForm(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <Field label="Package name" value={engagement.packageName ?? null} />
                  <Field label="Type" value={engagement.packageType ? label(engagement.packageType) : null} />
                  <Field label="Benefits" value={engagement.packageBenefits ?? null} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Commitment */}
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Commitment</CardTitle>
            </CardHeader>
            <CardContent className="text-sm pt-0">
              <Field label="Type" value={engagement.commitmentType ?? null} />
              {engagement.commitmentDetails && <Field label="Details" value={engagement.commitmentDetails} />}
              <Field label="Owner" value={engagement.responsiblePerson ?? null} />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "engagement" && !engagement && (
        <Card className="shadow-sm border-gray-200 border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-3">No engagement record for this convening yet.</p>
            {activeConveningId && (
              <Button
                size="sm"
                 onClick={() => { void createEngagement.mutateAsync({ data: { conveningId: activeConveningId, partnerId: id } }).catch(() => {}); }}
              >
                Create Engagement
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "history" && (
        <div className="max-w-xl">
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" /> Outreach Stage History
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {!engagement ? (
                <p className="text-sm text-gray-400 py-4">No engagement record for this convening.</p>
              ) : stageHistory.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">No stage changes recorded yet. Changes will appear here after the outreach stage is updated.</p>
              ) : (
                <ol className="relative ml-2 border-l border-gray-200">
                  {stageHistory.map((entry, i) => {
                    const date = new Date(entry.createdAt);
                    const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                    const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                    const isFirst = i === 0;
                    return (
                      <li key={entry.id} className="mb-5 ml-5">
                        <span
                          className={`absolute -left-2 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-white ${
                            isFirst ? "bg-[var(--brand-primary)]" : "bg-gray-300"
                          }`}
                        />
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {entry.fromStage && (
                              <>
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-500 line-through">
                                  {label(entry.fromStage)}
                                </span>
                                <ArrowRight className="h-3 w-3 text-gray-400 shrink-0" />
                              </>
                            )}
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                              style={{ background: "#EEF3F9", color: "#1E5FA8" }}
                            >
                              {label(entry.toStage)}
                            </span>
                          </div>
                          <p className="text-[12px] text-gray-500">
                            {entry.actorName ?? "Unknown"} · {dateStr} at {timeStr}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
