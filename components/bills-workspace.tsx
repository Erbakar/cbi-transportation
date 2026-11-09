"use client";
import {userMessage} from '@/lib/user-message';
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from 'next/navigation';
import {readDisplayCache,writeDisplayCache,displayCacheGeneration} from '@/lib/workspace-cache';
import { useWorkspaceUser } from '@/components/workspace-session';
import { useUnsavedWork } from '@/hooks/use-unsaved-work';
import { InttraSnapshot } from "@/components/inttra-snapshot";
import {InttraAmend} from '@/components/inttra-amend';
import {TmaxxRecovery} from '@/components/tmaxx-recovery';
import {HblDocument} from '@/components/hbl-document';
import { ManualInstructions } from "@/components/manual-instructions";
import {focusInstructionIssue} from '@/components/instruction-field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {currentFormIssues,resolveInstruction} from '@/lib/instruction-rules';
import {emptyManual} from '@/lib/manual';
import { Manual } from "@/lib/manual";
import { Download, UploadCloud, FileText, Search, ArrowUpRight, CheckCircle2, AlertCircle, Clock3, PlugZap, Plus, Copy, ArrowLeft, RefreshCw, LockKeyhole, Loader2, ChevronRight, Files, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {notify as toast} from '@/lib/notify';
import {OperationToast} from '@/components/operation-toast';
type Delivery = {
  platform: string;
  kind: string;
  status: string;
  reference?: string;
  message?: string;
};
type RecordItem = {
  hblResults?:{goodId:number;reference:string;number:string;waybillId?:number;source?:string;snapshot?:{shipper:string;consignee:string;notify:string;loadPort:string;dischargePort:string;description:string}}[];
  submittedInttra?: import("@/lib/inttra-snapshot").InttraSnapshot | null;
  pausedPlatforms?: string[];
  actualParties?: import("@/lib/domain").Extraction["actualParties"];
  schemaVersion?: number;
  review?: {
    inputHash: string;
    createdAt: string;
    warnings: { code: string; message: string }[];
    approved: boolean;
  } | null;
  cargoLines?: import("@/lib/domain").Fields[];
  containers?: import("@/lib/domain").Fields[];
  documents?: { id: string; filename: string }[];
  manual?: Manual | null;
  id: string;
  filename: string;
  createdAt: string;
  status: string;
  revision: number;
  fields?: Record<string, { value: string | null; source: string; confidence: number }>;
  issues?: string[];
  deliveries: Delivery[];
};
type Connection = {
  id: string;
  name: string;
  kind: string;
  paused?: boolean;
  connected: boolean;
  message: string;
  credentialsSaved: boolean;
  username: string;
};
const labels: Record<string, string> = {
  review: "Uyarı onayı bekleniyor",
  partial: "INTTRA tamamlandı · T-MAXX bekliyor",
  paused: "Duraklatıldı",
  skipped: "Gerekli değil",
  uploaded: "Yüklendi",
  processing: "Belge okunuyor",
  missing: "Eksik bilgi",
  ready: "Aktarıma hazır",
  blocked: "İşlem durduruldu",
  complete: "Tamamlandı",
  failed: "İşlem başarısız",
  unknown: "Sonuç doğrulanmalı",
  created: "Oluşturuldu",
  waiting: "Bekliyor",
  sending: "Aktarılıyor",
};
function Status({ status }: { status: string }) {
  return (
    <span className={"status " + status}>
      {["complete", "created"].includes(status) ? <CheckCircle2 size={14} /> : ["missing", "failed", "unknown"].includes(status) ? <AlertCircle size={14} /> : <Clock3 size={14} />} {labels[status] || status}
    </span>
  );
}
async function api(path: string, options?: RequestInit) {
  const r = await fetch("/api/" + path, options);
  if (!r.headers.get('content-type')?.includes('application/json')) {
    throw new Error(r.status === 413 ? 'Yükleme boyutu sunucunun izin verdiği sınırı aşıyor.' : 'Sunucu beklenen yanıtı vermedi. Lütfen yeniden deneyin.');
  }
  const j = (await r.json()) as {
    error?: string;
    records: RecordItem[];
    record: RecordItem;
    connections: Connection[];
    user: { username: string } | null;
    configured: boolean;
    duplicate?: boolean;
  };
  if (!r.ok) throw new Error(j.error || "İşlem tamamlanamadı.");
  return j;
}
export function BillsWorkspace({ mode = 'list' }: { mode?: 'list' | 'create' }) {
  useEffect(()=>()=>{toast.dismiss();},[]);
  const session = useWorkspaceUser();
  const router = useRouter();
  const creating = mode === 'create';
  const [records, setRecords] = useState<RecordItem[]>(()=>readDisplayCache<RecordItem[]>(session.username,'bills-list')?.value??[]),
    [connections, setConnections] = useState<Connection[]>([]),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [active, setActive] = useState<RecordItem | null>(null),
    [detailPlatform,setDetailPlatform] = useState<"all"|"inttra"|"tmaxx">("all"),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState(false),
    [replacement, setReplacement] = useState<string | null>(null),
    [connectionOpen, setConnectionOpen] = useState(false),
    [loadingRecords, setLoadingRecords] = useState(false),
    [loadError, setLoadError] = useState(""),
    [connectionBusy, setConnectionBusy] = useState(false);
  const tmaxxPaused = connections.some((c) => c.id === "tmaxx" && c.paused);
  const [manualDirty, setManualDirty] = useState(false);
  const [formDraft,setFormDraft]=useState<{recordId:string;manual:Manual}|null>(null);
  const currentManual=active?(formDraft?.recordId===active.id?formDraft.manual:resolveInstruction({...structuredClone(emptyManual),...active.manual},{fields:active.fields||{}}).manual):null;
  const allIssues=active?.status==='missing'&&currentManual?currentFormIssues(active.issues||[],currentManual,active.fields||{}):active?.issues||[];
  const displayedIssues=allIssues.filter(issue=>detailPlatform==='all'||(detailPlatform==='inttra'?!/T[ -]?MAXX/i.test(issue):!/^INTTRA:/i.test(issue)));

  const [downloading, setDownloading] = useState<string | null>(null);
  async function downloadInttra(record: RecordItem) {
    if (downloading) return;
    setDownloading(record.id);
    try {
      const response = await fetch("/api/records/" + record.id + "/inttra-document", { signal: AbortSignal.timeout(120000) });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "INTTRA belgesi indirilemedi.");
      }
      if (!response.headers.get("content-type")?.includes("application/pdf")) throw new Error("PDF belgesi alınamadı.");
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = "INTTRA-SI-" + record.deliveries.find((d) => d.platform === "inttra")?.reference + ".pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast.success("INTTRA talimatı PDF olarak indirildi.");
    } catch (e) {
      toast.error(e instanceof Error && e.name === "TimeoutError" ? "PDF hazırlanması zaman aldı. Yeniden deneyin." : (e as Error).message);
    } finally {
      setDownloading(null);
    }
  }
  // Reset the editor guard when a different record is opened.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setManualDirty(false), [active?.id]);
  const [uploadReference,setUploadReference]=useState("");
  const [uploadOpen,setUploadOpen]=useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]),
    [sourceRoles, setSourceRoles] = useState<string[]>([]);
  const selectFiles = (files: FileList | null) => {
    if (!files?.length || busy) return;
    if (files.length > 5) {
      toast.error("En fazla 5 belge seçin.");
      return;
    }
    setPendingFiles(Array.from(files));
    setSourceRoles(Array.from(files).map(() => files.length===1?"instruction":""));
    setUploadReference(replacement?records.find(record => record.id === replacement)?.manual?.tmaxxReference||"":"");
    setUploadOpen(true);
    setDrag(false);
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const openedFromUrl = useRef(false);
  useUnsavedWork(manualDirty || pendingFiles.length > 0 || busy);
  const reload = useCallback(async () => {
    const epoch=displayCacheGeneration();
    setLoadingRecords(true);
    try {
      const d = await api("records");
      writeDisplayCache(session.username,'bills-list',d.records,epoch);setRecords(d.records);
      setLoadError("");
      const requestedId = !creating && !openedFromUrl.current ? new URLSearchParams(window.location.search).get('record') : null;
      const requested = d.records.find(r => r.id === requestedId);
      if (requested) openedFromUrl.current = true;
      setActive((a) => requested || (a ? d.records.find((r: RecordItem) => r.id === a.id) || a : null));
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoadingRecords(false);
    }
  }, [creating,session.username]);
  async function openListedRecord(id: string, platform: 'all'|'tmaxx'|'inttra') {
    try { const d=await api('records');setRecords(d.records);const current=d.records.find(r=>r.id===id);
      if(!current)throw Error('Kayıt bulunamadı. Listeyi yenileyin.');
      setDetailPlatform(platform);setActive(current);
    } catch(e) { toast.error((e as Error).message); }
  }
  const checkConnections = useCallback(async (silent = false) => {
    setConnectionBusy(true);
    try {
      const d = await api("connections", { method: "POST" });
      setConnections(d.connections);
      if (!silent) {
        const failed = d.connections.filter((c) => !c.paused && !c.connected);
        if (failed.length) toast.error(failed.map((c) => c.name + ": " + c.message).join(" · "));
        else toast.success("Kayıtlı bilgilerle platform bağlantıları yenilendi.");
      }
    } catch (e) {
      setConnections((c) =>
        c.map((v) => ({
          ...v,
          connected: false,
          message: "Bağlantı kontrol edilemedi.",
        })),
      );
      if (!silent) toast.error((e as Error).message);
    } finally {
      setConnectionBusy(false);
    }
  }, []);
  useEffect(() => {
    if (session) {
      // Initial server synchronization retains the existing automatic platform connection behavior.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      reload();
      checkConnections(true);
    }
  }, [session, reload, checkConnections]);
  async function connectPlatform(e: React.FormEvent<HTMLFormElement>, platform: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    setConnectionBusy(true);
    try {
      const d = await api("connections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          username: values.get("username"),
          password: values.get("password"),
        }),
      });
      setConnections(d.connections);
      const password = form.elements.namedItem("password") as HTMLInputElement;
      if (password) password.value = "";
      const connection = d.connections.find((c) => c.id === platform);
      if (connection?.connected) toast.success("Platform bağlantısı aktif.");
      else toast.info("Bilgiler şifreli kaydedildi. Bağlantı durumunu kontrol edin.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConnectionBusy(false);
    }
  }
  async function upload(files?: File[]) {
    if (!files?.length || busy) return;
    if (files.length > 5) {
      toast.error("Bir işlem için en fazla 5 belge seçin.");
      return;
    }
    if(!uploadReference.trim()){toast.error("Referans numarasını girin.");return;}
    setBusy(true);
    setDrag(false);
    if (sourceRoles.some((r) => !r) || !sourceRoles.includes("instruction")) {
      toast.error("Belgelerin kullanımını seçin; en az bir ana talimat gerekli.");
      setBusy(false);
      return;
    }
    let createdId: string | null = null;
    const form = new FormData();
    for (const file of files) form.append("files", file);
    form.set("roles", JSON.stringify(sourceRoles));
    form.set("tmaxxReference",uploadReference.trim());
    if (replacement) form.set("recordId", replacement);
    try {
      const d = await api("records", { method: "POST", body: form });
      createdId = d.record.id;
      setUploadOpen(false);
      setActive(d.record);
      setReplacement(null);
      setPendingFiles([]);
      setSourceRoles([]);
      await reload();
      if (d.duplicate) {
        toast.info("Bu belgeler zaten kayıtlı. Girdiğiniz bilgileri koruyarak mevcut kaydı açtık.");
        return;
      }
      toast.success("Talimat kaydedildi. Belge kontrolü başlıyor.");
      const r = await api("records/" + d.record.id + "/process", {
        method: "POST",
      });
      setActive(r.record);
      await reload();
      if (r.record.status === "complete") toast.success("Bu yük için gerekli platform aktarımları tamamlandı.");
    } catch (e) {
      toast.error((e as Error).message);
      await reload();
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
      if (creating && createdId) router.replace(`/bills?record=${encodeURIComponent(createdId)}`);
    }
  }
  async function importExistingHbl() {
    if (!active || busy) return;
    setBusy(true);
    try { const r=await api("records/"+active.id+"/tmaxx-import",{method:"POST"}); setActive(r.record); await reload(); toast.success("Mevcut HBL eşleştirildi. T-MAXX’te değişiklik yapılmadı."); }
    catch(e){toast.error((e as Error).message)} finally{setBusy(false)}
  }
  async function reconcileRecord() {
    if (!active) return;
    setBusy(true);
    try {
      const r = await api("records/" + active.id + "/reconcile", {
        method: "POST",
      });
      setActive(r.record);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteRecord() {
    if (!active || busy) return;
    if (!window.confirm("“" + active.filename + "” talimatı listeden silinsin mi?")) return;
    setBusy(true);
    try {
      await api("records/" + active.id, { method: "DELETE" });
      setActive(null);
      setReplacement(null);
      await reload();
      toast.success("Talimat silindi.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submitRecord() {
    if (!active || busy || manualDirty) return;
    setBusy(true);
    try {
      const r = await api("records/" + active.id + "/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      setActive(r.record);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
      await reload();
    } finally {
      setBusy(false);
    }
  }
  async function approveReview() {
    if (!active?.review || busy || manualDirty) return;
    if (!active.review.createdAt) { await reload(); toast.info("Uyarı bilgisi yenilendi. Tekrar onaylayabilirsiniz."); return; }
    const {inputHash,createdAt}=active.review;
    setBusy(true);
    try {
      const d=await api("records/"+active.id+"/process",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"submit",reviewApproval:{inputHash,createdAt}}),
      });
      setActive(d.record);
      await reload();
    } catch(e) { toast.error((e as Error).message); await reload(); }
    finally { setBusy(false); }
  }
  async function retry() {
    if (!active) return;
    setBusy(true);
    try {
      const r = await api("records/" + active.id + "/process", {
        method: "POST",
      });
      setActive(r.record);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
      await reload();
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!session) return;
    type MC = {
      registerTool: (tool: unknown, options: { signal: AbortSignal }) => Promise<void> | void;
    };
    const context = (document as unknown as { modelContext?: MC }).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "search_cbi_records",
          title: "Konşimentolarda ara",
          description: "Bu hesaba ait kayıtları arar ve dashboard arama alanını günceller. Kayıt oluşturmaz.",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string", maxLength: 200 } },
            required: ["query"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: async (input: unknown) => {
            const q = (input as { query?: unknown })?.query;
            if (typeof q !== "string" || q.length > 200) throw new Error("Geçerli bir arama metni gerekli.");
            setSearch(q);
            setFilter("all");
            const d = await api("records");
            return {
              records: d.records
                .filter((r) => JSON.stringify([r.manual?.tmaxxReference, r.filename, r.fields, r.deliveries]).toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")))
                .map((r) => ({
                  id: r.id,
                  filename: r.filename,
                  status: r.status,
                  deliveries: r.deliveries,
                })),
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, [session]);
  const visible = records.filter((r) => (filter === "all" || (filter === "attention" ? ["missing", "failed", "unknown", "blocked", "review", "partial"].includes(r.status) : r.status === "complete")) && JSON.stringify([r.manual?.tmaxxReference, r.filename, r.fields, r.deliveries]).toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr")));
  const totals = [
    { label: "Toplam talimat", value: records.length, icon: Files },
    {
      label: "Tamamlanan",
      value: records.filter((r) => r.status === "complete").length,
      icon: CheckCircle2,
    },
    {
      label: "İşlem bekleyen",
      value: records.filter((r) => r.status !== "complete").length,
      icon: Clock3,
    },
  ];
  return (
    <>
      <div className="workspace">
          <main className={'main module-main' + (creating ? ' creation-page' : '')}>
            {creating && <a className="module-back" href="/bills"><ArrowLeft size={16}/> Konşimentolara dön</a>}
            <div className="page-heading">
              <div>
                <div className="eyebrow">OPERASYON MERKEZİ</div>
                <h1>{creating ? "Yeni konşimento" : "Konşimentolar"}</h1>
                <p>{creating ? "Talimat belgelerini ekleyerek yeni bir konşimento hazırlayın." : "Konşimentolarınızı, HBL ve MBL işlem durumlarını takip edin."}</p>
              </div>
              <div className="module-heading-actions">
              {!creating && <a className="module-primary" href="/bills/new"><Plus size={17}/> Yeni konşimento oluştur</a>}
              <div className="connection-summary">
                <Button variant="outline" onClick={() => setConnectionOpen(true)}>
                  <PlugZap size={17} /> {connections.length && connections.every((c) => c.connected || c.paused) ? "Platform bağlantıları" : "Platform bağlantılarını yap"}
                </Button>
                <div className="connection-indicators">
                  {(connections.length
                    ? connections
                    : [
                        {
                          id: "tmaxx",
                          name: "T-MAXX",
                          connected: false,
                          credentialsSaved: false,
                          paused: false,
                        },
                        {
                          id: "inttra",
                          name: "INTTRA",
                          connected: false,
                          credentialsSaved: false,
                        },
                      ]
                  ).map((c) => (
                    <span key={c.id} className={"connection-indicator " + (c.connected ? "online" : "offline")}>
                      <span /> {c.name}: {c.paused ? "Duraklatıldı" : connectionBusy ? "Kontrol ediliyor" : c.connected ? "Aktif" : c.credentialsSaved ? "Bağlanamadı" : "Bağlantı bekliyor"}
                    </span>
                  ))}
                </div>
              </div>
            </div></div>
            {!creating && <div className="metrics">
              {totals.map(({ label, value, icon: Icon }) => (
                <div className="metric" key={label}>
                  <span className="metric-icon">
                    <Icon size={20} />
                  </span>
                  <div>
                    <span>{label}</span>
                    <strong>{value.toString().padStart(2, "0")}</strong>
                  </div>
                </div>
              ))}
              <div className="metric platforms">
                <span className="eyebrow">AKTARIM HEDEFLERİ</span>
                <div>
                  <span>
                    HBL <ChevronRight size={14} /> <b>T-MAXX</b>
                  </span>
                  <span>
                    MBL <ChevronRight size={14} /> <b>INTTRA</b>
                  </span>
                </div>
              </div>
            </div>}
            {creating && <section
              className={"upload-section " + (drag ? "dragging" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                selectFiles(e.dataTransfer.files);
              }}
            >
              <div className="upload-symbol">{busy ? <Loader2 className="spin" size={30} /> : <UploadCloud size={32} />}</div>
              <div className="upload-copy">
                <h2>{busy ? "Talimatınız işleniyor" : replacement ? "Tüm belgeleri yeniden seçin; manuel alanlar sıfırlanır" : "Aynı işleme ait belgeleri birlikte sürükleyin"}</h2>
                <p>{busy ? "Kontrol ve aktarım sonucu kayıt ayrıntısında görünecek." : "Belgeler birlikte okunur; HBL ve MBL için tek işlem hazırlanır."}</p>
                <span>PDF, Word, Excel (XLSX, XLS), JPG, PNG · 1–5 belge · Belge başına 10 MB, toplam 30 MB</span>
              </div>
              <div className="upload-actions">
                <Button className="primary" disabled={busy} onClick={() => fileInput.current?.click()}>
                  <UploadCloud size={17} /> Belgeleri seç
                </Button>
                {replacement && (
                  <Button variant="ghost" onClick={() => setReplacement(null)}>
                    Yeni talimata dön
                  </Button>
                )}
              </div>
            </section>}
              <input ref={fileInput} type="file" aria-label="Talimat dosyası" hidden accept=".pdf,.doc,.docx,.xlsx,.xls,.jpg,.jpeg,.png" multiple onChange={(e) => selectFiles(e.target.files)} />
            {pendingFiles.length > 0 && (
              <Dialog open={uploadOpen} onOpenChange={open=>{if(!busy){setUploadOpen(open);if(!open){setPendingFiles([]);setSourceRoles([]);if(fileInput.current)fileInput.current.value='';}}}}><DialogContent className="upload-reference-modal"><DialogHeader><DialogTitle>Yük referansını girin</DialogTitle><DialogDescription>Belgeler bu referansla kaydedilir. Yük bilgileri T-MAXX üzerinden kontrol edilir.</DialogDescription></DialogHeader><form className="manual-instructions" onSubmit={e=>{e.preventDefault();void upload(pendingFiles);}}>
                <label>T-MAXX referans numarası<Input autoFocus required maxLength={200} disabled={busy} value={uploadReference} onChange={e=>setUploadReference(e.target.value)} placeholder="Örn. S.E.26.09.00670" /></label>
                <h4>Yüklenen belgeler</h4>
                <p>Aynı yükün birden fazla müşteri talimatı varsa her biri için “Müşteri talimatı” seçin. “MBL taraf ve adres referansı” yalnızca firma ve adres bilgileri içindir; o belgenin yük miktarları toplama katılmaz.</p>
                {pendingFiles.map((file, index) => (
                  <label key={index} style={{ marginBottom: 12 }}>
                    {file.name}
                    <select disabled={busy} value={sourceRoles[index] || ""} onChange={(e) => setSourceRoles((r) => r.map((v, i) => (i === index ? e.target.value : v)))}>
                      <option value="">Kullanım seçin</option>
                      <option value="instruction">Müşteri talimatı · yük ve konteyner bilgileri</option>
                      <option value="mbl-parties">MBL taraf ve adres referansı</option>
                    </select>
                  </label>
                ))}
                <div className="detail-actions">
                  <Button type="submit" disabled={busy || !uploadReference.trim() || sourceRoles.some((r) => !r) || !sourceRoles.includes("instruction")}>
                    {busy?"Hazırlanıyor…":"Oluştur"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setUploadOpen(false);
                      setPendingFiles([]);
                      setSourceRoles([]);
                      if(fileInput.current)fileInput.current.value="";
                    }}
                  >
                    Vazgeç
                  </Button>
                </div>
              </form></DialogContent></Dialog>
            )}
            {creating && <div className="flow-note">
              <CheckCircle2 size={16} />
              <span>Eksik veya çelişkili bilgi varsa aktarım başlamaz. Talimatı düzeltip aynı kayda yeniden yükleyebilirsiniz.</span>
            </div>}
            {!creating && <section className="records">
              <div className="records-heading">
                <h2>
                  Konşimento listesi <span>{records.length}</span>
                </h2>
                <Button variant="ghost" disabled={loadingRecords} aria-label="Listeyi yenile" onClick={reload}>
                  <RefreshCw size={17} className={loadingRecords ? "spin" : ""} />
                </Button>
              </div>
              <div className="tools">
                <Tabs value={filter} onValueChange={setFilter}>
                  <TabsList>
                    <TabsTrigger value="all">Tümü</TabsTrigger>
                    <TabsTrigger value="attention">İşlem bekleyen</TabsTrigger>
                    <TabsTrigger value="complete">Tamamlanan</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="search">
                  <Search size={17} />
                  <Input aria-label="Kayıtlarda ara" placeholder="Müşteri, belge veya referans ara" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
              {loadingRecords && records.length === 0 && <p className="module-loading" role="status">Konşimentolar yükleniyor…</p>}
              {loadError ? (
                <div>
                  <OperationToast tone="error" message={loadError}/>
                  <Button variant="ghost" onClick={reload}>
                    Tekrar dene
                  </Button>
                </div>
              ) : (
                <div className="module-table-scroll">
                  <table className="module-table consignment-table"><thead><tr><th scope="col">Referans / müşteri</th><th scope="col">Oluşturulma</th><th scope="col">Durum</th><th scope="col">HBL · T-MAXX</th><th scope="col">MBL · INTTRA</th><th scope="col"><span className="sr-only">İşlemler</span></th></tr></thead><tbody>
                  {visible.map(r => <tr key={r.id}>
                    <td><button className="table-record-link" onClick={() => void openListedRecord(r.id,'all')}>{r.manual?.tmaxxReference || 'Referans girilmedi'}</button>{r.manual?.tmaxxReference && <button className="table-copy" aria-label={r.manual.tmaxxReference + ' referansını kopyala'} onClick={() => navigator.clipboard.writeText(r.manual?.tmaxxReference || '').then(() => toast.success('Referans kopyalandı')).catch(() => toast.error('Referans kopyalanamadı'))}><Copy size={13}/></button>}<small>{r.fields?.shipperName?.value || r.filename}</small></td>
                    <td><span>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(r.createdAt))}</span><small>Revizyon {r.revision}</small></td>
                    <td><Status status={r.submittedInttra && (tmaxxPaused || r.pausedPlatforms?.includes('tmaxx')) ? 'partial' : r.status}/></td>
                    {(['tmaxx', 'inttra'] as const).map(id => {
                      const delivery = r.deliveries.find(d => d.platform === id);
                      const paused = !!r.pausedPlatforms?.includes(id) || (id === 'tmaxx' && tmaxxPaused);
                      return <td key={id}><button className="table-platform-link" aria-label={`${r.manual?.tmaxxReference || r.filename} ${id === 'tmaxx' ? 'HBL' : 'MBL'} ayrıntıları`} onClick={() => void openListedRecord(r.id,id)}><Status status={paused ? 'paused' : delivery?.status || 'waiting'}/></button>{delivery?.reference && <small>{delivery.reference}</small>}
                        {id === 'tmaxx' && !!r.hblResults?.length && <HblDocument recordId={r.id} documents={r.hblResults} compact/>}
                        {id === 'inttra' && delivery?.status === 'created' && delivery.reference && <Button variant="ghost" disabled={!!downloading} onClick={() => downloadInttra(r)}><Download size={14}/> MBL PDF</Button>}
                      </td>;
                    })}
                    <td><Button variant="ghost" aria-label={(r.manual?.tmaxxReference || 'Talimat') + ' ayrıntısı'} onClick={() => void openListedRecord(r.id,'all')}>Aç <ArrowUpRight size={16}/></Button></td>
                  </tr>)}
                  </tbody></table>
                </div>
              )}
              {!loadError && !loadingRecords && visible.length === 0 && (
                <div className="empty">
                  <FileText size={30} />
                  <h3>{search ? "Aramanızla eşleşen kayıt yok" : filter !== "all" ? "Bu durumda konşimento yok" : "Henüz konşimento yok"}</h3>
                  <p>{search ? "Farklı bir müşteri veya referans ile arayın." : filter !== "all" ? "Diğer kayıtları görmek için Tümü sekmesini seçin." : "Yeni konşimento oluşturarak ilk talimatınızı ekleyin."}</p>
                </div>
              )}
            </section>}
            <footer>
              CBI Transportation <span>Belge yükleme ve platform aktarımı</span>
            </footer>
          </main>
          <Sheet open={!!active} onOpenChange={(v) => !v && setActive(null)}>
            <SheetContent className="detail-sheet shipment-detail">
              <SheetHeader>
                <SheetTitle>{active?.manual?.tmaxxReference||'Talimat ayrıntısı'}</SheetTitle>
                <SheetDescription>Talimat bilgileri ve platform sonuçları</SheetDescription>
              </SheetHeader>
              {active && (
                <div className="detail-body">
                  <Status status={active.submittedInttra && tmaxxPaused ? "partial" : active.status} />
                  <div className="detail-actions">
                    {(active.documents || [{ id: active.id, filename: active.filename }]).map((doc) => (
                      <Button key={doc.id} variant="outline" onClick={() => window.open("/api/records/" + active.id + "/file?document=" + encodeURIComponent(doc.id), "_blank")}>
                        {doc.filename} · İndir
                      </Button>
                    ))}
                    {!["complete", "processing"].includes(active.status) && (
                      <Button variant="outline" disabled={busy} onClick={retry}>
                        Yeniden kontrol et
                      </Button>
                    )}
                    {!active.deliveries.some((d) => ["created", "unknown", "sending"].includes(d.status)) && (
                      <Button
                        className="primary"
                        disabled={busy}
                        onClick={() => {
                          setReplacement(active.id);
                          setActive(null);
                          fileInput.current?.click();
                        }}
                      >
                        Belge setini değiştir
                      </Button>
                    )}
                    {!active.deliveries.some((d) => ["created", "unknown", "sending"].includes(d.status)) && (
                      <Button variant="outline" className="delete-instruction" disabled={busy || active.status === "processing"} onClick={deleteRecord}>
                        <Trash2 size={16} /> Talimatı sil
                      </Button>
                    )}
                  </div>
                  {displayedIssues.length > 0 && !(active.submittedInttra && tmaxxPaused) ? (
                    <div className="issue-panel">
                      <h3>
                        <AlertCircle size={18} /> {active.issues?.some(i => i.includes("Bu dosya yeni denizyolu")) ? "Belge bu işlem için uygun değil" : active.status === "review" ? "INTTRA uyarısını inceleyin" : active.status === "missing" ? "Talimat bilgileri tamamlanmalı" : active.status === "unknown" ? "Platform sonucu doğrulanmalı" : "Bağlantı veya işlem bekleniyor"}
                      </h3>
                      <details open={active.status !== "missing"}>
                        <summary>{displayedIssues.length} kontrol / eksik bilgi · Ayrıntıları göster</summary>
                        <ul>
                          {displayedIssues.map((i, n) => (
                            <li key={n}><button className="issue-link" onClick={()=>focusInstructionIssue(i)}>{i} →</button></li>
                          ))}
                        </ul>
                      </details>
                      <p>{active.issues?.some(i => i.includes("Bu dosya yeni denizyolu")) ? "Okunan bilgiler ve kaynak belgeler korundu. Bu ithalat veya operasyon dosyasından yeni ihracat konşimentosu oluşturulmaz." : active.status === "review" ? "Platform uyarısını inceleyin. Devam etmek için alttaki “Uyarıyı onayla ve aktar” düğmesini kullanın.": active.status === "missing" ? "Eksik alanları aşağıdan tamamlayıp kaydedin. Belge kaynaklı çelişkiler için belge setini düzeltin." : active.status === "unknown" ? "Belgenizi yeniden yüklemeyin. Önce platformdaki mevcut kayıt doğrulanmalı." : "Belgeniz kayıtlı. Yeniden yüklemeniz gerekmiyor. Bağlantı hazır olduğunda “Yeniden kontrol et” ile aynı belgeyi işleyebilirsiniz."}</p>
                    </div>
                  ) : null}
                  {active.deliveries.some((d) => !active.pausedPlatforms?.includes(d.platform) && ["unknown", "sending"].includes(d.status)) && (
                    <Button variant="outline" disabled={busy} onClick={reconcileRecord}>
                      Platformda mevcut kaydı doğrula
                    </Button>
                  )}
                  {detailPlatform!=="inttra"&&active.deliveries.some(d=>d.platform==='tmaxx'&&['unknown','failed','created'].includes(d.status))&&<Button variant="outline" disabled={busy} onClick={importExistingHbl}>T-MAXX’teki mevcut HBL’yi getir</Button>}
                  {detailPlatform!=='inttra'&&active.deliveries.some(d=>d.platform==='tmaxx'&&['unknown','failed','created'].includes(d.status))&&<TmaxxRecovery key={active.id} recordId={active.id} onComplete={()=>{toast.success('T-MAXX alanları doğrulandı.');void reload();setActive(null);}}/>}
                  {detailPlatform!=="inttra"&&!!active.hblResults?.length&&<section className="hbl-results"><h3>T-MAXX HBL belgeleri</h3>{active.hblResults.map(h=><div className="hbl-result" key={h.goodId}><b>HBL {h.number||h.reference}</b><p>{h.reference}</p>{h.source==='tmaxx-existing'&&<><p>T-MAXX’teki mevcut kayıt · Belge kimliği: {h.waybillId}</p>{!h.number&&<p>HBL numarası T-MAXX yük alanında boş.</p>}{h.snapshot&&<details><summary>T-MAXX’ten alınan konşimento bilgileri</summary><dl>{Object.entries({Gönderen:h.snapshot.shipper,Alıcı:h.snapshot.consignee,Notify:h.snapshot.notify,'Yükleme limanı':h.snapshot.loadPort,'Boşaltma limanı':h.snapshot.dischargePort,'Mal açıklaması':h.snapshot.description}).map(([label,value])=><div key={label}><dt>{label}</dt><dd style={{whiteSpace:'pre-wrap'}}>{value||'Boş'}</dd></div>)}</dl></details>}</>}<HblDocument recordId={active.id} goodId={h.goodId}/></div>)}</section>}
                  {detailPlatform!=="tmaxx"&&active.submittedInttra && <><InttraAmend key={active.id} recordId={active.id} onComplete={()=>{toast.success("INTTRA talimatı revize edildi. Güncel SI referansı kaydedildi.");void reload();setActive(null);}}/><details><summary>Gönderilmiş talimatın ayrıntıları</summary><InttraSnapshot snapshot={active.submittedInttra} /></details></>}
                  {!active.submittedInttra && (
                    <>
                      <ManualInstructions
                        pausedPlatforms={active.pausedPlatforms}
                        actualParties={active.actualParties}
                        recordId={active.id}
                        onDirtyChange={setManualDirty}
                        onDraftChange={setFormDraft}
                        key={active.id + ":" + JSON.stringify(active.manual)}
                        value={active.manual || null}
                        fields={active.fields || {}}
                        containers={active.containers}
                        cargoLines={active.cargoLines}
                        disabled={busy || active.deliveries.some((d) => ["created", "sending", "unknown"].includes(d.status))}
                        transferAction={{
                          label: busy ? "İşlem sürüyor…" : active.status === "review" ? "Uyarıyı onayla ve aktar" : tmaxxPaused ? "INTTRA’ya aktar" : "Platformlara aktar",
                          disabled: busy || manualDirty || !["ready", "failed", "review"].includes(active.status) || (active.status === "review" && !active.review?.warnings.length),
                          onClick: active.status === "review" ? approveReview : submitRecord,
                          hint: manualDirty ? "Önce değişiklikleri kaydedin." : active.status === "missing" ? "Güncel formu doğrulamak için “Kaydet ve kontrol et” düğmesine basın." : active.status === "review" ? "INTTRA uyarısını inceleyin. “Uyarıyı onayla ve aktar” gönderimi başlatır." : active.status === "blocked" ? "Yukarıdaki işlem engelini inceleyin." : "Kaydetmek ve kontrol etmek kayıt oluşturmaz. Aktarımı bu düğme başlatır.",
                        }}
                        onSave={async (m) => {
                          setBusy(true);
                          try {
                            const d = await api("records/" + active.id, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(m),
                            });
                            setActive(d.record);
                            await reload();
                            setManualDirty(false);
                            toast.success("Bilgiler kaydedildi. Platformlara gönderilmedi.");
                            const checked = await api("records/" + d.record.id + "/process", { method: "POST" });
                            setActive(checked.record);
                            await reload();
                          } catch (e) {
                            toast.error((e as Error).message);
                            await reload();
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                    </>
                  )}
                  {!active.deliveries.some((d) => d.platform === "inttra" && d.status === "created") && active.review?.warnings.length && !active.review.approved && (
                    <section className="issue-panel" id="inttra-review">
                      <h3>INTTRA uyarı onayı</h3>
                      <p>Yukarıdaki platform uyarılarını inceleyin. Onayınızdan sonra etkin platformlara aktarım devam eder.</p>
                      <Button
                        disabled={busy || manualDirty}
                        onClick={approveReview}
                      >
                        Uyarıları okudum, aktarıma devam et
                      </Button>
                    </section>
                  )}
                  <h3>Platform sonuçları</h3>
                  {active.submittedInttra && !tmaxxPaused && active.deliveries.some(d=>d.platform==='tmaxx'&&d.status==='failed') && (
                    <div className="form-save actions" style={{bottom:0,position:'sticky',justifyContent:'space-between'}}>
                      <small className="muted">INTTRA gönderildi. Doğrulanan adımlar korunarak kalan T-MAXX aktarımı tamamlanır.</small>
                      <Button disabled={busy} onClick={submitRecord}>{busy ? 'İşlem sürüyor…' : 'Kalan T-MAXX aktarımını tamamla'}</Button>
                    </div>
                  )}
                  {active.deliveries.map((d) => (
                    <div className="delivery" key={d.platform}>
                      <div>
                        <b>
                          {d.kind} / {d.platform === "tmaxx" ? "T-MAXX" : "INTTRA"}
                        </b>
                        <Status status={active.pausedPlatforms?.includes(d.platform) ? "paused" : d.status} />
                      </div>
                      <p>{active.pausedPlatforms?.includes(d.platform) ? "Yeni hesap bekleniyor. Önceki işlem durumu korunuyor; yeniden giriş veya gönderim yapılmıyor." : userMessage(d.message) || "Belge kontrolü bekleniyor."}</p>
                      {d.reference && (
                        <div>
                          <b>
                            {d.platform === "inttra" ? "INTTRA SI No" : "Kayıt referansı"}: {d.reference}
                          </b>
                          <Button variant="ghost" onClick={() => navigator.clipboard.writeText(d.reference!)}>
                            Kopyala
                          </Button>
                        </div>
                      )}
                      {d.platform === "inttra" && d.status === "created" && d.reference && (
                        <>
                          <Button className="inttra-download" variant="outline" disabled={!!downloading} onClick={() => downloadInttra(active)}>
                            {downloading === active.id ? <Loader2 size={16} className="spin" /> : <Download size={16} />} {downloading === active.id ? "PDF hazırlanıyor…" : "INTTRA talimatını indir (PDF)"}
                          </Button>
                          <small>INTTRA’daki gönderilmiş talimatın çıktısıdır. Taşıyıcının düzenlediği MBL belgesinden farklıdır.</small>
                        </>
                      )}
                    </div>
                  ))}
                  <h3>Belgeden alınan bilgiler</h3>
                  {Object.entries(active.fields || {}).map(([key, f]) => (
                    <div className="field" key={key}>
                      <span>{fieldLabels[key] || key}</span>
                      <b>{f.value || "Belgede bulunamadı"}</b>
                      {f.source && <small>Kaynak: {f.source}</small>}
                    </div>
                  ))}
                </div>
              )}
            </SheetContent>
          </Sheet>
          <Sheet open={connectionOpen} onOpenChange={setConnectionOpen}>
            <SheetContent className="detail-sheet">
              <SheetHeader>
                <SheetTitle>Platform bağlantıları</SheetTitle>
                <SheetDescription>Oturum ve kayıt oluşturma hazırlığı</SheetDescription>
              </SheetHeader>
              <div className="detail-body">
                <p className="connection-help">Her platform için giriş bilgilerinizi bir kez kaydedin. Bilgileriniz şifreli saklanır; panel açıldığında oturum otomatik kontrol edilir.</p>
                {connections.map((c) => (
                  <section className="delivery" key={c.id}>
                    <div>
                      <h3>{c.name}</h3>
                      <span className={"status " + (c.connected ? "created" : "blocked")}>{c.paused ? "Duraklatıldı" : connectionBusy ? "Kontrol ediliyor" : c.connected ? "Aktif" : c.credentialsSaved ? "Bağlanamadı" : "Bağlantı bekliyor"}</span>
                    </div>
                    <small>{c.kind}</small>
                    {!c.paused && (
                      <form className="platform-login" onSubmit={(e) => connectPlatform(e, c.id)}>
                        <label htmlFor={c.id + "-username"}>Kullanıcı adı</label>
                        <Input id={c.id + "-username"} name="username" defaultValue={c.username} autoComplete="off" required maxLength={256} />
                        <label htmlFor={c.id + "-password"}>Şifre</label>
                        <Input id={c.id + "-password"} name="password" type="password" autoComplete="new-password" required maxLength={1024} placeholder={c.credentialsSaved ? "Şifre kayıtlı · değiştirmek için yenisini girin" : "Platform şifreniz"} />
                        <Button type="submit" className="primary" disabled={connectionBusy}>
                          {connectionBusy ? <Loader2 className="spin" size={16} /> : <LockKeyhole size={16} />} {c.credentialsSaved ? "Bilgileri güncelle ve bağlan" : "Kaydet ve bağlan"}
                        </Button>
                      </form>
                    )}
                    <p role="status">{userMessage(c.message)}</p>
                  </section>
                ))}
                <Button disabled={connectionBusy} onClick={() => checkConnections(false)} variant="outline">
                  <RefreshCw size={16} className={connectionBusy ? "spin" : ""} /> {connectionBusy ? "Yeniden bağlanıyor…" : connections.some((connection) => !connection.paused && connection.credentialsSaved && !connection.connected) ? "Yeniden bağlan" : "Bağlantıları kontrol et"}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
    </>
  );
}
const fieldLabels: Record<string, string> = {
  description: "Mal tanımı",
  packageCount: "Kap adedi",
  packageType: "Ambalaj türü",
  netWeightKg: "Net ağırlık (kg)",
  grossWeightKg: "Brüt ağırlık (kg)",
  volumeM3: "Hacim (m³)",
  bookingNumber: "Booking numarası",
  shipperName: "HBL gönderen",
  shipperAddress: "HBL gönderen adresi",
  consigneeName: "HBL alıcı",
  consigneeAddress: "HBL alıcı adresi",
  notifyName: "HBL notify",
  notifyAddress: "HBL notify adresi",
  mblShipperName: "MBL gönderen",
  mblShipperAddress: "MBL gönderen adresi",
  mblConsigneeName: "MBL alıcı",
  mblConsigneeAddress: "MBL alıcı adresi",
  mblNotifyName: "MBL notify",
  mblNotifyAddress: "MBL notify adresi",
  loadPort: "Yükleme limanı",
  dischargePort: "Boşaltma limanı",
  vessel: "Gemi",
  voyage: "Sefer",
  containerNumber: "Konteyner numarası",
  containerType: "Konteyner tipi",
  sealNumber: "Mühür numarası",
  hsCode: "HS kodu",
  freightPayment: "Navlun ödeme",
  blType: "Belge tipi",
  reference: "Müşteri referansı",
};
