import { useState, useRef } from "react";
import { Plus, Search, Edit2, Trash2, Phone, Mail, Upload, X, FileText } from "lucide-react";

interface Cliente {
  id: string;
  nombres: string;
  apellidos: string;
  direccion: string;
  telefono: string;
  email: string;
  docCedula: string | null;
}

const initialClientes: Cliente[] = [
  { id: "101", nombres: "Juan", apellidos: "Perez", direccion: "Las Condes 102", telefono: "+56 9 1234 5678", email: "juan@demo.cl", docCedula: "cedula.pdf" },
  { id: "102", nombres: "Maria", apellidos: "Gonzalez", direccion: "Providencia 45", telefono: "+56 9 8765 4321", email: "maria@demo.cl", docCedula: null },
  { id: "103", nombres: "Renttmontt", apellidos: "SPA", direccion: "Santiago Centro 90", telefono: "+56 2 2233 4455", email: "contacto@renttmontt.cl", docCedula: "cedula.pdf" },
  { id: "104", nombres: "Pedro", apellidos: "Vargas", direccion: "Ñuñoa 500", telefono: "+56 9 4444 5555", email: "pedro@demo.cl", docCedula: "cedula.pdf" },
];

const emptyForm = { id: "", nombres: "", apellidos: "", direccion: "", telefono: "", email: "", docCedula: null as string | null };

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>(initialClientes);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [docFileName, setDocFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = clientes.filter(c =>
    `${c.nombres} ${c.apellidos} ${c.id} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const nextId = () => String(Math.max(...clientes.map(c => parseInt(c.id) || 100)) + 1);

  const openCreate = () => {
    setForm({ ...emptyForm, id: nextId() });
    setDocFileName(null);
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (c: Cliente) => {
    setForm({ id: c.id, nombres: c.nombres, apellidos: c.apellidos, direccion: c.direccion, telefono: c.telefono, email: c.email, docCedula: c.docCedula });
    setDocFileName(c.docCedula);
    setEditId(c.id);
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("¿Eliminar este cliente?")) setClientes(clientes.filter(c => c.id !== id));
  };

  const handleSave = () => {
    if (!form.nombres.trim() || !form.apellidos.trim()) return alert("Nombres y Apellidos son requeridos.");
    if (editId) {
      setClientes(clientes.map(c => c.id === editId ? { ...form, docCedula: docFileName } : c));
    } else {
      setClientes([...clientes, { ...form, docCedula: docFileName }]);
    }
    setShowModal(false);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setDocFileName(file.name);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Directorio de Clientes</h1>
          <p className="page-subtitle">{clientes.length} clientes registrados en sistema</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>
          <Plus size={16} /> Registrar Cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
        <input
          className="w-full pl-9 pr-3 py-2 rounded-md border text-sm bg-card"
          style={{ borderColor: "hsl(var(--border))" }}
          placeholder="Buscar por nombre, ID o email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              <th className="px-4 py-3 text-left font-semibold w-20">ID Cliente</th>
              <th className="px-4 py-3 text-left font-semibold">Nombres y Apellidos</th>
              <th className="px-4 py-3 text-left font-semibold">Dirección</th>
              <th className="px-4 py-3 text-left font-semibold">Contacto</th>
              <th className="px-4 py-3 text-left font-semibold">Doc. Cédula</th>
              <th className="px-4 py-3 text-left font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.id} className="table-row-hover border-b" style={{ borderColor: "hsl(var(--border))" }}>
                <td className="px-4 py-3 font-semibold">{c.id}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(c)} className="font-medium hover:underline" style={{ color: "hsl(var(--primary))" }}>
                    {c.nombres} {c.apellidos}
                  </button>
                </td>
                <td className="px-4 py-3" style={{ color: "hsl(var(--muted-foreground))" }}>{c.direccion || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5" style={{ color: "hsl(var(--muted-foreground))" }}><Phone size={12} />{c.telefono}</span>
                    <span className="flex items-center gap-1.5" style={{ color: "hsl(var(--muted-foreground))" }}><Mail size={12} />{c.email}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {c.docCedula ? (
                    <span className="badge-success">Cargada</span>
                  ) : (
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(c)} className="p-1 rounded hover:bg-muted" style={{ color: "hsl(var(--primary))" }}><Edit2 size={15} /></button>
                    <button onClick={() => handleDelete(c.id)} className="p-1 rounded hover:bg-muted" style={{ color: "hsl(var(--destructive))" }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>No hay clientes registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-xl mx-4 animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "hsl(var(--border))" }}>
              <h2 className="text-base font-bold" style={{ color: "hsl(var(--primary))" }}>
                {editId ? "Editar Cliente" : "Nuevo Registro de Cliente"}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">ID Cliente <span className="text-muted-foreground">(Opcional - Auto si se deja blanco)</span></label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                  placeholder={`Ej: CLI-${form.id}`} value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Teléfono *</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                  placeholder="+56 9 1234 5678" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Nombres *</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                  value={form.nombres} onChange={e => setForm({ ...form, nombres: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Email</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                  placeholder="correo@ejemplo.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Apellidos *</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                  value={form.apellidos} onChange={e => setForm({ ...form, apellidos: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Fotocopia de Cédula de Identidad</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-4 cursor-pointer hover:bg-muted/40 transition-colors"
                  style={{ borderColor: "hsl(var(--border))" }}
                >
                  {docFileName ? (
                    <div className="flex items-center gap-2" style={{ color: "hsl(var(--primary))" }}>
                      <FileText size={16} />
                      <span className="text-xs truncate max-w-[140px]">{docFileName}</span>
                    </div>
                  ) : (
                    <>
                      <Upload size={20} style={{ color: "hsl(var(--muted-foreground))" }} />
                      <span className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Subir Documento (Opcional)</span>
                    </>
                  )}
                </div>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFile} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1">Dirección</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                  placeholder="Calle #123, Comuna" value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} />
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
