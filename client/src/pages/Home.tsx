import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpLeft,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogIn,
  Menu,
  Plus,
  Power,
  RotateCcw,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const demoClients = [
  { username: "sara-AR-07", baseName: "sara", trafficGb: "25.00", status: "active", expiresAt: "۱۴۰۵/۰۷/۲۱", ipLimit: 2 },
  { username: "navid-AR-07", baseName: "navid", trafficGb: "10.00", status: "active", expiresAt: "۱۴۰۵/۰۷/۱۳", ipLimit: 1 },
  { username: "mohsen-AR-07", baseName: "mohsen", trafficGb: "50.00", status: "expired", expiresAt: "۱۴۰۵/۰۶/۲۷", ipLimit: 3 },
  { username: "tina-AR-07", baseName: "tina", trafficGb: "8.00", status: "active", expiresAt: "۱۴۰۵/۰۷/۰۹", ipLimit: 1 },
];

const navItems = [
  { label: "داشبورد", icon: LayoutDashboard },
  { label: "کاربران من", icon: Users },
  { label: "اعتبار و مصرف", icon: WalletCards },
  { label: "لاگ فعالیت", icon: ShieldCheck },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function statusLabel(status: string) {
  return status === "active" ? "فعال" : status === "expired" ? "منقضی" : "غیرفعال";
}

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const summaryQuery = trpc.dashboard.summary.useQuery(undefined, { enabled: isAuthenticated });
  const versionQuery = trpc.system.version.useQuery();
  const adminUsersQuery = trpc.admin.users.useQuery(undefined, { enabled: isAuthenticated && user?.role === "admin" });
  const adminResellersQuery = trpc.admin.resellers.useQuery(undefined, { enabled: isAuthenticated && user?.role === "admin" });
  const createClient = trpc.reseller.createClient.useMutation();
  const renewClient = trpc.reseller.renewClient.useMutation();
  const toggleClient = trpc.reseller.toggleClient.useMutation();
  const deleteClient = trpc.reseller.deleteClient.useMutation();
  const syncTraffic = trpc.reseller.syncTraffic.useMutation();
  const availableInboundsQuery = trpc.reseller.availableInbounds.useQuery(undefined, { enabled: isAuthenticated && user?.role !== "admin" });
  const createReseller = trpc.admin.createReseller.useMutation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("داشبورد");
  const [form, setForm] = useState({ nodeId: "", inboundId: "", baseName: "", trafficGb: "10", durationDays: "30", ipLimit: "1" });
  const [adminForm, setAdminForm] = useState({ userId: "", displayName: "", suffixCode: "", creditGb: "100", maxTrafficGb: "50", maxDays: "30", maxIpLimit: "3" });

  const isDemo = !isAuthenticated || !summaryQuery.data;
  const reseller = summaryQuery.data?.role === "reseller" ? summaryQuery.data.reseller : null;
  const clients = (summaryQuery.data?.clients?.length ? summaryQuery.data.clients : demoClients) as Array<{
    username: string;
    baseName?: string;
    trafficGb: string;
    status: string;
    expiresAt: Date | string;
    ipLimit: number;
    id?: number;
    usedTrafficGb?: string;
    lastTrafficSyncAt?: Date | string | null;
    externalId?: string | null;
  }>;
  const suffix = reseller?.suffixCode ?? "AR-07";
  const credit = reseller ? Number(reseller.creditGb) : 186.4;
  const activeCount = clients.filter(client => client.status === "active").length;
  const totalTraffic = clients.reduce((sum, client) => sum + Number(client.trafficGb), 0);
  const usedTraffic = clients.reduce((sum, client) => sum + Number(client.usedTrafficGb ?? 0), 0);
  const generatedUsername = useMemo(() => {
    const base = form.baseName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return base ? `${base}-${suffix}` : `نام‌کاربری-${suffix}`;
  }, [form.baseName, suffix]);

  if (summaryQuery.data?.role === "admin") {
    return <AdminView users={adminUsersQuery.data ?? []} resellers={adminResellersQuery.data ?? []} form={adminForm} setForm={setAdminForm} createReseller={createReseller} />;
  }

  const handleCreate = async () => {
    if (isDemo) {
      toast.success(`پیش‌نمایش ساخته شد: ${generatedUsername}`);
      setIsCreateOpen(false);
      return;
    }
    if (!form.nodeId || !form.inboundId) {
      toast.error("ابتدا یک Inbound اختصاص‌داده‌شده را انتخاب کنید");
      return;
    }
    try {
      await createClient.mutateAsync({
        nodeId: Number(form.nodeId),
        inboundId: Number(form.inboundId),
        baseName: form.baseName,
        trafficGb: Number(form.trafficGb),
        durationDays: Number(form.durationDays),
        ipLimit: Number(form.ipLimit),
      });
      toast.success(`کاربر ${generatedUsername} ساخته شد`);
      setForm({ nodeId: "", inboundId: "", baseName: "", trafficGb: "10", durationDays: "30", ipLimit: "1" });
      setIsCreateOpen(false);
      await summaryQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ساخت کاربر انجام نشد");
    }
  };

  const handleSyncTraffic = async (client: typeof clients[number]) => {
    if (isDemo || !client.id) return toast.info("این رکورد فقط پیش‌نمایش است");
    try {
      await syncTraffic.mutateAsync({ clientId: client.id });
      await summaryQuery.refetch();
      toast.success("مصرف از ثنایی به‌روزرسانی شد");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "همگام‌سازی مصرف ناموفق بود");
    }
  };

  const handleToggle = async (client: typeof clients[number]) => {
    if (isDemo || !client.id) return toast.info("این رکورد فقط پیش‌نمایش است");
    const enable = client.status !== "active";
    try {
      await toggleClient.mutateAsync({ clientId: client.id, enable });
      await summaryQuery.refetch();
      toast.success(enable ? "کاربر فعال شد" : "کاربر غیرفعال شد");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تغییر وضعیت ناموفق بود");
    }
  };

  const handleDelete = async (client: typeof clients[number]) => {
    if (isDemo || !client.id) return toast.info("این رکورد فقط پیش‌نمایش است");
    if (!window.confirm(`کاربر ${client.username} از ثنایی حذف شود؟`)) return;
    try {
      await deleteClient.mutateAsync({ clientId: client.id });
      await summaryQuery.refetch();
      toast.success("کاربر از ثنایی حذف شد");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حذف کاربر ناموفق بود");
    }
  };

  const handleRenew = async (client: typeof clients[number]) => {
    if (isDemo || !client.id) return toast.info("این رکورد فقط پیش‌نمایش است");
    const durationDays = Number(window.prompt("چند روز تمدید شود؟", "30"));
    if (!Number.isInteger(durationDays) || durationDays < 1) return;
    const additionalTrafficGb = Number(window.prompt("حجم اضافه (GB)؛ برای بدون تغییر 0 وارد کنید", "0"));
    if (!Number.isFinite(additionalTrafficGb) || additionalTrafficGb < 0) return;
    try {
      await renewClient.mutateAsync({ clientId: client.id, durationDays, additionalTrafficGb });
      await summaryQuery.refetch();
      toast.success("کاربر با موفقیت تمدید شد");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تمدید کاربر ناموفق بود");
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#f5f7fb] flex items-center justify-center text-slate-500">در حال آماده‌سازی پنل...</div>;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#f5f7fb] text-slate-900 selection:bg-[#d6f7e6] selection:text-[#0b4b39]">
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-[250px] border-l border-slate-200 bg-[#fbfcfe] lg:flex lg:flex-col">
        <div className="flex h-[82px] items-center gap-3 border-b border-slate-200 px-7">
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#0d3b33] text-white shadow-[0_8px_18px_rgba(13,59,51,0.2)]"><KeyRound size={19} /></div>
          <div>
            <p className="text-[15px] font-black tracking-tight text-[#133b35]">NEXORA</p>
            <p className="mt-0.5 text-[9px] font-bold tracking-[0.2em] text-slate-400">XUI DELEGATION</p>
          </div>
        </div>
        <div className="px-4 pt-8">
          <p className="px-3 text-[10px] font-bold tracking-[0.17em] text-slate-400">ناوبری اصلی</p>
          <nav className="mt-3 space-y-1.5">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = item.label === activeNav;
              return <button key={item.label} onClick={() => setActiveNav(item.label)} className={`flex w-full items-center gap-3 rounded-[13px] px-3.5 py-3 text-right text-[13px] font-bold transition-all ${active ? "bg-[#e8f5ef] text-[#12624a] shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}><Icon size={17} strokeWidth={active ? 2.4 : 1.8} /><span>{item.label}</span>{active && <span className="mr-auto h-1.5 w-1.5 rounded-full bg-[#35a477]" />}</button>;
            })}
          </nav>
        </div>
        <div className="mt-auto p-5">
          <div className="overflow-hidden rounded-[18px] bg-[#0d3b33] p-4 text-white">
            <div className="flex items-center justify-between"><span className="text-[11px] font-bold text-[#b8e5d1]">امنیت فعال</span><ShieldCheck size={16} className="text-[#7be0b3]" /></div>
            <p className="mt-3 text-[12px] font-medium leading-6 text-white/70">هر کاربر با مالکیت نماینده و کد اختصاصی ثبت می‌شود.</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[88%] rounded-full bg-[#78dcad]" /></div>
            <p className="mt-2 text-[10px] text-white/45">پوشش کنترل دسترسی ۸۸٪</p>
          </div>
        </div>
      </aside>

      <main className="min-h-screen lg:mr-[250px]">
        <header className="sticky top-0 z-20 flex h-[82px] items-center justify-between border-b border-slate-200/80 bg-[#f5f7fb]/90 px-5 backdrop-blur-xl sm:px-8 lg:px-11">
          <div className="flex items-center gap-3"><button className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 lg:hidden"><Menu size={18} /></button><div><p className="text-[11px] font-bold text-slate-400">چهارشنبه، ۲۵ شهریور ۱۴۰۵</p><h1 className="mt-1 text-[17px] font-black tracking-tight text-[#163e37]">مرکز کنترل نمایندگی</h1></div></div>
          <div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded-full border border-[#cfe8dc] bg-[#eef9f3] px-3 py-2 text-[11px] font-bold text-[#267656] sm:flex"><span className="h-2 w-2 animate-pulse rounded-full bg-[#36b47d]" /> اتصال امن برقرار است</div><span className="hidden rounded-full border border-slate-200 bg-white px-3 py-2 font-mono text-[10px] font-bold text-slate-400 sm:inline">v{versionQuery.data?.current ?? "1.2.0"}</span><div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1.5 pl-3 shadow-sm"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dff3e8] text-xs font-black text-[#12624a]">{user?.name?.slice(0, 1) ?? "AR"}</div><span className="hidden text-[12px] font-bold text-slate-700 sm:block">{user?.name ?? "نماینده آزمایشی"}</span><ChevronDown size={14} className="text-slate-400" /></div></div>
        </header>

        <div className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 lg:px-11 lg:py-9">
          <section className="relative overflow-hidden rounded-[28px] bg-[#0d3b33] px-7 py-8 text-white shadow-[0_18px_45px_rgba(13,59,51,0.14)] sm:px-10 sm:py-10">
            <div className="absolute -left-20 -top-28 h-72 w-72 rounded-full border-[30px] border-white/[0.04]" /><div className="absolute bottom-[-120px] right-[38%] h-72 w-72 rounded-full border-[44px] border-[#86e0b7]/[0.05]" />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_340px]">
              <div><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[10px] font-bold tracking-wider text-[#bdecd5]"><Gauge size={13} /> نسخه MVP امن و مالکیت‌محور</div><h2 className="max-w-[610px] text-3xl font-black leading-[1.35] tracking-tight sm:text-[38px]">فروش امن،<br /><span className="text-[#88e3b7]">مالکیت روشن.</span></h2><p className="mt-4 max-w-[570px] text-[13px] font-medium leading-7 text-white/65">برای هر نماینده یک کد اختصاصی تعریف کن؛ هر کاربری که می‌سازد با همان پسوند ثبت می‌شود و تداخل نام بین نماینده‌ها از ریشه کنترل می‌شود.</p><div className="mt-7 flex flex-wrap items-center gap-3"><Button onClick={() => setIsCreateOpen(true)} className="h-11 rounded-xl bg-[#9ae6c3] px-5 text-[12px] font-black text-[#0d3b33] hover:bg-[#b3f0d3]"><Plus size={16} className="ml-2" /> ساخت کاربر جدید</Button><button onClick={() => toast.info("اتصال به API v3.8.0 فعال است؛ از بخش مدیریت Node و Inbound را بررسی کنید")} className="flex h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-[12px] font-bold text-white/80 transition hover:bg-white/10">راهنمای اتصال <ArrowLeft size={15} /></button></div></div>
              <div className="relative rounded-[22px] border border-white/10 bg-white/[0.07] p-5 backdrop-blur-sm"><div className="flex items-center justify-between"><span className="text-[11px] font-bold text-white/55">کد اختصاصی شما</span><span className="rounded-full bg-[#85e1b5]/15 px-2 py-1 text-[9px] font-bold text-[#9ae6c3]">Unique</span></div><div className="mt-5 flex items-center gap-3"><span className="font-mono text-4xl font-black tracking-[0.12em] text-white">{suffix}</span><button onClick={() => { navigator.clipboard?.writeText(suffix); toast.success("کد کپی شد"); }} className="rounded-lg p-2 text-white/45 transition hover:bg-white/10 hover:text-white"><Copy size={16} /></button></div><div className="my-5 h-px bg-white/10" /><p className="text-[11px] leading-6 text-white/55">نمونه نام خروجی</p><p className="mt-1 font-mono text-[15px] font-bold text-[#9ae6c3]">sara-{suffix}</p><div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-[#bdecd5]"><Check size={13} /> غیرقابل تکرار در کل پنل</div></div>
            </div>
          </section>

          <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="اعتبار باقی‌مانده" value={credit.toFixed(1)} unit="GB" icon={WalletCards} accent="green" trend="+۱۲٪ این ماه" />
            <StatCard label="کل کاربران ساخته‌شده" value={formatNumber(clients.length)} unit="کاربر" icon={Users} accent="blue" trend="+۸ این هفته" />
            <StatCard label="کاربران فعال" value={formatNumber(activeCount)} unit="نفر" icon={ShieldCheck} accent="purple" trend={`${Math.round((activeCount / Math.max(clients.length, 1)) * 100)}٪ از کل`} />
            <StatCard label="مصرف همگام‌شده" value={usedTraffic.toFixed(1)} unit="GB" icon={ArrowUpLeft} accent="orange" trend={`از ${totalTraffic.toFixed(1)} GB تخصیص‌یافته`} />
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_340px]">
            <div className="rounded-[22px] border border-slate-200/90 bg-white p-5 shadow-[0_8px_28px_rgba(34,55,75,0.04)] sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="text-[16px] font-black text-[#173f38]">آخرین کاربران</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{formatNumber(clients.length)} رکورد</span></div><p className="mt-1 text-[11px] text-slate-400">تمام کاربران با پسوند {suffix} قابل ردیابی هستند.</p></div><div className="flex items-center gap-2"><button onClick={() => summaryQuery.refetch()} className="rounded-xl border border-slate-200 p-2.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"><RefreshCw size={15} /></button><Button variant="outline" onClick={() => setActiveNav("کاربران من")} className="h-10 rounded-xl border-slate-200 px-3 text-[11px] font-bold">مشاهده همه <ArrowLeft size={14} className="mr-2" /></Button></div></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[980px] text-right"><thead><tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400"><th className="pb-3 pr-2">نام کاربری</th><th className="pb-3">حجم / مصرف</th><th className="pb-3">انقضا</th><th className="pb-3">IP Limit</th><th className="pb-3">وضعیت</th><th className="pb-3 pl-2">عملیات</th></tr></thead><tbody>{clients.map((client, index) => <tr key={`${client.username}-${index}`} className="group border-b border-slate-50 text-[12px] last:border-0"><td className="py-4 pr-2"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#edf8f2] text-[10px] font-black text-[#19805b]">{(client.baseName ?? client.username).slice(0, 2).toUpperCase()}</div><div><p className="font-mono text-[12px] font-bold text-slate-700">{client.username}</p><p className="mt-0.5 text-[10px] text-slate-400">مالک: شما</p></div></div></td><td className="py-4 font-bold text-slate-600"><span>{Number(client.trafficGb).toFixed(0)} GB</span><span className="mt-1 block text-[10px] font-medium text-slate-400">مصرف: {Number(client.usedTrafficGb ?? 0).toFixed(2)} GB</span></td><td className="py-4 text-slate-500">{typeof client.expiresAt === "string" ? client.expiresAt : new Date(client.expiresAt).toLocaleDateString("fa-IR")}</td><td className="py-4 text-slate-500">{client.ipLimit}</td><td className="py-4"><Badge className={`rounded-full border-0 px-2.5 py-1 text-[10px] ${client.status === "active" ? "bg-[#e8f8ef] text-[#18734f]" : "bg-[#fff0e9] text-[#b55a2e]"}`}>{statusLabel(client.status)}</Badge></td><td className="py-4 pl-2"><div className="flex items-center gap-1"><button title="همگام‌سازی مصرف" onClick={() => handleSyncTraffic(client)} className="rounded-lg p-2 text-slate-300 transition hover:bg-[#e8f5ef] hover:text-[#18734f]"><RefreshCw size={14} /></button><button title="تمدید" onClick={() => handleRenew(client)} className="rounded-lg p-2 text-slate-300 transition hover:bg-[#fff3df] hover:text-[#a66a1c]"><RotateCcw size={14} /></button><button title={client.status === "active" ? "غیرفعال‌سازی" : "فعال‌سازی"} onClick={() => handleToggle(client)} className="rounded-lg p-2 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"><Power size={14} /></button><button title="حذف از ثنایی" onClick={() => handleDelete(client)} className="rounded-lg p-2 text-slate-300 transition hover:bg-[#fff0e9] hover:text-[#b55a2e]"><Trash2 size={14} /></button><button title="کپی نام کاربری" onClick={() => { navigator.clipboard?.writeText(client.username); toast.success("نام کاربری کپی شد"); }} className="rounded-lg p-2 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"><Copy size={14} /></button></div></td></tr>)}</tbody></table></div></div>
            <div className="rounded-[22px] border border-slate-200/90 bg-white p-6 shadow-[0_8px_28px_rgba(34,55,75,0.04)]"><div className="flex items-center justify-between"><div><h3 className="text-[16px] font-black text-[#173f38]">قوانین نمایندگی</h3><p className="mt-1 text-[11px] text-slate-400">محدودیت‌های اعمال‌شده توسط مدیر</p></div><CircleAlert size={17} className="text-[#e5a04a]" /></div><div className="mt-6 space-y-4"><Rule label="حداکثر حجم هر کاربر" value={`${reseller ? Number(reseller.maxTrafficGb) || "بدون سقف" : 50} GB`} /><Rule label="حداکثر روز اعتبار" value={`${reseller?.maxDays ?? 30} روز`} /><Rule label="حداکثر IP Limit" value={`${reseller?.maxIpLimit ?? 3} دستگاه`} /><Rule label="شناسه مالکیت" value={suffix} mono /></div><div className="mt-6 rounded-[14px] bg-[#f6faf8] p-3.5 text-[11px] font-medium leading-6 text-slate-500"><span className="font-bold text-[#17724f]">نکته:</span> کد نمایندگی بخشی از Username است و توسط Backend قابل حذف یا دورزدن نیست.</div></div>
          </section>
        </div>
      </main>

      {isCreateOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#092d26]/35 p-4 backdrop-blur-sm"><div className="w-full max-w-[490px] rounded-[26px] border border-slate-200 bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9f7ef] text-[#147350]"><Plus size={19} /></div><h3 className="text-[19px] font-black text-[#173f38]">ساخت کاربر جدید</h3><p className="mt-1 text-[11px] text-slate-400">پسوند نماینده به‌صورت خودکار اضافه می‌شود.</p></div><button onClick={() => setIsCreateOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><div className="mt-7 space-y-4"><div><Label className="mb-2 block text-[11px] font-bold text-slate-600">Inbound مجاز</Label><select value={form.inboundId} onChange={event => { const inboundId = event.target.value; const inbound = availableInboundsQuery.data?.find(item => String(item.id) === inboundId); setForm({ ...form, inboundId, nodeId: inbound ? String(inbound.nodeId) : "" }); }} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] outline-none focus:border-[#52b98d]"><option value="">انتخاب Inbound اختصاص‌داده‌شده</option>{availableInboundsQuery.data?.map(inbound => <option key={inbound.id} value={inbound.id}>{inbound.remark} — {inbound.protocol ?? "-"}:{inbound.port ?? "-"}</option>)}</select>{isAuthenticated && !availableInboundsQuery.data?.length && <p className="mt-2 text-[10px] font-bold text-[#b55a2e]">مدیر هنوز Inboundی به شما اختصاص نداده است.</p>}</div><div><Label className="mb-2 block text-[11px] font-bold text-slate-600">نام پایه کاربر</Label><Input dir="ltr" value={form.baseName} onChange={event => setForm({ ...form, baseName: event.target.value })} placeholder="مثلاً sara" className="h-11 rounded-xl border-slate-200 text-left font-mono text-sm" /></div><div className="rounded-xl border border-[#cfe8dc] bg-[#f3fbf6] p-3"><div className="flex items-center justify-between text-[10px] font-bold text-slate-400"><span>نام نهایی در 3x-ui</span><span className="text-[#18734f]">قفل‌شده</span></div><p dir="ltr" className="mt-1 font-mono text-[15px] font-black text-[#176e4d]">{generatedUsername}</p></div><div className="grid grid-cols-3 gap-3"><div><Label className="mb-2 block text-[11px] font-bold text-slate-600">حجم (GB)</Label><Input type="number" min="1" dir="ltr" value={form.trafficGb} onChange={event => setForm({ ...form, trafficGb: event.target.value })} className="h-11 rounded-xl border-slate-200 text-left" /></div><div><Label className="mb-2 block text-[11px] font-bold text-slate-600">روز</Label><Input type="number" min="1" dir="ltr" value={form.durationDays} onChange={event => setForm({ ...form, durationDays: event.target.value })} className="h-11 rounded-xl border-slate-200 text-left" /></div><div><Label className="mb-2 block text-[11px] font-bold text-slate-600">IP Limit</Label><Input type="number" min="1" dir="ltr" value={form.ipLimit} onChange={event => setForm({ ...form, ipLimit: event.target.value })} className="h-11 rounded-xl border-slate-200 text-left" /></div></div></div><div className="mt-7 flex gap-3"><Button onClick={handleCreate} disabled={!form.baseName || createClient.isPending} className="h-11 flex-1 rounded-xl bg-[#0d3b33] text-[12px] font-black hover:bg-[#145346]">{createClient.isPending ? "در حال ساخت..." : "تأیید و ساخت کاربر"}</Button><Button variant="outline" onClick={() => setIsCreateOpen(false)} className="h-11 rounded-xl border-slate-200 px-5 text-[12px] font-bold">انصراف</Button></div></div></div>}
    </div>
  );
}

type AdminUser = { id: number; name?: string | null; email?: string | null; role: string };
type AdminReseller = { id: number; userId: number; displayName: string; suffixCode: string; creditGb: string; maxTrafficGb: string; maxDays: number; maxIpLimit: number; status: string };
type AdminNode = { id: number; name: string; baseUrl: string; status: string; lastSyncAt?: Date | string | null; lastError?: string | null };
type AdminInbound = { id: number; nodeId: number; remoteId: number; remark: string; protocol?: string | null; port?: number | null };

type AdminForm = { userId: string; displayName: string; suffixCode: string; creditGb: string; maxTrafficGb: string; maxDays: string; maxIpLimit: string };

function AdminView({ users, resellers, form, setForm, createReseller }: { users: AdminUser[]; resellers: AdminReseller[]; form: AdminForm; setForm: React.Dispatch<React.SetStateAction<AdminForm>>; createReseller: ReturnType<typeof trpc.admin.createReseller.useMutation> }) {
  const updateQuery = trpc.system.checkForUpdates.useQuery();
  const nodesQuery = trpc.admin.xuiNodes.useQuery();
  const inboundsQuery = trpc.admin.xuiInbounds.useQuery();
  const addNode = trpc.admin.addXuiNode.useMutation();
  const syncNode = trpc.admin.syncXuiNode.useMutation();
  const saveAccess = trpc.admin.saveResellerAccess.useMutation();
  const [nodeForm, setNodeForm] = useState({ name: "", baseUrl: "", apiToken: "" });
  const [selectedResellerId, setSelectedResellerId] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<number[]>([]);
  const [selectedInboundIds, setSelectedInboundIds] = useState<number[]>([]);
  const accessQuery = trpc.admin.resellerAccess.useQuery({ resellerId: Number(selectedResellerId) || 0 }, { enabled: Boolean(selectedResellerId) });

  useEffect(() => {
    if (accessQuery.data) {
      setSelectedNodeIds(accessQuery.data.nodeIds);
      setSelectedInboundIds(accessQuery.data.inboundIds);
    }
  }, [accessQuery.data]);

  const submit = async () => {
    if (!form.userId || !form.displayName || !form.suffixCode) {
      toast.error("کاربر، نام نماینده و کد پسوند را وارد کنید");
      return;
    }
    try {
      await createReseller.mutateAsync({ userId: Number(form.userId), displayName: form.displayName, suffixCode: form.suffixCode, creditGb: Number(form.creditGb), maxTrafficGb: Number(form.maxTrafficGb), maxDays: Number(form.maxDays), maxIpLimit: Number(form.maxIpLimit) });
      toast.success("نماینده با موفقیت ساخته شد");
      setForm({ userId: "", displayName: "", suffixCode: "", creditGb: "100", maxTrafficGb: "50", maxDays: "30", maxIpLimit: "3" });
    } catch (error) { toast.error(error instanceof Error ? error.message : "ساخت نماینده انجام نشد"); }
  };

  const submitNode = async () => {
    if (!nodeForm.name || !nodeForm.baseUrl || !nodeForm.apiToken) { toast.error("نام، آدرس HTTPS و API Token را وارد کنید"); return; }
    try {
      const result = await addNode.mutateAsync(nodeForm);
      toast.success(`پنل ثبت شد و ${result.inboundCount} اینباند همگام شد`);
      setNodeForm({ name: "", baseUrl: "", apiToken: "" });
      await Promise.all([nodesQuery.refetch(), inboundsQuery.refetch()]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "اتصال به 3x-ui ناموفق بود"); }
  };

  const toggle = (value: number, values: number[], setter: (next: number[]) => void) => setter(values.includes(value) ? values.filter(item => item !== value) : [...values, value]);

  const submitAccess = async () => {
    if (!selectedResellerId) { toast.error("ابتدا نماینده را انتخاب کنید"); return; }
    try { await saveAccess.mutateAsync({ resellerId: Number(selectedResellerId), nodeIds: selectedNodeIds, inboundIds: selectedInboundIds }); toast.success("دسترسی‌های نماینده ذخیره شد"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "ذخیره دسترسی انجام نشد"); }
  };

  return <div dir="rtl" className="min-h-screen bg-[#f5f7fb] text-slate-900">
    <header className="flex h-[82px] items-center justify-between border-b border-slate-200/80 bg-white px-5 sm:px-10"><div><p className="text-[11px] font-bold text-slate-400">مدیریت دسترسی و نسخه</p><h1 className="mt-1 text-[18px] font-black text-[#163e37]">پنل مدیر سیستم</h1></div><div className="flex items-center gap-2"><span className={`hidden rounded-full px-3 py-2 text-[10px] font-bold sm:inline ${updateQuery.data?.updateAvailable ? "bg-[#fff3df] text-[#a66a1c]" : "bg-slate-100 text-slate-500"}`}>{updateQuery.data?.updateAvailable ? `نسخه جدید ${updateQuery.data.latest} موجود است` : `نسخه ${updateQuery.data?.current ?? "1.2.0"}`}</span><div className="flex items-center gap-2 rounded-full bg-[#e8f5ef] px-3 py-2 text-[11px] font-bold text-[#12624a]"><ShieldCheck size={15} /> کنترل مالکیت فعال است</div></div></header>
    <main className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10">
      <section className="rounded-[26px] bg-[#0d3b33] p-7 text-white shadow-[0_18px_45px_rgba(13,59,51,0.14)] sm:p-9"><div className="flex flex-wrap items-end justify-between gap-6"><div><span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold text-[#bdecd5]">Admin / XUI Control Center</span><h2 className="mt-5 text-3xl font-black tracking-tight">اتصال واقعی به پنل‌های ثنایی</h2><p className="mt-3 max-w-[720px] text-[13px] leading-7 text-white/65">آدرس پنل و API Token را اضافه کنید؛ این سیستم اینباندها را Sync می‌کند و سپس دسترسی هر نماینده را محدود می‌سازد.</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.08] px-5 py-4"><p className="text-[10px] text-white/50">پنل‌های متصل</p><p className="mt-2 text-3xl font-black text-[#9ae6c3]">{nodesQuery.data?.length ?? 0}</p></div></div></section>
      <section className="mt-7 grid gap-6 lg:grid-cols-[380px_1fr]"><div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f5ef] text-[#18734f]"><Plus size={18} /></div><div><h3 className="text-[16px] font-black text-[#173f38]">نماینده جدید</h3><p className="mt-1 text-[10px] text-slate-400">کد را مثل AR-07 انتخاب کنید.</p></div></div><div className="mt-6 space-y-4"><div><Label className="mb-2 block text-[11px] font-bold text-slate-600">کاربر سیستم</Label><select value={form.userId} onChange={event => setForm({ ...form, userId: event.target.value })} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] outline-none focus:border-[#52b98d]"><option value="">انتخاب کاربر OAuth</option>{users.filter(item => item.role !== "admin").map(item => <option key={item.id} value={item.id}>{item.name || item.email || `User #${item.id}`}</option>)}</select></div><AdminField label="نام نماینده" value={form.displayName} onChange={value => setForm({ ...form, displayName: value })} placeholder="مثلاً آرمان نت" /><AdminField label="کد پسوند یکتا" value={form.suffixCode} onChange={value => setForm({ ...form, suffixCode: value.toUpperCase() })} placeholder="مثلاً AR-07" mono /><div className="grid grid-cols-2 gap-3"><AdminField label="اعتبار اولیه (GB)" value={form.creditGb} onChange={value => setForm({ ...form, creditGb: value })} type="number" /><AdminField label="سقف هر کاربر (GB)" value={form.maxTrafficGb} onChange={value => setForm({ ...form, maxTrafficGb: value })} type="number" /><AdminField label="حداکثر روز" value={form.maxDays} onChange={value => setForm({ ...form, maxDays: value })} type="number" /><AdminField label="حداکثر IP" value={form.maxIpLimit} onChange={value => setForm({ ...form, maxIpLimit: value })} type="number" /></div></div><Button onClick={submit} disabled={createReseller.isPending} className="mt-6 h-11 w-full rounded-xl bg-[#0d3b33] text-[12px] font-black hover:bg-[#145346]">{createReseller.isPending ? "در حال ثبت..." : "ثبت نماینده"}</Button></div>
        <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-[16px] font-black text-[#173f38]">نمایندگان و مالکیت</h3><p className="mt-1 text-[11px] text-slate-400">کد پسوند و دسترسی API برای هر نماینده مستقل است.</p></div><Badge className="rounded-full border-0 bg-[#e8f5ef] px-3 py-1 text-[10px] text-[#18734f]">{resellers.length} نماینده</Badge></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[620px] text-right"><thead><tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400"><th className="pb-3 pr-2">نماینده</th><th className="pb-3">کد مالکیت</th><th className="pb-3">اعتبار</th><th className="pb-3">قوانین</th><th className="pb-3">وضعیت</th></tr></thead><tbody>{resellers.length ? resellers.map(reseller => <tr key={reseller.id} className="border-b border-slate-50 text-[12px] last:border-0"><td className="py-4 pr-2"><p className="font-bold text-slate-700">{reseller.displayName}</p><p className="mt-1 text-[10px] text-slate-400">User ID: {reseller.userId}</p></td><td className="py-4"><span className="rounded-lg bg-[#f0faf5] px-2.5 py-1.5 font-mono text-[12px] font-black text-[#18734f]">{reseller.suffixCode}</span></td><td className="py-4 font-bold text-slate-600">{Number(reseller.creditGb).toFixed(1)} GB</td><td className="py-4 text-slate-500">{Number(reseller.maxTrafficGb) || "∞"} GB / {reseller.maxDays} روز</td><td className="py-4"><Badge className="rounded-full border-0 bg-[#e8f8ef] px-2.5 py-1 text-[10px] text-[#18734f]">فعال</Badge></td></tr>) : <tr><td colSpan={5} className="py-16 text-center text-[12px] text-slate-400">هنوز نماینده‌ای ثبت نشده است.</td></tr>}</tbody></table></div></div></section>
      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]"><div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-[16px] font-black text-[#173f38]">پنل‌های ثنایی و Inboundها</h3><p className="mt-1 text-[11px] text-slate-400">Token در Backend به‌صورت AES-256-GCM رمزنگاری می‌شود.</p></div><Badge className="rounded-full border-0 bg-[#e8f5ef] px-3 py-1 text-[10px] text-[#18734f]">{nodesQuery.data?.length ?? 0} Node / {inboundsQuery.data?.length ?? 0} Inbound</Badge></div><div className="mt-5 space-y-3">{(nodesQuery.data as AdminNode[] | undefined)?.map(node => <div key={node.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><p className="text-[12px] font-black text-slate-700">{node.name}</p><p dir="ltr" className="mt-1 font-mono text-[10px] text-slate-400">{node.baseUrl}</p></div><div className="flex items-center gap-2"><Badge className={`rounded-full border-0 px-2 py-1 text-[10px] ${node.status === "active" ? "bg-[#e8f8ef] text-[#18734f]" : "bg-[#fff0e9] text-[#b55a2e]"}`}>{node.status === "active" ? "متصل" : "خطا"}</Badge><Button variant="outline" onClick={async () => { try { await syncNode.mutateAsync({ nodeId: node.id }); await inboundsQuery.refetch(); toast.success("Inboundها Sync شدند"); } catch (error) { toast.error(error instanceof Error ? error.message : "Sync ناموفق بود"); } }} className="h-8 rounded-lg px-3 text-[10px]">Sync</Button></div></div>)}{!nodesQuery.data?.length && <p className="py-8 text-center text-[12px] text-slate-400">هنوز پنل ثنایی اضافه نشده است.</p>}</div></div><div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-[16px] font-black text-[#173f38]">افزودن پنل ثنایی</h3><p className="mt-1 text-[11px] text-slate-400">بعد از ثبت، اتصال و لیست Inboundها تست می‌شود.</p><div className="mt-5 space-y-3"><AdminField label="نام پنل" value={nodeForm.name} onChange={value => setNodeForm({ ...nodeForm, name: value })} placeholder="Node اصلی" /><AdminField label="آدرس HTTPS پنل" value={nodeForm.baseUrl} onChange={value => setNodeForm({ ...nodeForm, baseUrl: value })} placeholder="https://panel.example.com" mono /><AdminField label="API Token" value={nodeForm.apiToken} onChange={value => setNodeForm({ ...nodeForm, apiToken: value })} placeholder="Token فقط در Backend ذخیره می‌شود" mono /><Button onClick={submitNode} disabled={addNode.isPending} className="h-11 w-full rounded-xl bg-[#0d3b33] text-[12px] font-black hover:bg-[#145346]">{addNode.isPending ? "در حال تست اتصال..." : "اتصال و Sync پنل"}</Button></div></div></section>
      <section className="mt-6 rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-4"><div><h3 className="text-[16px] font-black text-[#173f38]">تخصیص دسترسی Inbound به نماینده</h3><p className="mt-1 text-[11px] text-slate-400">نماینده فقط Inboundهای انتخاب‌شده را در فرم ساخت کاربر می‌بیند.</p></div><div className="flex items-center gap-2"><select value={selectedResellerId} onChange={event => { setSelectedResellerId(event.target.value); setSelectedNodeIds([]); setSelectedInboundIds([]); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold"><option value="">انتخاب نماینده</option>{resellers.map(reseller => <option key={reseller.id} value={reseller.id}>{reseller.displayName} — {reseller.suffixCode}</option>)}</select><Button onClick={submitAccess} disabled={!selectedResellerId || saveAccess.isPending} className="h-10 rounded-xl bg-[#0d3b33] px-4 text-[11px] font-black">ذخیره دسترسی</Button></div></div><div className="mt-6 grid gap-6 md:grid-cols-2"><div><p className="mb-3 text-[11px] font-black text-slate-600">پنل‌های مجاز</p><div className="space-y-2">{(nodesQuery.data as AdminNode[] | undefined)?.map(node => <label key={node.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-[11px] font-bold text-slate-600"><input type="checkbox" checked={selectedNodeIds.includes(node.id)} onChange={() => toggle(node.id, selectedNodeIds, setSelectedNodeIds)} /> <span>{node.name}</span><span className="mr-auto font-mono text-[9px] text-slate-400">{node.status}</span></label>)}</div></div><div><p className="mb-3 text-[11px] font-black text-slate-600">Inboundهای مجاز</p><div className="max-h-48 space-y-2 overflow-y-auto">{(inboundsQuery.data as AdminInbound[] | undefined)?.map(inbound => <label key={inbound.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-[11px] font-bold text-slate-600"><input type="checkbox" checked={selectedInboundIds.includes(inbound.id)} onChange={() => toggle(inbound.id, selectedInboundIds, setSelectedInboundIds)} /> <span>{inbound.remark}</span><span className="mr-auto font-mono text-[9px] text-slate-400">{inbound.protocol ?? "-"}:{inbound.port ?? "-"}</span></label>)}</div></div></div></section>
    </main>
  </div>;
}

function AdminField({ label, value, onChange, placeholder, type = "text", mono }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; mono?: boolean }) {
  return <div><Label className="mb-2 block text-[11px] font-bold text-slate-600">{label}</Label><Input type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} dir={mono || type === "number" ? "ltr" : "rtl"} className={`h-11 rounded-xl border-slate-200 text-[12px] ${mono ? "font-mono text-left" : ""}`} /></div>;
}

function AdminNote({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return <div className="rounded-xl bg-[#f7faf9] p-3"><Icon size={15} className="text-[#2e9b70]" /><p className="mt-2 text-[11px] font-black text-slate-700">{title}</p><p className="mt-1 text-[10px] leading-5 text-slate-400">{text}</p></div>;
}

function StatCard({ label, value, unit, icon: Icon, accent, trend }: { label: string; value: string; unit: string; icon: typeof WalletCards; accent: string; trend: string }) {
  const colors: Record<string, string> = { green: "bg-[#e8f8ef] text-[#18815b]", blue: "bg-[#ebf3ff] text-[#3d77c5]", purple: "bg-[#f2edff] text-[#7654be]", orange: "bg-[#fff3e6] text-[#c57b38]" };
  return <div className="rounded-[20px] border border-slate-200/90 bg-white p-5 shadow-[0_8px_28px_rgba(34,55,75,0.035)]"><div className="flex items-start justify-between"><div className={`flex h-10 w-10 items-center justify-center rounded-[13px] ${colors[accent]}`}><Icon size={18} /></div><span className="text-[10px] font-bold text-slate-400">{trend}</span></div><div className="mt-5 flex items-end gap-2"><strong className="text-[27px] font-black tracking-tight text-[#173f38]">{value}</strong><span className="mb-1 text-[11px] font-bold text-slate-400">{unit}</span></div><p className="mt-1 text-[11px] font-medium text-slate-400">{label}</p></div>;
}

function Rule({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0"><span className="text-[11px] font-medium text-slate-500">{label}</span><span className={`text-[12px] font-black text-slate-700 ${mono ? "font-mono text-[#18734f]" : ""}`}>{value}</span></div>;
}
