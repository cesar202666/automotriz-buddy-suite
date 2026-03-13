import { useState, useRef } from "react";
import { Plus, Search, Edit2, Trash2, Phone, Mail, Download, Upload, X, Table } from "lucide-react";
import { useApp, Cliente } from "@/context/AppContext";
import * as XLSX from "xlsx";

const MASTER_PASS = "123cuatro";

const emptyForm = (): Omit<Cliente, "id"> => ({
  nombres: "", apellidos: "", direccion: "", telefono: "", email: "",
  rut: null, comentario: null, estadoCivil: null, ciudad: null,
  casaHabita: null, estudios: null,
  seguimiento: null,
  seguimientoComentario1: null, seguimientoComentario2: null, seguimientoComentario3: null,
  creadoPor: null,
});

function DeleteModal({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(false);
  const submit = () => {
    if (pass === MASTER_PASS) onConfirm();
    else { setErr(true); setPass(""); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="bg-card rounded-xl shadow-2xl p-7 w-80 animate-fade-in" style={{ border: "1px solid hsl(var(--border))" }}>
        <h3 className="font-bold text-sm mb-1" style={{ color: "hsl(var(--destructive))" }}>Eliminar {label}</h3>
        <p className="text-xs mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>Ingresa la clave de Administrador Master para confirmar.</p>
        <input type="password" className={`w-full border rounded px-3 py-2 text-sm bg-background mb-2 ${err ? "border-destructive" : ""}`}
          style={{ borderColor: err ? "hsl(var(--destructive))" : "hsl(var(--border))" }}
          placeholder="Clave master" value={pass} onChange={e => { setPass(e.target.value); setErr(false); }}
          onKeyDown={e => e.key === "Enter" && submit()} autoFocus />
        {err && <p className="text-xs mb-2" style={{ color: "hsl(var(--destructive))" }}>Clave incorrecta</p>}
        <div className="flex gap-2 justify-end mt-3">
          <button onClick={onCancel} className="px-3 py-1.5 rounded border text-sm hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
          <button onClick={submit} className="px-3 py-1.5 rounded text-sm font-medium text-white" style={{ background: "hsl(var(--destructive))" }}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}

const SEGUIMIENTO_LABELS: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: "Seguimiento 1", color: "#0ea5e9", bg: "#e0f2fe" },
  2: { label: "Seguimiento 2", color: "#f59e0b", bg: "#fef3c7" },
  3: { label: "Seguimiento 3", color: "#22c55e", bg: "#dcfce7" },
};

export default function Clientes() {
  const { clientes, setClientes, usuarioActual } = useApp();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Cliente, "id">>(emptyForm());
  const excelImportRef = useRef<HTMLInputElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const exportExcel = () => {
    const data = clientes.map(c => ({
      ID: c.id, Nombres: c.nombres, Apellidos: c.apellidos,
      RUT: c.rut || "", Telefono: c.telefono, Email: c.email, Direccion: c.direccion,
      Comentario: c.comentario || "", Seguimiento: c.seguimiento || "",
      CreadoPor: c.creadoPor || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "clientes.xlsx");
  };

  const importExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);
      const nuevos: Cliente[] = rows.map((r, i) => ({
        id: r["ID"] || String(Date.now() + i),
        nombres: r["Nombres"] || "",
        apellidos: r["Apellidos"] || "",
        telefono: r["Telefono"] || "",
        email: r["Email"] || "",
        direccion: r["Direccion"] || "",
        rut: r["RUT"] || null,
        comentario: r["Comentario"] || null,
        estadoCivil: null, ciudad: null, casaHabita: null, estudios: null,
        seguimiento: null,
        seguimientoComentario1: null, seguimientoComentario2: null, seguimientoComentario3: null,
        creadoPor: r["CreadoPor"] || null,
      }));
      setClientes([...clientes, ...nuevos]);
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const filtered = clientes.filter(c =>
    `${c.nombres} ${c.apellidos} ${c.id} ${c.email} ${c.rut || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const nextId = () => String(Math.max(...clientes.map(c => parseInt(c.id) || 100), 100) + 1);

  const openCreate = () => {
    const base = emptyForm();
    base.creadoPor = usuarioActual ? `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim() : null;
    setForm(base);
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (c: Cliente) => {
    setForm({
      nombres: c.nombres, apellidos: c.apellidos, direccion: c.direccion,
      telefono: c.telefono, email: c.email, rut: c.rut, comentario: c.comentario,
      estadoCivil: c.estadoCivil, ciudad: c.ciudad, casaHabita: c.casaHabita, estudios: c.estudios,
      seguimiento: c.seguimiento,
      seguimientoComentario1: c.seguimientoComentario1,
      seguimientoComentario2: c.seguimientoComentario2,
      seguimientoComentario3: c.seguimientoComentario3,
      creadoPor: c.creadoPor,
    });
    setEditId(c.id);
    setShowModal(true);
  };

  const doDelete = () => {
    if (deleteId) setClientes(clientes.filter(c => c.id !== deleteId));
    setDeleteId(null);
  };

  const handleSave = () => {
    if (!form.nombres.trim() || !form.apellidos.trim()) return alert("Nombres y Apellidos son requeridos.");
    if (!form.telefono.trim()) return alert("El teléfono es obligatorio.");
    if (editId) {
      setClientes(clientes.map(c => c.id === editId ? { ...c, ...form } : c));
    } else {
      setClientes([...clientes, { id: nextId(), ...form }]);
    }
    setShowModal(false);
  };

  const seguimientoInfo = (s: 1 | 2 | 3 | null) => s ? SEGUIMIENTO_LABELS[s] : null;

  return (
    <div>
      {deleteId && (
        <DeleteModal
          label="Cliente"
          onConfirm={doDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Directorio de Clientes</h1>
          <p className="page-subtitle">{clientes.length} clientes registrados en sistema</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => excelImportRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>
            <Upload size={15} /> Importar Excel
          </button>
          <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>
            <Table size={15} /> Exportar Excel
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>
            <Plus size={16} /> Registrar Cliente
          </button>
          <input ref={excelImportRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} />
        </div>
      </div>

      <div className="relative mb-4 max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
        <input className="w-full pl-9 pr-3 py-2 rounded-md border text-sm bg-card"
          style={{ borderColor: "hsl(var(--border))" }}
          placeholder="Buscar por nombre, ID, RUT o email..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card rounded-lg border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              <th className="px-4 py-3 text-left font-semibold w-20">ID</th>
              <th className="px-4 py-3 text-left font-semibold">Nombres y Apellidos</th>
              <th className="px-4 py-3 text-left font-semibold">RUT</th>
              <th className="px-4 py-3 text-left font-semibold">Contacto</th>
              <th className="px-4 py-3 text-left font-semibold">Comentario</th>
              <th className="px-4 py-3 text-left font-semibold">Seguimiento</th>
              <th className="px-4 py-3 text-left font-semibold">Creado por</th>
              <th className="px-4 py-3 text-left font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const seg = seguimientoInfo(c.seguimiento);
              return (
                <tr key={c.id} className="table-row-hover border-b" style={{ borderColor: "hsl(var(--border))" }}>
                  <td className="px-4 py-3 font-semibold">{c.id}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(c)} className="font-medium hover:underline" style={{ color: "hsl(var(--primary))" }}>
                      {c.nombres} {c.apellidos}
                    </button>
                  </td>
                  <td className="px-4 py-3" style={{ color: "hsl(var(--muted-foreground))" }}>{c.rut || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5" style={{ color: "hsl(var(--muted-foreground))" }}><Phone size={12} />{c.telefono}</span>
                      <span className="flex items-center gap-1.5" style={{ color: "hsl(var(--muted-foreground))" }}><Mail size={12} />{c.email || "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-[150px] truncate text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{c.comentario || "—"}</td>
                  <td className="px-4 py-3">
                    {seg ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: seg.bg, color: seg.color }}>{seg.label}</span>
                    ) : <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{c.creadoPor || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(c)} className="p-1 rounded hover:bg-muted" style={{ color: "hsl(var(--primary))" }}><Edit2 size={15} /></button>
                      <button onClick={() => setDeleteId(c.id)} className="p-1 rounded hover:bg-muted" style={{ color: "hsl(var(--destructive))" }}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>No hay clientes registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl mx-4 animate-fade-in max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "hsl(var(--border))" }}>
              <h2 className="text-base font-bold" style={{ color: "hsl(var(--primary))" }}>
                {editId ? "Editar Cliente" : "Nuevo Registro de Cliente"}
              </h2>
              <div className="flex items-center gap-2">
                {editId && (
                  <button onClick={() => { setShowModal(false); setDeleteId(editId); }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium"
                    style={{ color: "hsl(var(--destructive))", border: "1px solid hsl(var(--destructive)/0.3)" }}>
                    <Trash2 size={13} /> Eliminar
                  </button>
                )}
                <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
              </div>
            </div>

            <div className="px-6 py-5 overflow-y-auto space-y-4">
              {/* Datos principales */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>DATOS PRINCIPALES</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1">Nombres *</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      value={form.nombres} onChange={e => setForm({ ...form, nombres: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Apellidos *</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      value={form.apellidos} onChange={e => setForm({ ...form, apellidos: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Teléfono *</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      placeholder="+56 9 1234 5678" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Email</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      placeholder="correo@ejemplo.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">RUT (opcional)</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      placeholder="12.345.678-9" value={form.rut || ""} onChange={e => setForm({ ...form, rut: e.target.value || null })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Estado Civil</label>
                    <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      value={form.estadoCivil || ""} onChange={e => setForm({ ...form, estadoCivil: e.target.value || null })}>
                      <option value="">— Seleccionar —</option>
                      {["Soltero/a","Casado/a","Divorciado/a","Viudo/a","Conviviente civil"].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Dirección</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      placeholder="Calle #123, Comuna" value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Ciudad</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      value={form.ciudad || ""} onChange={e => setForm({ ...form, ciudad: e.target.value || null })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Casa que habita</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      placeholder="Propia / Arrendada" value={form.casaHabita || ""} onChange={e => setForm({ ...form, casaHabita: e.target.value || null })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Estudios</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      placeholder="Universitario / Técnico..." value={form.estudios || ""} onChange={e => setForm({ ...form, estudios: e.target.value || null })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Creado por</label>
                    <input readOnly className="w-full border rounded px-3 py-2 text-sm bg-muted/40" style={{ borderColor: "hsl(var(--border))" }}
                      value={form.creadoPor || ""} />
                  </div>
                </div>
              </div>

              {/* Comentario */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>COMENTARIO (OPCIONAL)</div>
                <textarea rows={2} className="w-full border rounded px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }}
                  placeholder="Comentarios sobre el cliente..." value={form.comentario || ""} onChange={e => setForm({ ...form, comentario: e.target.value || null })} />
              </div>

              {/* Estado de Seguimiento */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>ESTADO DE SEGUIMIENTO</div>
                <div className="flex gap-3 mb-3">
                  {([1, 2, 3] as const).map(n => {
                    const info = SEGUIMIENTO_LABELS[n];
                    const active = form.seguimiento === n;
                    return (
                      <button key={n} onClick={() => setForm({ ...form, seguimiento: active ? null : n })}
                        className="flex-1 py-2 rounded-lg border text-xs font-semibold transition-colors"
                        style={{
                          background: active ? info.bg : "transparent",
                          color: active ? info.color : "hsl(var(--muted-foreground))",
                          borderColor: active ? info.color : "hsl(var(--border))",
                        }}>
                        {info.label}
                      </button>
                    );
                  })}
                </div>
                {([1, 2, 3] as const).map(n => (
                  <div key={n} className="mb-2">
                    <label className="block text-xs font-medium mb-1" style={{ color: SEGUIMIENTO_LABELS[n].color }}>
                      Comentario Seguimiento {n}
                    </label>
                    <textarea rows={1} className="w-full border rounded px-3 py-1.5 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }}
                      placeholder={`Nota del seguimiento ${n}...`}
                      value={(form[`seguimientoComentario${n}` as keyof typeof form] as string | null) || ""}
                      onChange={e => setForm({ ...form, [`seguimientoComentario${n}`]: e.target.value || null } as typeof form)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "hsl(var(--border))" }}>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded text-sm border bg-card hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 rounded text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>Guardar Cliente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
