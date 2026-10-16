import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, Pill } from "@/components/encore/primitives";
import { supabase } from "@/integrations/supabase/client";
import { toastError } from "@/lib/encore/toast";
import { SAMPLE_DEAL } from "@/data/sampleDeal";
import {
  DOC_TYPES, REGIONS, DOC_TYPE_CODE, REGION_CODE, LITTLE_TEXT_MESSAGE, analysisTitle, checkFile, isTooLittleText, sha256Hex, storagePath,
} from "@/lib/encore/intake";

export const Route = createFileRoute("/app/new")({
  validateSearch: (s: Record<string, unknown>): { sample?: 1 } => (s["sample"] === 1 || s["sample"] === "1" ? { sample: 1 } : {}),
  head: () => ({ meta: [{ title: "New analysis — Encore" }, { name: "description", content: "Start an Encore analysis from a won deal document." }] }),
  component: NewAnalysis,
});

type Tab = "upload" | "paste" | "sample";
type Person = { name: string; title: string; department: string; project_role: string };
type Loaded = { text: string; pages: string[]; file?: File; filename: string; mime: string; size: number };

function NewAnalysis() {
  const { sample } = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>(sample ? "sample" : "upload");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pasted, setPasted] = useState("");
  const [isSample, setIsSample] = useState(false);
  const [customer, setCustomer] = useState("");
  const [department, setDepartment] = useState("");
  const [existing, setExisting] = useState("");
  const [docType, setDocType] = useState<string>("SOW");
  const [region, setRegion] = useState<string>("United States");
  const [anon, setAnon] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dupe, setDupe] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function loadSample() {
    setIsSample(true);
    setCustomer(SAMPLE_DEAL.customerName);
    setDepartment(SAMPLE_DEAL.department);
    setExisting(SAMPLE_DEAL.existingSolution);
    setDocType(SAMPLE_DEAL.documentType);
    setRegion(SAMPLE_DEAL.region);
    setPeople([]);
    setError(null);
  }

  useEffect(() => { if (sample) loadSample(); }, [sample]);

  async function onFile(file: File) {
    setError(null);
    setLoaded(null);
    try {
      const kind = checkFile(file.name, file.size);
      setBusy("Reading your document…");
      const ex = await import("@/lib/encore/extract-browser");
      const r = kind === "pdf" ? await ex.extractPdf(file) : await ex.extractDocx(file);
      if (isTooLittleText(r.text)) throw new Error(LITTLE_TEXT_MESSAGE);
      setLoaded({ ...r, file, filename: file.name, mime: file.type || kind, size: file.size });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't read that file.");
    } finally {
      setBusy(null);
    }
  }

  function currentDoc(): Loaded | null {
    if (tab === "upload") return loaded;
    if (tab === "paste") {
      const t = pasted.trim();
      return t ? { text: t, pages: [t], filename: "Pasted text.txt", mime: "text/plain", size: new Blob([t]).size } : null;
    }
    if (!isSample) return null;
    const t = SAMPLE_DEAL.text;
    return { text: t, pages: [t], filename: SAMPLE_DEAL.filename, mime: "text/plain", size: new Blob([t]).size };
  }

  async function submit(force = false) {
    setError(null);
    const doc = currentDoc();
    if (!customer.trim()) return setError("Please add the customer name.");
    if (!doc) return setError(tab === "upload" ? "Please upload a document." : tab === "paste" ? "Please paste the document text." : "Please load the sample deal.");
    if (tab === "paste" && isTooLittleText(doc.text)) return setError("That's very little text. Paste the full document.");
    try {
      setBusy("Saving…");
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) throw new Error("Please sign in again.");
      const hash = await sha256Hex(doc.text);
      if (!force) {
        const { data: existingDoc } = await supabase.from("documents").select("analysis_id").eq("user_id", userId).eq("sha256", hash).limit(1).maybeSingle();
        if (existingDoc) { setDupe(existingDoc.analysis_id); setBusy(null); return; }
      }
      setDupe(null);
      const { data: a, error: ae } = await supabase.from("analyses").insert({
        user_id: userId, title: analysisTitle(customer, docType), status: "draft",
        customer_name: customer.trim(), department: department.trim() || null, existing_solution: existing.trim() || null,
        document_type: DOC_TYPE_CODE[docType as keyof typeof DOC_TYPE_CODE], target_region: REGION_CODE[region as keyof typeof REGION_CODE], anonymise_customer: anon,
      }).select("id").single();
      if (ae || !a) throw new Error("We couldn't create the analysis. Please try again.");
      let filePath: string | null = null;
      if (doc.file) {
        filePath = storagePath(userId, a.id, doc.filename);
        const { error: se } = await supabase.storage.from("documents").upload(filePath, doc.file, { contentType: doc.mime });
        if (se) throw new Error("We couldn't store the file. Please try again.");
      }
      const { error: de } = await supabase.from("documents").insert({
        analysis_id: a.id, user_id: userId, filename: doc.filename, mime: doc.mime, file_path: filePath,
        text: doc.text, pages: doc.pages, page_count: doc.pages.length, size_bytes: doc.size, sha256: hash,
      });
      if (de) throw new Error("We couldn't save the document text. Please try again.");
      const rows = people.filter((p) => p.name.trim() || p.title.trim()).map((p) => ({
        analysis_id: a.id, user_id: userId, name: p.name.trim() || null, title: p.title.trim() || null,
        department: p.department.trim() || null, project_role: p.project_role.trim() || null,
        user_provided: true, label: "user", confidence: "high",
      }));
      if (rows.length) {
        const { error: pe } = await supabase.from("stakeholders").insert(rows);
        if (pe) throw new Error("We saved the document but couldn't save the stakeholders.");
      }
      await navigate({ to: "/app/a/$id/deal", params: { id: a.id } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      setError(msg);
      toastError(e, "Something went wrong. Please try again.", () => void submit(force));
      setBusy(null);
    }
  }

  const setP = (i: number, k: keyof Person, v: string) => setPeople((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-gutter">
      <h1 className="text-3xl font-semibold">New analysis</h1>
      <p className="mt-1 text-sm text-muted-foreground">Start from one won deal document.</p>

      <Card className="mt-8">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setError(null); if (v === "sample" && !isSample) loadSample(); }}>
          <TabsList>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="paste">Paste text</TabsTrigger>
            <TabsTrigger value="sample">Sample deal</TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="mt-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void onFile(f); }}
              className={`dot-grid flex w-full flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors ${drag ? "border-accent bg-accent/5" : "border-border"}`}
            >
              <FileUp className="size-6 text-muted-foreground" aria-hidden />
              <span className="mt-2 text-sm font-medium">{loaded ? loaded.filename : "Drop a PDF or DOCX, or click to choose"}</span>
              <span className="mt-1 text-xs text-muted-foreground">
                {loaded ? `${loaded.pages.length} page${loaded.pages.length === 1 ? "" : "s"} · ${loaded.text.length.toLocaleString()} characters read` : "Up to 20 MB. Text is read in your browser."}
              </span>
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          </TabsContent>
          <TabsContent value="paste" className="mt-4">
            <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={14} placeholder="Paste the full text of your SOW or proposal…" className="font-mono text-xs" />
          </TabsContent>
          <TabsContent value="sample" className="mt-4">
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{SAMPLE_DEAL.filename}</span>
                {isSample ? <Pill tone="inference">Fictional sample</Pill> : <Button size="sm" onClick={loadSample}>Load sample</Button>}
              </div>
              <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">{SAMPLE_DEAL.text.slice(0, 900)}…</pre>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold">About this deal</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="cust">Customer name *</Label><Input id="cust" className="mt-1.5" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Harrowgate Mutual Insurance Company" /></div>
          <div><Label htmlFor="dept">Department</Label><Input id="dept" className="mt-1.5" value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
          <div><Label htmlFor="exist">Existing solution (optional)</Label><Input id="exist" className="mt-1.5" value={existing} onChange={(e) => setExisting(e.target.value)} /></div>
          <div>
            <Label>Document type</Label>
            <Select value={docType} onValueChange={setDocType}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{DOC_TYPES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>
          </div>
          <div>
            <Label>Target region for look-alikes</Label>
            <Select value={region} onValueChange={setRegion}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
          </div>
          <label className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={anon} onCheckedChange={setAnon} />
            <span className="text-sm">Keep this customer anonymous in outreach</span>
          </label>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Stakeholders</h3>
          <Button variant="ghost" size="sm" onClick={() => setPeople((p) => [...p, { name: "", title: "", department: "", project_role: "" }])}><Plus /> Add person</Button>
        </div>
        {people.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Optional. Encore also reads names from the document.</p>}
        <div className="mt-3 space-y-3">
          {people.map((p, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <Input aria-label="Name" placeholder="Name" value={p.name} onChange={(e) => setP(i, "name", e.target.value)} />
              <Input aria-label="Title" placeholder="Title" value={p.title} onChange={(e) => setP(i, "title", e.target.value)} />
              <Input aria-label="Department" placeholder="Department" value={p.department} onChange={(e) => setP(i, "department", e.target.value)} />
              <Input aria-label="Project role" placeholder="Project role" value={p.project_role} onChange={(e) => setP(i, "project_role", e.target.value)} />
              <Button variant="ghost" size="icon" aria-label="Remove person" onClick={() => setPeople((ps) => ps.filter((_, j) => j !== i))}><Trash2 /></Button>
            </div>
          ))}
        </div>
      </Card>

      {dupe && (
        <div className="mt-6 rounded-xl border border-inference/30 bg-inference/10 p-4 text-sm">
          <p className="font-medium">You already analysed this document.</p>
          <div className="mt-3 flex gap-2">
            <Button asChild size="sm" variant="secondary"><Link to="/app/a/$id/deal" params={{ id: dupe }}>Open that analysis</Link></Button>
            <Button size="sm" onClick={() => void submit(true)} disabled={!!busy}>Create anyway</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-6 rounded-xl border border-risk/25 bg-risk/10 p-3 text-sm text-risk">{error}</p>}

      <div className="mt-6 flex items-center justify-end gap-3">
        {busy && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{busy}</span>}
        <Button onClick={() => void submit()} disabled={!!busy}>Create analysis</Button>
      </div>
    </main>
  );
}
