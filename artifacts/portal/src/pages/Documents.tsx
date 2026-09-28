import { useState, useRef, useCallback, useEffect } from "react";
import { useConvening } from "@/contexts/ConveningContext";
import {
  useListDocuments,
  useCreateDocument,
  useUpdateDocument,
  useDeleteDocument,
  useListTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  getListDocumentsQueryKey,
  getListTemplatesQueryKey,
  type ConveningDocument,
  type OutreachTemplate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import { projectObjectUrl } from "@/lib/projectObjectUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  ExternalLink,
  FileText,
  Mail,
  Eye,
  Pencil,
  Upload,
  RefreshCw,
  Copy,
  Globe,
  MapPin,
  FileStack,
  FileSearch,
  X,
} from "lucide-react";

// ── Types & constants ─────────────────────────────────────────────────────────

const DOC_TYPES = [
  "Deck",
  "GuidingDoc",
  "Prospectus",
  "Report",
  "AideMemoire",
  "Communique",
  "Contract",
  "Other",
] as const;

const TEMPLATE_CATEGORIES = [
  "PartnerLetter",
  "SponsorLetter",
  "PensionFundLetter",
  "AdvisoryBoardConceptNote",
  "AdvisoryBoardInvitation",
  "SteeringCommitteeConceptNote",
  "Other",
] as const;

const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  PartnerLetter: "Partner Letter",
  SponsorLetter: "Sponsor Letter",
  PensionFundLetter: "Pension Fund Letter",
  AdvisoryBoardConceptNote: "Advisory Board Concept Note",
  AdvisoryBoardInvitation: "Advisory Board Invitation",
  SteeringCommitteeConceptNote: "Steering Committee Concept Note",
  Other: "Other",
};

// Tonal badge colors per document type
const DOC_TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  Deck:        { bg: "#E6F1FB", text: "#2A6FB0" },
  GuidingDoc:  { bg: "#E1F5EE", text: "#0F6E56" },
  Prospectus:  { bg: "#EFE9FB", text: "#5E3A9C" },
  Report:      { bg: "#FBF3E2", text: "#8A6516" },
  AideMemoire: { bg: "#E1F5F0", text: "#0C5E50" },
  Communique:  { bg: "#FDE8D8", text: "#9B4518" },
  Contract:    { bg: "#E8EBF8", text: "#2B3EA0" },
  Other:       { bg: "#F1EFE8", text: "#5A6472" },
};

const DOC_TYPE_ICON: Record<string, string> = {
  Deck: "📊", GuidingDoc: "📋", Prospectus: "📄",
  Report: "📑", AideMemoire: "📝", Communique: "📣",
  Contract: "🤝", Other: "📁",
};

// Tonal badge colors per template category
const CAT_BADGE: Record<string, { bg: string; text: string }> = {
  PartnerLetter:                { bg: "#E6F1FB", text: "#2A6FB0" },
  SponsorLetter:                { bg: "#E1F5EE", text: "#0F6E56" },
  PensionFundLetter:            { bg: "#FBF3E2", text: "#8A6516" },
  AdvisoryBoardConceptNote:     { bg: "#EFE9FB", text: "#5E3A9C" },
  AdvisoryBoardInvitation:      { bg: "#E1F5F0", text: "#0C5E50" },
  SteeringCommitteeConceptNote: { bg: "#E8EBF8", text: "#2B3EA0" },
  Other:                        { bg: "#F1EFE8", text: "#5A6472" },
};

// Serve doc URL: storage objects served through /api/storage
// Extract {{MERGE_FIELDS}} from markdown body
function extractMergeFields(body: string): string[] {
  return [...new Set((body.match(/\{\{([^}]+)\}\}/g) ?? []))];
}

// ── Small components ──────────────────────────────────────────────────────────

