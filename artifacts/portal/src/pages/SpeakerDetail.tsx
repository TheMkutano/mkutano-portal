import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetSpeaker,
  useListSpeakerEngagements,
  useListConsents,
  useUpdateConsent,
  useUpdateSpeaker,
  getListConsentsQueryKey,
  getGetSpeakerQueryKey,
  getListSpeakerEngagementsQueryKey,
} from "@workspace/api-client-react";
import { useConvening } from "@/contexts/ConveningContext";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ChevronRight, Mail, Phone, Pencil, Check, X } from "lucide-react";
import ImageUpload from "@/components/ui/ImageUpload";

const inviteColor: Record<string, string> = {
  Identified: "bg-gray-100 text-gray-600",
  Invited: "bg-blue-100 text-blue-700",
  Confirmed: "bg-green-100 text-green-800",
  Briefed: "bg-teal-100 text-teal-800",
  Ready: "bg-teal-100 text-teal-800",
  Attended: "bg-purple-100 text-purple-700",
  Thanked: "bg-gray-100 text-gray-700",
};

export default function SpeakerDetail() {
  const { id } = useParams<{ id: string }>();
  const { activeConveningId } = useConvening();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"profile" | "engagement" | "consent">("profile");

  const detailParams = { conveningId: activeConveningId ?? "" };
  const { data: speaker, isLoading } = useGetSpeaker(id ?? "", detailParams, {
    query: { enabled: !!id && !!activeConveningId, queryKey: getGetSpeakerQueryKey(id ?? "", detailParams) },
  });

  const seParams = { speakerId: id ?? "", conveningId: activeConveningId ?? "" };
  const { data: engagements } = useListSpeakerEngagements(
    seParams,
    { query: { enabled: !!id && !!activeConveningId, queryKey: getListSpeakerEngagementsQueryKey(seParams) } },
  );

  const consentParams = { speakerId: id ?? "", conveningId: activeConveningId ?? "" };
  const { data: consents } = useListConsents(
    consentParams,
    { query: { enabled: !!id && !!activeConveningId, queryKey: getListConsentsQueryKey(consentParams) } },
  );

  const updateConsent = useUpdateConsent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListConsentsQueryKey() });
      },
      onError: () => toast({ title: "Could not save consent", description: "Please try again.", variant: "destructive" }),
    },
  });

  const updateSpeaker = useUpdateSpeaker({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSpeakerQueryKey(id ?? "", detailParams) });
      },
      onError: () => toast({ title: "Could not save speaker", description: "Please try again.", variant: "destructive" }),
    },
  });

  const [bioEditing, setBioEditing] = useState(false);
  const [bioShortDraft, setBioShortDraft] = useState("");
  const [bioMediumDraft, setBioMediumDraft] = useState("");

  const engagement = engagements?.[0] ?? null;
  const consent = consents?.[0] ?? null;

  if (!id) return null;
  if (isLoading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading...</div>;
  if (!speaker) return <div className="text-center py-20 text-gray-500">Speaker not found.</div>;

  const handleConsentToggle = async (field: string, value: boolean) => {
    if (!consent) return;
    await updateConsent.mutateAsync({
      id: consent.id,
      params: { conveningId: activeConveningId! },
      data: { [field]: value },
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/speakers">
          <Button variant="ghost" size="sm" className="gap-2 text-gray-500 hover:text-gray-900 -ml-2">
            <ArrowLeft className="h-4 w-4" /> Speakers
          </Button>
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-300" />
        <span className="text-sm text-gray-500">{speaker.name}</span>
      </div>

      <div className="flex items-start gap-5">
        <ImageUpload
          conveningId={activeConveningId}
          currentUrl={speaker.photoUrl}
          shape="circle"
          size="lg"
          placeholder="Add photo"
          onUpload={async (objectPath) => {
            await updateSpeaker.mutateAsync({ id: id!, data: { conveningId: activeConveningId!, photoUrl: objectPath } });
          }}
          onRemove={async () => {
            await updateSpeaker.mutateAsync({ id: id!, data: { conveningId: activeConveningId!, photoUrl: null } });
          }}
        />
        <div className="flex-1">
          <h1 className="text-[22px] font-semibold text-gray-900">{speaker.name}</h1>
          {speaker.title && <p className="text-gray-500 mt-1">{speaker.title}</p>}
          <div className="flex items-center gap-2 mt-2">
            {speaker.gender && (
              <Badge variant="secondary" className="text-xs">{speaker.gender}</Badge>
            )}
            {engagement?.invitationStatus && (
              <Badge className={`text-xs ${inviteColor[engagement.invitationStatus] ?? ""}`}>
                {engagement.invitationStatus}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(["profile", "engagement", "consent"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {speaker.email && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <a href={`mailto:${speaker.email}`} className="hover:text-primary">{speaker.email}</a>
                </div>
              )}
              {speaker.phone && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Phone className="h-4 w-4 text-gray-400" />
                  {speaker.phone}
                </div>
              )}
              {speaker.timezone && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Timezone</span>
                  <span className="text-gray-700">{speaker.timezone}</span>
                </div>
              )}
              {speaker.preferredContactMethod && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Preferred contact</span>
                  <span className="text-gray-700">{speaker.preferredContactMethod}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Expertise</CardTitle>
            </CardHeader>
            <CardContent>
              {speaker.expertise && speaker.expertise.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {speaker.expertise.map((ex, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{ex}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No expertise listed.</p>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2 shadow-sm border-gray-200">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Bio</CardTitle>
              {!bioEditing ? (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-gray-400 hover:text-gray-700"
                  onClick={() => { setBioShortDraft(speaker.bioShort ?? ""); setBioMediumDraft(speaker.bioMedium ?? ""); setBioEditing(true); }}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-green-700"
                    onClick={async () => {
                      await updateSpeaker.mutateAsync({ id: id!, data: { conveningId: activeConveningId!, bioShort: bioShortDraft || null, bioMedium: bioMediumDraft || null } });
                      setBioEditing(false);
                    }}>
                    <Check className="h-3 w-3" /> Save
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-gray-400" onClick={() => setBioEditing(false)}>
                    <X className="h-3 w-3" /> Cancel
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {bioEditing ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Short bio <span className="text-gray-300">(for programmes)</span></Label>
                    <Textarea value={bioShortDraft} onChange={(e) => setBioShortDraft(e.target.value)}
                      rows={3} placeholder="2–3 sentence bio for event programmes…" className="text-sm resize-none" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Medium bio <span className="text-gray-300">(for website)</span></Label>
                    <Textarea value={bioMediumDraft} onChange={(e) => setBioMediumDraft(e.target.value)}
                      rows={5} placeholder="Longer bio for event website or speaker page…" className="text-sm resize-none" />
                  </div>
                </>
              ) : (
                <>
                  {speaker.bioShort ? (
                    <div>
                      <p className="text-[11px] text-gray-400 mb-1 uppercase tracking-wide">Short</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{speaker.bioShort}</p>
                    </div>
                  ) : null}
                  {speaker.bioMedium ? (
                    <div>
                      <p className="text-[11px] text-gray-400 mb-1 uppercase tracking-wide">Medium</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{speaker.bioMedium}</p>
                    </div>
                  ) : null}
                  {!speaker.bioShort && !speaker.bioMedium && (
                    <p className="text-sm text-gray-400">No bio yet. Click Edit to add one.</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "engagement" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {engagement ? (
            <>
              <Card className="shadow-sm border-gray-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Session</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {engagement.sessionType && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Type</span>
                      <span className="text-gray-900">{engagement.sessionType}</span>
                    </div>
                  )}
                  {engagement.sessionTitle && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Title</span>
                      <span className="text-gray-900 text-right max-w-xs">{engagement.sessionTitle}</span>
                    </div>
                  )}
                  {engagement.responsiblePerson && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Owner</span>
                      <span className="text-gray-900">{engagement.responsiblePerson}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-gray-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">Logistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Briefing docs sent</span>
                    <Badge variant={engagement.briefingDocsSent ? "default" : "secondary"} className="text-xs">
                      {engagement.briefingDocsSent ? "Yes" : "No"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Logistics confirmed</span>
                    <Badge variant={engagement.logisticsConfirmed ? "default" : "secondary"} className="text-xs">
                      {engagement.logisticsConfirmed ? "Yes" : "No"}
                    </Badge>
                  </div>
                  {Number(engagement.honorariumAmount ?? 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Honorarium</span>
                      <span className="text-gray-900 font-medium">
                        {Number(engagement.honorariumAmount ?? 0).toLocaleString("en-GB")}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="md:col-span-2 shadow-sm border-gray-200 border-dashed">
              <CardContent className="py-12 text-center">
                <p className="text-gray-500">No engagement record for this convening.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "consent" && (
        <div className="grid grid-cols-1 gap-6 max-w-lg">
          {consent ? (
            <Card className="shadow-sm border-gray-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Media Consent</CardTitle>
                  <Badge className={`text-xs ${
                    consent.status === "Granted" ? "bg-green-100 text-green-800" :
                    consent.status === "Pending" ? "bg-amber-100 text-amber-800" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {consent.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { field: "photographyConsent", label: "Photography" },
                  { field: "videoRecordingConsent", label: "Video recording" },
                  { field: "liveStreamConsent", label: "Live streaming" },
                  { field: "nameAndBioPublication", label: "Name & bio publication" },
                  { field: "socialMediaUse", label: "Social media use" },
                  { field: "thirdPartyMediaSharing", label: "Third-party media sharing" },
                ].map(({ field, label }) => (
                  <div key={field} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{label}</span>
                    <Switch
                      checked={Boolean(consent[field as keyof typeof consent])}
                      onCheckedChange={(v) => handleConsentToggle(field, v)}
                      disabled={updateConsent.isPending}
                    />
                  </div>
                ))}
                {consent.notes && (
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400 uppercase font-medium mb-1">Notes</p>
                    <p className="text-sm text-gray-600">{consent.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-sm border-gray-200 border-dashed">
              <CardContent className="py-12 text-center">
                <p className="text-gray-500">No consent record found.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
