import { useState, useRef, useEffect } from "react";
import { Plus, Search, Edit2, Trash2, Phone, Mail, Download, Upload, X, Table } from "lucide-react";
import { useApp, Cliente } from "@/context/AppContext";
import * as XLSX from "xlsx";

const MASTER_PASS = "ankker2026$$";

interface SeguimientoEntry {
  tipo: string;
  comentario: string;
  fecha: string;
}

const emptyForm = (): Omit<Cliente, "id"> & { seguimientos: SeguimientoEntry[] } => ({
  nombres: "", apellidos: "", direccion: "", telefono: "+56 ", email: "",
  rut: null, comentario: null, estadoCivil: null, ciudad: null,
  casaHabita: null, estudios: null,
  seguimiento: null,
  seguimientoComentario1: null, seguimientoComentario2: null, seguimientoComentario3: null,
  creadoPor: null,
  seguimientos: [],
});

function DeleteModal({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  const { usuarioActual } = useApp();
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(false);
  const isMaster = usuarioActual?.rol === "master";

  // Si el usuario es master, ejecutar acción automáticamente sin pedir clave
  useEffect(() => {
    if (isMaster) onConfirm();
  }, [isMaster, onConfirm]);

  if (isMaster) return null;

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

const nowStr = () => {
  const d = new Date();
  return d.toLocaleDateString("es-CL") + " " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
};

export default function Clientes() {
  const { clientes, addCliente, updateCliente, deleteCliente, usuarioActual } = useApp();
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Cliente, "id"> & { seguimientos: SeguimientoEntry[] }>(emptyForm());
  const [activeTab, setActiveTab] = useState<"datos" | "seguimiento" | "credito">("datos");
  const excelImportRef = useRef<HTMLInputElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [nuevoSeguimientoComentario, setNuevoSeguimientoComentario] = useState("");

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
    reader.onload = async (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);
      const nuevos: Omit<Cliente, "id">[] = rows.map((r) => ({
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
      // Insertar uno a uno en la DB (persistente, antes solo quedaban en memoria)
      let okCount = 0;
      for (const n of nuevos) {
        if (await addCliente(n)) okCount++;
      }
      alert(`Importados ${okCount} de ${nuevos.length} clientes.`);
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const filtered = clientes.filter(c =>
    `${c.nombres} ${c.apellidos} ${c.id} ${c.email} ${c.rut || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  // Render por tramos: muestra los primeros 20 (los mas recientes) y suma con
  // "Cargar mas", para que la lista aparezca rapido aunque haya miles.
  const PAGE = 15;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  useEffect(() => { setVisibleCount(PAGE); }, [search]);
  const visibles = filtered.slice(0, visibleCount);

  const openCreate = () => {
    const base = emptyForm();
    base.creadoPor = usuarioActual ? `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim() : null;
    setForm(base);
    setEditId(null);
    setActiveTab("datos");
    setNuevoSeguimientoComentario("");
    setShowModal(true);
  };

  const openEdit = (c: Cliente) => {
    // Parse seguimientos from existing comments
    const seguimientos: SeguimientoEntry[] = [];
    if (c.seguimientoComentario1) seguimientos.push({ tipo: "Primer Contacto", comentario: c.seguimientoComentario1, fecha: "" });
    if (c.seguimientoComentario2) seguimientos.push({ tipo: "Seguimiento", comentario: c.seguimientoComentario2, fecha: "" });
    if (c.seguimientoComentario3) seguimientos.push({ tipo: "Seguimiento", comentario: c.seguimientoComentario3, fecha: "" });

    setForm({
      nombres: c.nombres, apellidos: c.apellidos, direccion: c.direccion,
      telefono: c.telefono, email: c.email, rut: c.rut, comentario: c.comentario,
      estadoCivil: c.estadoCivil, ciudad: c.ciudad, casaHabita: c.casaHabita, estudios: c.estudios,
      seguimiento: c.seguimiento,
      seguimientoComentario1: c.seguimientoComentario1,
      seguimientoComentario2: c.seguimientoComentario2,
      seguimientoComentario3: c.seguimientoComentario3,
      creadoPor: c.creadoPor,
      seguimientos,
    });
    setEditId(c.id);
    setActiveTab("datos");
    setNuevoSeguimientoComentario("");
    setShowModal(true);
  };

  const doDelete = async () => {
    if (deleteId) await deleteCliente(deleteId);
    setDeleteId(null);
  };

  const addSeguimiento = (tipo: string) => {
    if (!nuevoSeguimientoComentario.trim()) return;
    const entry: SeguimientoEntry = { tipo, comentario: nuevoSeguimientoComentario.trim(), fecha: nowStr() };
    const updated = [...form.seguimientos, entry];
    // Map back to legacy fields
    const s1 = updated[0] ? `[${updated[0].fecha}] ${updated[0].comentario}` : null;
    const s2 = updated[1] ? `[${updated[1].fecha}] ${updated[1].comentario}` : null;
    const s3 = updated[2] ? `[${updated[2].fecha}] ${updated[2].comentario}` : null;
    setForm({
      ...form,
      seguimientos: updated,
      seguimiento: (updated.length > 0 ? Math.min(updated.length, 3) : null) as 1 | 2 | 3 | null,
      seguimientoComentario1: s1, seguimientoComentario2: s2, seguimientoComentario3: s3,
    });
    setNuevoSeguimientoComentario("");
  };

  const handleSave = async () => {
    if (!form.nombres.trim() || !form.apellidos.trim()) return alert("Nombres y Apellidos son requeridos.");
    if (!form.telefono.trim()) return alert("El teléfono es obligatorio.");
    const { seguimientos, ...clienteData } = form;
    setSaving(true);
    const ok = editId
      ? await updateCliente({ ...clienteData, id: editId })
      : (await addCliente(clienteData)) !== null;
    setSaving(false);
    if (ok) setShowModal(false);
  };

  const bd = { borderColor: "hsl(var(--border))" };

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
          <button onClick={() => excelImportRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border hover:bg-muted" style={bd}>
            <Upload size={15} /> Importar Excel
          </button>
          <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border hover:bg-muted" style={bd}>
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
          style={bd}
          placeholder="Buscar por nombre, ID, RUT o email..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card rounded-lg border overflow-hidden" style={bd}>
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
            {visibles.map((c) => {
              const segCount = [c.seguimientoComentario1, c.seguimientoComentario2, c.seguimientoComentario3].filter(Boolean).length;
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
                    {segCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: "#dcfce7", color: "#22c55e" }}>{segCount} seguimiento(s)</span>
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
        {visibleCount < filtered.length && (
          <div className="flex items-center justify-center gap-3 py-4 border-t" style={{ borderColor: "hsl(var(--border))" }}>
            <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Mostrando {visibles.length} de {filtered.length}</span>
            <button onClick={() => setVisibleCount(c => c + 40)} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "hsl(var(--primary))" }}>Cargar más</button>
            <button onClick={() => setVisibleCount(filtered.length)} className="px-3 py-2 rounded-lg text-sm font-medium border hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Ver todos</button>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl mx-4 animate-fade-in max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b" style={bd}>
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

            {/* Tabs */}
            <div className="flex border-b px-6" style={bd}>
              {([
                { key: "datos", label: "Datos" },
                { key: "seguimiento", label: "Seguimiento" },
                { key: "credito", label: "Evaluar Crédito" },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? "border-primary" : "border-transparent"}`}
                  style={{ color: activeTab === t.key ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="px-6 py-5 overflow-y-auto space-y-4">

              {activeTab === "datos" && (
                <>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>DATOS PRINCIPALES</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium mb-1">Nombres *</label>
                        <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={bd}
                          value={form.nombres} onChange={e => setForm({ ...form, nombres: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Apellidos *</label>
                        <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={bd}
                          value={form.apellidos} onChange={e => setForm({ ...form, apellidos: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Teléfono *</label>
                        <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={bd}
                          placeholder="+56 9 1234 5678" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Email</label>
                        <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={bd}
                          placeholder="correo@ejemplo.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">RUT (opcional)</label>
                        <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={bd}
                          placeholder="12.345.678-9" value={form.rut || ""} onChange={e => setForm({ ...form, rut: e.target.value || null })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Estado Civil</label>
                        <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={bd}
                          value={form.estadoCivil || ""} onChange={e => setForm({ ...form, estadoCivil: e.target.value || null })}>
                          <option value="">— Seleccionar —</option>
                          {["Soltero/a","Casado/a","Divorciado/a","Viudo/a","Conviviente civil"].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium mb-1">Dirección</label>
                        <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={bd}
                          placeholder="Calle #123, Comuna" value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Ciudad</label>
                        <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={bd}
                          value={form.ciudad || ""} onChange={e => setForm({ ...form, ciudad: e.target.value || null })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Casa que habita</label>
                        <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={bd}
                          placeholder="Propia / Arrendada" value={form.casaHabita || ""} onChange={e => setForm({ ...form, casaHabita: e.target.value || null })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Estudios</label>
                        <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={bd}
                          placeholder="Universitario / Técnico..." value={form.estudios || ""} onChange={e => setForm({ ...form, estudios: e.target.value || null })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Creado por</label>
                        <input readOnly className="w-full border rounded px-3 py-2 text-sm bg-muted/40" style={bd}
                          value={form.creadoPor || ""} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>COMENTARIO (OPCIONAL)</div>
                    <textarea rows={2} className="w-full border rounded px-3 py-2 text-sm bg-background resize-none" style={bd}
                      placeholder="Comentarios sobre el cliente..." value={form.comentario || ""} onChange={e => setForm({ ...form, comentario: e.target.value || null })} />
                  </div>
                </>
              )}

              {activeTab === "seguimiento" && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>HISTORIAL DE SEGUIMIENTO</div>

                  {!editId && (
                    <div className="text-sm text-center py-6 rounded-lg border border-dashed mb-4" style={bd}>
                      <p style={{ color: "hsl(var(--muted-foreground))" }}>Guarda el cliente primero para agregar seguimientos.</p>
                    </div>
                  )}

                  {editId && (
                    <>
                      {/* Existing seguimientos */}
                      <div className="space-y-2 mb-4">
                        {form.seguimientos.length === 0 && (
                          <p className="text-xs py-4 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>Sin seguimientos registrados</p>
                        )}
                        {form.seguimientos.map((s, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 rounded-lg border" style={bd}>
                            <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: i === 0 ? "#0ea5e9" : "#22c55e" }} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold" style={{ color: i === 0 ? "#0ea5e9" : "#22c55e" }}>{s.tipo}</span>
                                {s.fecha && <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{s.fecha}</span>}
                              </div>
                              <p className="text-sm mt-0.5">{s.comentario}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Add new seguimiento */}
                      <div className="border rounded-lg p-4" style={bd}>
                        <div className="text-xs font-bold uppercase mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>NUEVO SEGUIMIENTO</div>
                        <textarea rows={2} className="w-full border rounded px-3 py-2 text-sm bg-background resize-none mb-3" style={bd}
                          placeholder="Escribe el comentario del seguimiento..."
                          value={nuevoSeguimientoComentario} onChange={e => setNuevoSeguimientoComentario(e.target.value)} />
                        <div className="flex gap-2">
                          {form.seguimientos.length === 0 && (
                            <button onClick={() => addSeguimiento("Primer Contacto")}
                              className="px-3 py-1.5 rounded text-xs font-medium text-white" style={{ background: "#0ea5e9" }}>
                              + Primer Contacto
                            </button>
                          )}
                          <button onClick={() => addSeguimiento("Seguimiento")}
                            className="px-3 py-1.5 rounded text-xs font-medium text-white" style={{ background: "#22c55e" }}>
                            + Nuevo Seguimiento
                          </button>
                        </div>
                        <p className="text-xs mt-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                          Se registrará automáticamente con fecha y hora actual.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === "credito" && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>EVALUAR CRÉDITO</div>
                  {!editId ? (
                    <div className="text-sm text-center py-6 rounded-lg border border-dashed" style={bd}>
                      <p style={{ color: "hsl(var(--muted-foreground))" }}>Guarda el cliente primero para evaluar crédito.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="border rounded-lg p-4 text-center hover:bg-muted/30 cursor-pointer transition-colors" style={bd}>
                          <div className="text-2xl mb-2">🏦</div>
                          <div className="text-sm font-semibold">Falabella</div>
                          <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Evaluación crédito automotriz</p>
                        </div>
                        <div className="border rounded-lg p-4 text-center hover:bg-muted/30 cursor-pointer transition-colors" style={bd}>
                          <div className="text-2xl mb-2">🌐</div>
                          <div className="text-sm font-semibold">Global</div>
                          <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Crédito Global Automotriz</p>
                        </div>
                        <div className="border rounded-lg p-4 text-center hover:bg-muted/30 cursor-pointer transition-colors" style={bd}>
                          <div className="text-2xl mb-2">🚗</div>
                          <div className="text-sm font-semibold">Autofin</div>
                          <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Financiamiento Autofin</p>
                        </div>
                        <div className="border rounded-lg p-4 text-center hover:bg-muted/30 cursor-pointer transition-colors" style={bd}>
                          <div className="text-2xl mb-2">📋</div>
                          <div className="text-sm font-semibold">Unidad</div>
                          <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Crédito Unidad</p>
                        </div>
                      </div>
                      <p className="text-xs text-center" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Selecciona una entidad para iniciar la evaluación crediticia del cliente.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t" style={bd}>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded text-sm border bg-card hover:bg-muted" style={bd}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-60" style={{ background: "hsl(var(--primary))" }}>{saving ? "Guardando..." : "Guardar Cliente"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