function TonalBadge({
  label,
  bg,
  text,
  className = "",
}: {
  label: string;
  bg: string;
  text: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] font-medium whitespace-nowrap ${className}`}
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}

function FlLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-secondary,#6B7A8D)] mb-1">
      {children}
    </span>
  );
}

function MergeFieldPills({ body }: { body: string }) {
  const fields = extractMergeFields(body);
  if (!fields.length) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-2">
      {fields.map((f) => (
        <span
          key={f}
          className="px-1.5 py-0.5 rounded text-[10px] font-mono"
          style={{ background: "#FBF3E2", color: "#8A6516", border: "1px solid #F0DEBA" }}
        >
          {f}
        </span>
      ))}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E3E8EE]" style={{ height: 44 }}>
      <div className="h-5 w-5 rounded bg-[#EEF3F9] animate-pulse shrink-0" />
      <div className="h-3 w-40 rounded bg-[#EEF3F9] animate-pulse" />
      <div className="ml-auto h-5 w-16 rounded-[6px] bg-[#EEF3F9] animate-pulse" />
    </div>
  );
}

// ── File uploader hook with progress bar ──────────────────────────────────────

function useDocUpload(conveningId: string | null | undefined, onDone: (objectPath: string, originalName: string) => void) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const upload = useUpload({
    conveningId,
    onSuccess: (res) => {
      onDone(res.objectPath, res.metadata.name);
    },
  });

  const trigger = useCallback(() => fileRef.current?.click(), []);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFileName(file.name);
      await upload.uploadFile(file);
      e.target.value = "";
    },
    [upload]
  );

  return { fileRef, fileName, trigger, onFileChange, isUploading: upload.isUploading, progress: upload.progress, error: upload.error };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Documents() {
  const { activeConveningId } = useConvening();
  const qc = useQueryClient();
  const { toast } = useToast();

  const docKey = getListDocumentsQueryKey({ conveningId: activeConveningId ?? "" });
  const tmplKey = getListTemplatesQueryKey({ conveningId: activeConveningId ?? "" });

  const { data: documents = [], isLoading: docsLoading } = useListDocuments(
    { conveningId: activeConveningId ?? "" },
    { query: { enabled: !!activeConveningId, queryKey: docKey } }
  );
  const { data: templates = [], isLoading: tmplsLoading } = useListTemplates(
    { conveningId: activeConveningId ?? "" },
    { query: { enabled: !!activeConveningId, queryKey: tmplKey } }
  );

  const createDocument  = useCreateDocument();
  const updateDocument  = useUpdateDocument();
  const deleteDocument  = useDeleteDocument();
  const createTemplate  = useCreateTemplate();
  const updateTemplate  = useUpdateTemplate();
  const deleteTemplate  = useDeleteTemplate();

  const invalidateDocs  = () => void qc.invalidateQueries({ queryKey: docKey });
  const invalidateTmpls = () => void qc.invalidateQueries({ queryKey: tmplKey });

  // ── Document state ──────────────────────────────────────────────────────────
  const [filterType, setFilterType] = useState("All");
  const [showDocModal, setShowDocModal] = useState(false);
  const [versioningDoc, setVersioningDoc] = useState<ConveningDocument | null>(null);
  const [docForm, setDocForm] = useState({ title: "", type: "Deck" as string, url: "", notes: "" });
  const [docObjectPath, setDocObjectPath] = useState<string | null>(null);
  const [docFileName, setDocFileName] = useState<string | null>(null);
  const [versionObjectPath, setVersionObjectPath] = useState<string | null>(null);

  // Upload hook for new document
  const docUploader = useDocUpload(activeConveningId, (path, name) => {
    setDocObjectPath(path);
    if (!docForm.title) setDocForm((f) => ({ ...f, title: name.replace(/\.[^.]+$/, "") }));
  });

  // Upload hook for new version
  const versionUploader = useDocUpload(activeConveningId, (path) => {
    setVersionObjectPath(path);
  });

  // Surface upload errors — otherwise a failed upload silently leaves the
  // "Click to upload a file" state with no feedback and a disabled submit button.
  useEffect(() => {
    if (docUploader.error) {
      toast({ title: "Upload failed", description: docUploader.error.message, variant: "destructive" });
    }
  }, [docUploader.error]);

  useEffect(() => {
    if (versionUploader.error) {
      toast({ title: "Upload failed", description: versionUploader.error.message, variant: "destructive" });
    }
  }, [versionUploader.error]);

  // ── Template state ──────────────────────────────────────────────────────────
  const [showTmplModal, setShowTmplModal] = useState(false);
  const [editingTmpl, setEditingTmpl] = useState<OutreachTemplate | null>(null);
  const [previewTmpl, setPreviewTmpl] = useState<OutreachTemplate | null>(null);
  const [composerTmpl, setComposerTmpl] = useState<OutreachTemplate | null>(null);
  const [mergeValues, setMergeValues] = useState<Record<string, string>>({});
  const [tmplForm, setTmplForm] = useState({
    name: "", category: "PartnerLetter" as string,
    scope: "Convening" as string, bodyMarkdown: "",
  });

  useEffect(() => {
    setShowDocModal(false);
    setVersioningDoc(null);
    setShowTmplModal(false);
    setEditingTmpl(null);
    setPreviewTmpl(null);
    setComposerTmpl(null);
  }, [activeConveningId]);

  // ── Document handlers ───────────────────────────────────────────────────────

  function openDocModal() {
    setDocForm({ title: "", type: "Deck", url: "", notes: "" });
    setDocObjectPath(null);
    setDocFileName(null);
    setShowDocModal(true);
  }

  function handleCreateDoc() {
    const url = docObjectPath ?? docForm.url.trim();
    if (!activeConveningId || !docForm.title.trim() || !url) return;
    createDocument.mutate(
      {
        data: {
          conveningId: activeConveningId,
          type: docForm.type as ConveningDocument["type"],
          title: docForm.title.trim(),
          url,
          notes: docForm.notes.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          invalidateDocs();
          setShowDocModal(false);
          toast({ title: "Document added" });
        },
      }
    );
  }

  function openVersionModal(doc: ConveningDocument) {
    setVersioningDoc(doc);
    setVersionObjectPath(null);
  }

  function handleUploadNewVersion() {
    if (!activeConveningId || !versioningDoc || !versionObjectPath) return;
    const data = { url: versionObjectPath, version: versioningDoc.version + 1, conveningId: activeConveningId };
    updateDocument.mutate(
      {
        id: versioningDoc.id,
        params: { conveningId: activeConveningId },
        data,
      },
      {
        onSuccess: () => {
          invalidateDocs();
          setVersioningDoc(null);
          toast({ title: `v${versioningDoc.version + 1} uploaded` });
        },
      }
    );
  }

  // ── Template handlers ───────────────────────────────────────────────────────

  function openNewTemplate() {
    setEditingTmpl(null);
    setTmplForm({ name: "", category: "PartnerLetter", scope: "Convening", bodyMarkdown: "" });
    setShowTmplModal(true);
  }

  function openEditTmpl(t: OutreachTemplate) {
    setEditingTmpl(t);
    setTmplForm({ name: t.name, category: t.category, scope: t.scope, bodyMarkdown: t.bodyMarkdown });
    setShowTmplModal(true);
  }

  function openCopyTmpl(t: OutreachTemplate) {
    setEditingTmpl(null);
    setTmplForm({ name: t.name, category: t.category, scope: "Convening", bodyMarkdown: t.bodyMarkdown });
    setShowTmplModal(true);
  }

  function openComposer(t: OutreachTemplate) {
    setComposerTmpl(t);
    const fields = extractMergeFields(t.bodyMarkdown);
    setMergeValues(Object.fromEntries(fields.map((f) => [f, ""])));
  }

  function handleSaveTmpl() {
    if (!activeConveningId || !tmplForm.name.trim() || !tmplForm.bodyMarkdown.trim()) return;
    const data = {
      name: tmplForm.name.trim(),
      category: tmplForm.category as OutreachTemplate["category"],
      scope: "Convening" as const,
      conveningId: activeConveningId,
      bodyMarkdown: tmplForm.bodyMarkdown,
    };
    if (editingTmpl) {
      updateTemplate.mutate({ id: editingTmpl.id, params: { conveningId: activeConveningId }, data }, {
        onSuccess: () => {
          invalidateTmpls();
          setShowTmplModal(false);
          setEditingTmpl(null);
          toast({ title: "Template updated" });
        },
      });
    } else {
      createTemplate.mutate({ data }, {
        onSuccess: () => {
          invalidateTmpls();
          setShowTmplModal(false);
          toast({ title: "Template created" });
        },
      });
    }
  }

  function composedBody(): string {
    if (!composerTmpl) return "";
    return composerTmpl.bodyMarkdown.replace(
      /\{\{([^}]+)\}\}/g,
      (_, key) => mergeValues[`{{${key}}}`] ?? `{{${key}}}`
    );
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const filteredDocs = filterType === "All" ? documents : documents.filter((d) => d.type === filterType);

  const globalTemplates = templates.filter((t) => t.scope === "Global");
  const conveningTemplates = templates.filter((t) => t.scope === "Convening");

  const isDocFormValid = !!(docForm.title.trim() && (docObjectPath || docForm.url.trim()));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "#0A1628", lineHeight: "1.2" }}>
            Documents
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "#6B7A8D" }}>
            {documents.length} document{documents.length !== 1 ? "s" : ""} ·{" "}
            {templates.length} template{templates.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <Tabs defaultValue="library">
        <TabsList className="bg-[#F1EFE8]">
          <TabsTrigger value="library" className="gap-1.5 text-[13px]">
            <FileText className="h-3.5 w-3.5" />
            Document Library
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5 text-[13px]">
            <Mail className="h-3.5 w-3.5" />
            Outreach Templates
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════ LIBRARY TAB */}
        <TabsContent value="library" className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Type filter pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setFilterType("All")}
                className="px-3 py-1 rounded-full text-[12px] font-medium transition-colors"
                style={
                  filterType === "All"
                    ? { background: "#0A1628", color: "#fff" }
                    : { background: "#EEF3F9", color: "#6B7A8D" }
                }
              >
                All
                <span className="ml-1.5 opacity-60">{documents.length}</span>
              </button>
              {DOC_TYPES.map((t) => {
                const count = documents.filter((d) => d.type === t).length;
                const isActive = filterType === t;
                const badge = DOC_TYPE_BADGE[t];
                return (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className="px-3 py-1 rounded-full text-[12px] font-medium transition-colors"
                    style={
                      isActive
                        ? { background: badge.text, color: "#fff" }
                        : { background: "#EEF3F9", color: "#6B7A8D" }
                    }
                  >
                    {t}
                    {count > 0 && (
                      <span className="ml-1.5 opacity-70">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <Button
              size="sm"
              onClick={openDocModal}
              className="gap-1.5 shrink-0"
              style={{ background: "#0A1628" }}
            >
              <Plus className="h-3.5 w-3.5" /> Add Document
            </Button>
          </div>

          {/* Document table */}
          <div
            className="rounded-[10px] overflow-hidden"
            style={{ border: "0.5px solid #E3E8EE", boxShadow: "0 1px 2px rgba(15,31,51,.04)" }}
          >
            {/* Table header */}
            <div
              className="grid bg-white border-b border-[#E3E8EE] px-4"
              style={{
                height: 36,
                gridTemplateColumns: "24px 1fr 120px 72px 100px 80px",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div />
              <span className="text-[11px] font-[500] uppercase tracking-[0.02em]" style={{ color: "#6B7A8D" }}>
                Title
              </span>
              <span className="text-[11px] font-[500] uppercase tracking-[0.02em]" style={{ color: "#6B7A8D" }}>
                Type
              </span>
              <span className="text-[11px] font-[500] uppercase tracking-[0.02em] text-center" style={{ color: "#6B7A8D" }}>
                Ver
              </span>
              <span className="text-[11px] font-[500] uppercase tracking-[0.02em]" style={{ color: "#6B7A8D" }}>
                Added
              </span>
              <div />
            </div>

            {/* Loading skeletons */}
            {docsLoading && (
              <div className="bg-white">
                {[0, 1, 2].map((i) => <SkeletonRow key={i} />)}
              </div>
            )}

            {/* Empty state */}
            {!docsLoading && filteredDocs.length === 0 && (
              <div className="bg-white flex flex-col items-center justify-center py-16 gap-3">
                <FileSearch className="h-9 w-9" style={{ color: "#C8D3E0" }} />
                <p className="text-[13px]" style={{ color: "#6B7A8D" }}>
                  {filterType === "All"
                    ? "No documents yet — add the first one."
                    : `No ${filterType} documents yet.`}
                </p>
                <Button size="sm" variant="outline" onClick={openDocModal} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add Document
                </Button>
              </div>
            )}

            {/* Document rows */}
            {!docsLoading && filteredDocs.map((doc) => {
              const badge = DOC_TYPE_BADGE[doc.type] ?? DOC_TYPE_BADGE.Other;
              const added = new Date(doc.createdAt).toLocaleDateString("en-GB", {
                day: "2-digit", month: "short", year: "numeric",
              });
              return (
                <div
                  key={doc.id}
                  className="group grid bg-white border-b border-[#E3E8EE] last:border-0 px-4 hover:bg-[#EEF3F9] transition-colors"
                  style={{
                    height: 44,
                    gridTemplateColumns: "24px 1fr 120px 72px 100px 80px",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span className="text-base leading-none select-none">
                    {DOC_TYPE_ICON[doc.type] ?? "📁"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: "#0A1628" }}>
                      {doc.title}
                    </p>
                    {doc.notes && (
                      <p className="text-[11px] truncate" style={{ color: "#6B7A8D" }}>
                        {doc.notes}
                      </p>
                    )}
                  </div>
                  <div>
                    <TonalBadge
                      label={doc.type}
                      bg={badge.bg}
                      text={badge.text}
                    />
                  </div>
                  <span
                    className="text-[12px] font-[500] text-center tabular-nums"
                    style={{ color: "#6B7A8D" }}
                  >
                    v{doc.version}
                  </span>
                  <span className="text-[12px]" style={{ color: "#6B7A8D" }}>
                    {added}
                  </span>
                  {/* Row actions — visible on hover */}
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={projectObjectUrl(doc.url, activeConveningId)}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded hover:bg-[#D8E3EF] transition-colors"
                      title="Open"
                    >
                      <ExternalLink className="h-3.5 w-3.5" style={{ color: "#3B5BA5" }} />
                    </a>
                    <button
                      onClick={() => openVersionModal(doc)}
                      className="p-1.5 rounded hover:bg-[#D8E3EF] transition-colors"
                      title="Upload new version"
                    >
                      <RefreshCw className="h-3.5 w-3.5" style={{ color: "#6B7A8D" }} />
                    </button>
                    <button
                      onClick={() =>
                        deleteDocument.mutate({ id: doc.id, params: { conveningId: activeConveningId ?? "" } }, { onSuccess: invalidateDocs })
                      }
                      className="p-1.5 rounded hover:bg-[#FCEBEB] transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" style={{ color: "#C0C8D3" }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════ TEMPLATES TAB */}
        <TabsContent value="templates" className="mt-6 space-y-6">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={openNewTemplate}
              className="gap-1.5"
              style={{ background: "#0A1628" }}
            >
              <Plus className="h-3.5 w-3.5" /> New Template
            </Button>
          </div>

          {tmplsLoading && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-[10px] bg-white p-4 animate-pulse"
                  style={{ border: "0.5px solid #E3E8EE", height: 80 }}
                />
              ))}
            </div>
          )}

          {!tmplsLoading && templates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <FileStack className="h-9 w-9" style={{ color: "#C8D3E0" }} />
              <p className="text-[13px]" style={{ color: "#6B7A8D" }}>
                No outreach templates yet — create the first one.
              </p>
              <Button size="sm" variant="outline" onClick={openNewTemplate} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> New Template
              </Button>
            </div>
          )}

          {/* Global templates section */}
          {!tmplsLoading && globalTemplates.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5" style={{ color: "#2A6FB0" }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "#2A6FB0" }}>
                  Global Templates
                </span>
                <span className="text-[11px]" style={{ color: "#6B7A8D" }}>
                  — legacy templates are read-only; copy into this convening to edit
                </span>
              </div>
              {globalTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onEdit={openCopyTmpl}
                  onPreview={() => setPreviewTmpl(t)}
                  onUse={() => openComposer(t)}
                  onDelete={() => {}}
                />
              ))}
            </div>
          )}

          {/* Convening-scoped templates section */}
          {!tmplsLoading && conveningTemplates.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" style={{ color: "#5E3A9C" }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "#5E3A9C" }}>
                  This Convening
                </span>
                <span className="text-[11px]" style={{ color: "#6B7A8D" }}>
                  — private to this event
                </span>
              </div>
              {conveningTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onEdit={openEditTmpl}
                  onPreview={() => setPreviewTmpl(t)}
                  onUse={() => openComposer(t)}
                  onDelete={() =>
                    deleteTemplate.mutate({ id: t.id, params: { conveningId: activeConveningId ?? "" } }, { onSuccess: invalidateTmpls })
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════ ADD DOCUMENT MODAL */}
      {showDocModal && (
        <ModalOverlay onClose={() => setShowDocModal(false)} title="Add Document">
          <div className="space-y-4">
            {/* File upload zone */}
            <div>
              <FlLabel>File</FlLabel>
              <input
                type="file"
                ref={docUploader.fileRef}
                className="hidden"
                accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.svg"
                onChange={docUploader.onFileChange}
              />
              <button
                type="button"
                onClick={docUploader.trigger}
                disabled={docUploader.isUploading}
                className="w-full rounded-[8px] border border-dashed border-[#C8D3E0] py-5 flex flex-col items-center gap-2 hover:bg-[#F6F8FB] transition-colors disabled:opacity-60"
              >
                {docUploader.isUploading ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" style={{ color: "#3B5BA5" }} />
                    <span className="text-[12px]" style={{ color: "#6B7A8D" }}>
                      Uploading… {docUploader.progress}%
                    </span>
                  </>
                ) : docObjectPath ? (
                  <>
                    <Upload className="h-5 w-5" style={{ color: "#0F6E56" }} />
                    <span className="text-[12px] font-medium" style={{ color: "#0F6E56" }}>
                      ✓ {docUploader.fileName}
                    </span>
                    <span className="text-[11px]" style={{ color: "#6B7A8D" }}>Click to replace</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-5 w-5" style={{ color: "#6B7A8D" }} />
                    <span className="text-[12px]" style={{ color: "#6B7A8D" }}>
                      Click to upload a file
                    </span>
                    <span className="text-[11px]" style={{ color: "#C8D3E0" }}>
                      PDF, PPTX, DOCX, images
                    </span>
                  </>
                )}
              </button>
              {/* Fallback URL */}
              {!docObjectPath && (
                <div className="mt-2">
                  <FlLabel>Or paste a URL</FlLabel>
                  <Input
                    type="url"
                    placeholder="https://drive.google.com/…"
                    value={docForm.url}
                    onChange={(e) => setDocForm((f) => ({ ...f, url: e.target.value }))}
                    className="text-[13px]"
                  />
                </div>
              )}
            </div>

            <div>
              <FlLabel>Title *</FlLabel>
              <Input
                value={docForm.title}
                onChange={(e) => setDocForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. AAPS 2027 Concept Note"
                className="text-[13px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FlLabel>Type</FlLabel>
                <Select value={docForm.type} onValueChange={(v) => setDocForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger className="text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FlLabel>Notes</FlLabel>
                <Input
                  value={docForm.notes}
                  onChange={(e) => setDocForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional"
                  className="text-[13px]"
                />
              </div>
            </div>
          </div>
          <ModalFooter
            onCancel={() => setShowDocModal(false)}
            onConfirm={handleCreateDoc}
            confirmLabel={createDocument.isPending ? "Saving…" : "Add Document"}
            disabled={!isDocFormValid || createDocument.isPending || docUploader.isUploading}
          />
        </ModalOverlay>
      )}

      {/* ════════════════════════════════════════ NEW VERSION MODAL */}
      {versioningDoc && (
        <ModalOverlay
          onClose={() => setVersioningDoc(null)}
          title={`New Version — ${versioningDoc.title}`}
        >
          <div className="space-y-4">
            <p className="text-[13px]" style={{ color: "#6B7A8D" }}>
              Currently <strong>v{versioningDoc.version}</strong>. Upload a file to create{" "}
              <strong>v{versioningDoc.version + 1}</strong>.
            </p>
            <input
              type="file"
              ref={versionUploader.fileRef}
              className="hidden"
              accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              onChange={versionUploader.onFileChange}
            />
            <button
              type="button"
              onClick={versionUploader.trigger}
              disabled={versionUploader.isUploading}
              className="w-full rounded-[8px] border border-dashed border-[#C8D3E0] py-5 flex flex-col items-center gap-2 hover:bg-[#F6F8FB] transition-colors disabled:opacity-60"
            >
              {versionUploader.isUploading ? (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin" style={{ color: "#3B5BA5" }} />
                  <span className="text-[12px]" style={{ color: "#6B7A8D" }}>
                    Uploading… {versionUploader.progress}%
                  </span>
                </>
              ) : versionObjectPath ? (
                <>
                  <Upload className="h-5 w-5" style={{ color: "#0F6E56" }} />
                  <span className="text-[12px] font-medium" style={{ color: "#0F6E56" }}>
                    ✓ {versionUploader.fileName}
                  </span>
                  <span className="text-[11px]" style={{ color: "#6B7A8D" }}>Click to replace</span>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" style={{ color: "#6B7A8D" }} />
                  <span className="text-[12px]" style={{ color: "#6B7A8D" }}>Click to upload</span>
                </>
              )}
            </button>
          </div>
          <ModalFooter
            onCancel={() => setVersioningDoc(null)}
            onConfirm={handleUploadNewVersion}
            confirmLabel={updateDocument.isPending ? "Saving…" : `Save v${versioningDoc.version + 1}`}
            disabled={!versionObjectPath || updateDocument.isPending || versionUploader.isUploading}
          />
        </ModalOverlay>
      )}

      {/* ════════════════════════════════════════ TEMPLATE EDITOR MODAL */}
      {showTmplModal && (
        <ModalOverlay
          onClose={() => { setShowTmplModal(false); setEditingTmpl(null); }}
          title={editingTmpl ? "Edit Template" : "New Template"}
          wide
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <FlLabel>Name *</FlLabel>
                <Input
                  value={tmplForm.name}
                  onChange={(e) => setTmplForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Platinum Partner Invitation"
                  className="text-[13px]"
                />
              </div>
              <div>
                <FlLabel>Scope</FlLabel>
                <Select value={tmplForm.scope} onValueChange={(v) => setTmplForm((f) => ({ ...f, scope: v }))}>
                  <SelectTrigger className="text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Convening">This Convening</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <FlLabel>Category</FlLabel>
                <Select value={tmplForm.category} onValueChange={(v) => setTmplForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{TEMPLATE_CATEGORY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <FlLabel>Body *</FlLabel>
              <p className="text-[11px] mb-1" style={{ color: "#6B7A8D" }}>
                Use{" "}
                <code
                  className="px-1 rounded text-[10px]"
                  style={{ background: "#FBF3E2", color: "#8A6516" }}
                >
                  {"{{PARTNER_NAME}}"}
                </code>{" "}
                style placeholders for merge fields.
              </p>
              <Textarea
                value={tmplForm.bodyMarkdown}
                onChange={(e) => setTmplForm((f) => ({ ...f, bodyMarkdown: e.target.value }))}
                rows={10}
                className="font-mono text-[12px]"
                placeholder={`Dear {{PARTNER_NAME}},\n\nWe are pleased to invite you to {{CONVENING_NAME}}…`}
              />
              {tmplForm.bodyMarkdown && (
                <MergeFieldPills body={tmplForm.bodyMarkdown} />
              )}
            </div>
          </div>
          <ModalFooter
            onCancel={() => { setShowTmplModal(false); setEditingTmpl(null); }}
            onConfirm={handleSaveTmpl}
            confirmLabel={
              createTemplate.isPending || updateTemplate.isPending
                ? "Saving…"
                : editingTmpl ? "Update" : "Create"
            }
            disabled={
              !tmplForm.name.trim() ||
              !tmplForm.bodyMarkdown.trim() ||
              createTemplate.isPending ||
              updateTemplate.isPending
            }
          />
        </ModalOverlay>
      )}

      {/* ════════════════════════════════════════ TEMPLATE PREVIEW MODAL */}
      {previewTmpl && (
        <ModalOverlay
          onClose={() => setPreviewTmpl(null)}
          title={previewTmpl.name}
          wide
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const cb = CAT_BADGE[previewTmpl.category] ?? CAT_BADGE.Other;
                return (
                  <TonalBadge
                    label={TEMPLATE_CATEGORY_LABELS[previewTmpl.category] ?? previewTmpl.category}
                    bg={cb.bg}
                    text={cb.text}
                  />
                );
              })()}
              {previewTmpl.scope === "Global" ? (
                <TonalBadge label="🌐 Global" bg="#E6F1FB" text="#2A6FB0" />
              ) : (
                <TonalBadge label="📍 This Convening" bg="#EFE9FB" text="#5E3A9C" />
              )}
            </div>
            <div
              className="rounded-[8px] p-4 overflow-y-auto max-h-80"
              style={{ background: "#F6F8FB", border: "0.5px solid #E3E8EE" }}
            >
              <pre className="text-[12px] whitespace-pre-wrap font-sans leading-relaxed" style={{ color: "#3B4A5C" }}>
                {previewTmpl.bodyMarkdown}
              </pre>
            </div>
            <MergeFieldPills body={previewTmpl.bodyMarkdown} />
          </div>
          <div
            className="flex items-center justify-end gap-2 pt-4 mt-4"
            style={{ borderTop: "0.5px solid #E3E8EE" }}
          >
            <button
              className="text-[13px] px-3 py-1.5 rounded-[6px]"
              style={{ color: "#6B7A8D" }}
              onClick={() => setPreviewTmpl(null)}
            >
              Close
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { openEditTmpl(previewTmpl); setPreviewTmpl(null); }}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
            <Button
              size="sm"
              style={{ background: "#0A1628" }}
              onClick={() => { openComposer(previewTmpl); setPreviewTmpl(null); }}
            >
              Use Template
            </Button>
          </div>
        </ModalOverlay>
      )}

      {/* ════════════════════════════════════════ TEMPLATE COMPOSER MODAL */}
      {composerTmpl && (
        <ModalOverlay
          onClose={() => setComposerTmpl(null)}
          title={`Use: ${composerTmpl.name}`}
          wide
        >
          <div className="space-y-5">
            {/* Merge field inputs */}
            {extractMergeFields(composerTmpl.bodyMarkdown).length > 0 && (
              <div className="space-y-3">
                <p className="text-[12px]" style={{ color: "#6B7A8D" }}>
                  Fill in the merge fields to personalise the letter.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {extractMergeFields(composerTmpl.bodyMarkdown).map((field) => (
                    <div key={field}>
                      <FlLabel>{field.replace(/\{\{|\}\}/g, "")}</FlLabel>
                      <Input
                        value={mergeValues[field] ?? ""}
                        onChange={(e) =>
                          setMergeValues((prev) => ({ ...prev, [field]: e.target.value }))
                        }
                        placeholder={field}
                        className="text-[13px]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live preview */}
            <div>
              <FlLabel>Preview</FlLabel>
              <div
                className="rounded-[8px] p-4 overflow-y-auto max-h-64"
                style={{ background: "#F6F8FB", border: "0.5px solid #E3E8EE" }}
              >
                <pre className="text-[12px] whitespace-pre-wrap font-sans leading-relaxed" style={{ color: "#3B4A5C" }}>
                  {composedBody()}
                </pre>
              </div>
            </div>
          </div>
          <div
            className="flex items-center justify-end gap-2 pt-4 mt-4"
            style={{ borderTop: "0.5px solid #E3E8EE" }}
          >
            <button
              className="text-[13px] px-3 py-1.5 rounded-[6px]"
              style={{ color: "#6B7A8D" }}
              onClick={() => setComposerTmpl(null)}
            >
              Cancel
            </button>
            <Button
              size="sm"
              style={{ background: "#0A1628" }}
              onClick={() => {
                navigator.clipboard.writeText(composedBody()).then(() => {
                  toast({ title: "Copied to clipboard" });
                });
              }}
              className="gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" /> Copy Draft
            </Button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function TemplateCard({
  template: t,
  onEdit,
  onPreview,
  onUse,
  onDelete,
}: {
  template: OutreachTemplate;
  onEdit: (t: OutreachTemplate) => void;
  onPreview: () => void;
  onUse: () => void;
  onDelete: () => void;
}) {
  const cb = CAT_BADGE[t.category] ?? CAT_BADGE.Other;
  return (
    <div
      className="rounded-[10px] bg-white px-4 py-4"
      style={{ border: "0.5px solid #E3E8EE", boxShadow: "0 1px 2px rgba(15,31,51,.04)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-[14px] font-semibold" style={{ color: "#0A1628" }}>
              {t.name}
            </p>
            <TonalBadge
              label={TEMPLATE_CATEGORY_LABELS[t.category] ?? t.category}
              bg={cb.bg}
              text={cb.text}
            />
          </div>
          <p className="text-[12px] line-clamp-2" style={{ color: "#6B7A8D" }}>
            {t.bodyMarkdown.slice(0, 140)}
            {t.bodyMarkdown.length > 140 ? "…" : ""}
          </p>
          <MergeFieldPills body={t.bodyMarkdown} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onPreview}
            className="p-1.5 rounded-[6px] hover:bg-[#EEF3F9] transition-colors"
            title="Preview"
          >
            <Eye className="h-4 w-4" style={{ color: "#6B7A8D" }} />
          </button>
          <button
            onClick={() => onEdit(t)}
            className="p-1.5 rounded-[6px] hover:bg-[#EEF3F9] transition-colors"
            title={t.scope === "Global" ? "Copy to this convening" : "Edit"}
          >
            {t.scope === "Global" ? <Copy className="h-4 w-4" style={{ color: "#6B7A8D" }} /> : <Pencil className="h-4 w-4" style={{ color: "#6B7A8D" }} />}
          </button>
          {t.scope !== "Global" && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded-[6px] hover:bg-[#FCEBEB] transition-colors"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" style={{ color: "#C0C8D3" }} />
            </button>
          )}
          <Button
            size="sm"
            onClick={onUse}
            style={{ background: "#0A1628", fontSize: 12 }}
            className="ml-1 px-3"
          >
            Use
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModalOverlay({
  onClose,
  title,
  children,
  wide = false,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,22,40,0.45)" }}
    >
      <div
        className="bg-white rounded-[12px] flex flex-col overflow-hidden"
        style={{
          width: "100%",
          maxWidth: wide ? 640 : 460,
          maxHeight: "90vh",
          boxShadow: "0 8px 32px rgba(10,22,40,0.18)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "0.5px solid #E3E8EE" }}
        >
          <p className="text-[14px] font-semibold" style={{ color: "#0A1628" }}>
            {title}
          </p>
          <button
            onClick={onClose}
            className="p-1 rounded-[6px] hover:bg-[#EEF3F9] transition-colors"
          >
            <X className="h-4 w-4" style={{ color: "#6B7A8D" }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function ModalFooter({
  onCancel,
  onConfirm,
  confirmLabel,
  disabled,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  disabled: boolean;
}) {
  return (
    <div
      className="flex items-center justify-end gap-2 pt-4 mt-4"
      style={{ borderTop: "0.5px solid #E3E8EE" }}
    >
      <button
        onClick={onCancel}
        className="text-[13px] px-3 py-1.5 rounded-[6px] hover:bg-[#EEF3F9] transition-colors"
        style={{ color: "#6B7A8D" }}
      >
        Cancel
      </button>
      <Button
        size="sm"
        onClick={onConfirm}
        disabled={disabled}
        style={{ background: "#0A1628", opacity: disabled ? 0.45 : 1 }}
      >
        {confirmLabel}
      </Button>
    </div>
  );
}
