import { useState, useRef, useEffect } from "react";
import { Plus, Search, FileText, Eye, Upload, Download, Table, Link2 } from "lucide-react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/context/AppContext";
import { SearchableSelect } from "@/components/SearchableSelect";
import { NumberInput } from "@/components/NumberInput";

interface Consignatario {
  id: string;
  folio: string;
  nombre: string;
  apellidos: string;
  rut: string;
  telefono: string;
  email: string;
  direccion: string;
  ciudad: string;
  vehiculo: string;
  marca: string;
  modelo: string;
  patente: string;
  anio: string;
  color: string;
  kilometraje: string;
  valorPactado: number;
  valorConsig: number;
  disponibilidad: string;
  // Datos contrato
  permisoCirulacion: boolean;
  seguroObligatorio: boolean;
  revisionTecnica: boolean;
  padron: boolean;
  certMultas: boolean;
  carroceria: string;
  pintura: string;
  neumaticos: string;
  vidrios: string;
  focos: string;
  tapiz: string;
  gata: boolean;
  llaveRueda: boolean;
  radio: boolean;
  encendedor: boolean;
  extintor: boolean;
  manibela: boolean;
  repuesto: boolean;
  cenicero: boolean;
  tresLuz: boolean;
  triangulos: boolean;
  observaciones: string;
  automotrizRut: string;
  automotrizNombre: string;
  lugar: string;
  fecha: string;
}

const initialConsignatarios: Consignatario[] = [];


const emptyForm = (): Partial<Consignatario> => ({
  folio: "", nombre: "", apellidos: "", rut: "", telefono: "", email: "", direccion: "", ciudad: "",
  vehiculo: "", marca: "", modelo: "", patente: "", anio: "", color: "", kilometraje: "0",
  valorPactado: 0, valorConsig: 0, disponibilidad: "DISPONIBLE",
  permisoCirulacion: false, seguroObligatorio: false, revisionTecnica: false, padron: false, certMultas: false,
  carroceria: "Bueno", pintura: "Bueno", neumaticos: "Bueno", vidrios: "Bueno", focos: "Bueno", tapiz: "Bueno",
  gata: false, llaveRueda: false, radio: false, encendedor: false, extintor: false, manibela: false,
  repuesto: false, cenicero: false, tresLuz: false, triangulos: false, observaciones: "",
  automotrizRut: "77.728.698-6", automotrizNombre: "Egaña Automotriz", lugar: "Puerto Montt",
  fecha: new Date().toLocaleDateString("es-CL")
});

const fmt = (n: number) => "$" + n.toLocaleString("es-CL");

const ESTADO_VEHICULO_OPTIONS = ["Bueno", "Regular", "Malo"];

// ── Constantes Egaña Automotriz (siempre las mismas, no dependen de la BD) ──
const EGANA_NOMBRE_LEGAL = "AUTOMOTORA EGAÑA SPA";
const EGANA_RUT = "77.728.698-6";
const EGANA_REPRESENTANTE = "Egaña Automotriz";
const EGANA_LUGAR_DEFAULT = "Puerto Montt";
const EGANA_DOMICILIO = "Av Ferrocarriles km 4, Puerto Montt";

/** Compone nombre + apellidos sin duplicar tokens. */
function nombreCompletoSinDuplicar(nombre: string, apellidos: string): string {
  const limpiar = (s: string) => (s || "").trim().replace(/\s+/g, " ");
  const n = limpiar(nombre).toUpperCase();
  const a = limpiar(apellidos).toUpperCase();
  if (!a) return n;
  if (!n) return a;
  // Si el nombre ya termina con los apellidos, no los repetimos
  if (n.endsWith(" " + a) || n === a) return n;
  // Si el apellido empieza con el ultimo token del nombre, dedupe
  const nTokens = n.split(" ");
  const aTokens = a.split(" ");
  // Quitar tokens del inicio de apellido que ya esten al final del nombre
  let overlap = 0;
  for (let k = Math.min(nTokens.length, aTokens.length); k > 0; k--) {
    const tail = nTokens.slice(-k).join(" ");
    const head = aTokens.slice(0, k).join(" ");
    if (tail === head) { overlap = k; break; }
  }
  const apellidosFinales = aTokens.slice(overlap).join(" ");
  return apellidosFinales ? `${n} ${apellidosFinales}` : n;
}

/** DD-MM-YYYY desde un string fecha o Date. Default: hoy. */
function fechaFormateada(raw?: string): string {
  if (raw) {
    // Si ya tiene formato legible, usar tal cual
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(raw)) return raw;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
    }
  }
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

function generateContratoPDF(c: Consignatario) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const pageW = 210;
  const margin = 20;
  const col = pageW - margin * 2;
  let y = 15;

  // ── Valores resueltos: usar lo del registro si existe, si no defaults Egaña
  const rutEmpresa = c.automotrizRut?.trim() || EGANA_RUT;
  const representante = c.automotrizNombre?.trim() || EGANA_REPRESENTANTE;
  const lugar = c.lugar?.trim() || c.ciudad?.trim() || EGANA_LUGAR_DEFAULT;
  const fechaTxt = fechaFormateada(c.fecha);
  const nombreCompleto = nombreCompletoSinDuplicar(c.nombre || "", c.apellidos || "");

  const setFont = (size: number, style: "normal" | "bold" = "normal") => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
  };

  // ── Header con logo EA (negro + amarillo) ──────────────────
  // Fondo negro redondeado
  doc.setFillColor(10, 10, 10);
  doc.roundedRect(margin, y, 22, 22, 3, 3, "F");
  // Círculo amarillo
  doc.setDrawColor(234, 179, 8);
  doc.setLineWidth(1.5);
  doc.circle(margin + 11, y + 11, 9, "S");
  // Letras EA amarillas centradas en el círculo
  doc.setTextColor(234, 179, 8);
  setFont(11, "bold");
  doc.text("EA", margin + 7, y + 13.5);

  // Texto empresa
  doc.setTextColor(0, 0, 0);
  setFont(12, "bold");
  doc.text("EGAÑA AUTOMOTRIZ", margin + 26, y + 8);
  setFont(8);
  doc.setTextColor(80, 80, 80);
  doc.text("RUT: " + rutEmpresa, margin + 26, y + 14);

  // Fecha arriba derecha
  setFont(8);
  doc.setTextColor(0, 0, 0);
  doc.text(`En ${lugar}, ${fechaTxt}`, pageW - margin, y + 11, { align: "right" });

  // Línea separadora
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.line(margin, y + 25, pageW - margin, y + 25);
  y += 32;

  setFont(13, "bold");
  doc.text("CONTRATO DE CONSIGNACIÓN DE VEHÍCULO", pageW / 2, y, { align: "center" });
  y += 10;

  setFont(8);
  const introText = `Entre ${EGANA_NOMBRE_LEGAL}, RUT N° ${rutEmpresa}, representada por ${representante}, en adelante "LA PARTE INTERMEDIARIA", por una parte; y por la otra, ${nombreCompleto}, cédula de identidad N° ${c.rut || "—"}, domiciliado en ${c.direccion || "—"}, ${c.ciudad || lugar}, en adelante "EL CONSIGNADOR", se ha convenido el siguiente Contrato de Consignación de Vehículo:`;
  const introLines = doc.splitTextToSize(introText, col);
  doc.text(introLines, margin, y);
  y += introLines.length * 4 + 4;

  // Clausula 1
  setFont(9, "bold");
  doc.text("PRIMERO: Objeto del contrato", margin, y);
  y += 5;
  setFont(8);
  const obj1 = `Por el presente acto, EL CONSIGNADOR entrega en consignación a LA PARTE INTERMEDIARIA el vehículo que se individualiza a continuación, para que esta gestione su exhibición y eventual venta a terceros, sin que exista exclusividad en dicha gestión:`;
  doc.text(doc.splitTextToSize(obj1, col), margin, y);
  y += 10;

  // Tabla vehículo
  const tableData = [
    ["Marca", c.marca, "Modelo", c.modelo, "Año", c.anio],
    ["Color", c.color, "Kilometraje", c.kilometraje, "Patente", c.patente],
  ];
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, col, 7, "F");
  doc.setDrawColor(200, 200, 200);
  doc.rect(margin, y, col, 7, "S");
  setFont(8, "bold");
  const colW = col / 6;
  tableData[0].forEach((cell, i) => {
    doc.text(String(cell), margin + i * colW + 2, y + 4.5);
  });
  y += 7;
  doc.rect(margin, y, col, 7, "S");
  setFont(8);
  tableData[1].forEach((cell, i) => {
    doc.text(String(cell), margin + i * colW + 2, y + 4.5);
  });
  y += 10;

  setFont(9, "bold");
  doc.text(`Valor Pactado: ${fmt(c.valorPactado)}`, margin, y);
  y += 8;

  // Clausulas
  const clausulas = [
    ["SEGUNDO: Precio y condiciones de venta",
      `El precio mínimo de venta del vehículo será de ${fmt(c.valorPactado)} (pesos), monto que podrá ser modificado únicamente por autorización escrita del CONSIGNADOR.`],
    ["TERCERO: Firma y transferencia del vehículo",
      "En caso de concretarse la venta del vehículo individualizado en la cláusula primera, las partes acuerdan que la transferencia se realizará a través de la plataforma digital \"Autofact\", donde se enviará al CONSIGNANTE y al comprador un enlace (link) electrónico para proceder a la firma del contrato de compraventa."],
    ["CUARTO: Pago del precio",
      `El pago del precio de venta al CONSIGNANTE se efectuará posterior a diez (10) días hábiles contados desde la fecha de firma del contrato de compraventa, por ambas partes en la plataforma Autofact.`],
    ["QUINTO: Ausencia de comisión",
      "Las partes acuerdan expresamente que LA PARTE INTERMEDIARIA, no percibirá comisión alguna por la gestión de exhibición y publicación del vehículo, salvo que se pacte por escrito en documento separado."],
    ["SEXTO: No exclusividad",
      "El presente contrato no confiere exclusividad a LA PARTE INTERMEDIARIA, por lo que el CONSIGNADOR podrá gestionar la venta del vehículo directamente o a través de terceros, sin limitación alguna."],
    ["SÉPTIMO: Retiro del vehículo",
      "EL CONSIGNADOR podrá retirar el vehículo consignado en cualquier momento, mediante aviso previo a LA PARTE INTERMEDIARIA."],
    ["OCTAVO: Responsabilidad y cuidado del vehículo",
      "LA PARTE INTERMEDIARIA se compromete a custodiar el vehículo mientras permanezca en su poder y a no utilizarlo para fines distintos a los necesarios para su exhibición."],
  ];

  for (const [title, text] of clausulas) {
    if (y > 245) { doc.addPage(); y = 20; }
    setFont(8, "bold");
    doc.text(title, margin, y);
    y += 4;
    setFont(8);
    const lines = doc.splitTextToSize(text, col);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 2;
  }

  // Documentación
  if (y > 230) { doc.addPage(); y = 20; }
  setFont(9, "bold");
  doc.text("NOVENO: Documentación entregada", margin, y);
  y += 5;
  setFont(8);
  const docs = [
    ["Padrón de Inscripción", c.padron],
    ["Permiso de circulación vigente", c.permisoCirulacion],
    ["Revisión técnica al día", c.revisionTecnica],
    ["Seguro obligatorio (SOAP)", c.seguroObligatorio],
  ];
  docs.forEach(([label, val]) => {
    doc.text(`[${val ? "X" : " "}] ${label}`, margin + 5, y);
    y += 4;
  });
  y += 4;

  // Jurisdicción
  setFont(9, "bold");
  doc.text("DÉCIMO: Jurisdicción y domicilio", margin, y);
  y += 5;
  setFont(8);
  doc.text(`Para todos los efectos legales, las partes fijan su domicilio en la ciudad de ${lugar}.`, margin, y);
  y += 10;

  // Firmas
  if (y > 250) { doc.addPage(); y = 20; }
  const mid = pageW / 2;
  doc.line(margin, y + 15, margin + 60, y + 15);
  doc.line(mid + 10, y + 15, mid + 70, y + 15);
  setFont(8, "bold");
  doc.text("Firma Consignador:", margin, y + 20);
  doc.text("Automotora Egaña:", mid + 10, y + 20);
  setFont(8);
  doc.text(`Nombre: ${nombreCompleto}`, margin, y + 25);
  doc.text(`C.N.I: ${c.rut || "—"}`, margin, y + 30);
  if (c.telefono) doc.text(`Teléfono: ${c.telefono}`, margin, y + 35);
  doc.text(`p.p. ${representante}`, mid + 10, y + 25);
  doc.text(`RUT: ${rutEmpresa}`, mid + 10, y + 30);
  doc.text(`Domicilio: ${EGANA_DOMICILIO}`, mid + 10, y + 35);

  // Nombre archivo: limpiar caracteres especiales
  const safeApellidos = (c.apellidos || c.nombre || "Consignatario").replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "_");
  const safePatente = (c.patente || "SinPatente").replace(/[^a-zA-Z0-9]/g, "");
  doc.save(`Contrato_Consignacion_${safeApellidos}_${safePatente}.pdf`);
}

const MASTER_PASS = "ankker2026$$";

function DeleteConsigModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { usuarioActual, vehiculos } = useApp();
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(false);
  const isMaster = usuarioActual?.rol === "master";

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
        <h3 className="font-bold text-sm mb-1" style={{ color: "hsl(var(--destructive))" }}>Eliminar Consignatario</h3>
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

export default function Consignatarios() {
  const [consignatarios, setConsignatarios] = useState<Consignatario[]>(initialConsignatarios);

  // Cargar consignatarios desde Supabase al montar
  useEffect(() => {
    const loadFromDb = async () => {
      const { data, error } = await supabase
        .from("consignatarios")
        .select("*")
        .order("created_at", { ascending: false });
      if (error || !data) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: Consignatario[] = data.map((row: any) => {
        // Campos del contrato (checkboxes, estados, etc.) viven en la columna jsonb `extra`
        const ex = (row.extra ?? {}) as Partial<Consignatario>;
        return {
          id: String(row.id ?? ""),
          folio: String(row.folio ?? "") || String(row.vehiculo ?? "").split(" - ")[0] || "",
          nombre: String(row.nombre ?? ""),
          apellidos: String(row.apellidos ?? ""),
          rut: String(row.rut ?? ""),
          telefono: String(row.telefono ?? ""),
          email: String(row.email ?? ""),
          direccion: String(row.direccion ?? ""),
          ciudad: String(row.ciudad ?? ""),
          vehiculo: String(row.vehiculo ?? ""),
          marca: String(row.marca ?? ""),
          modelo: String(row.modelo ?? ""),
          patente: String(row.patente ?? ""),
          anio: String(row.anio ?? ""),
          color: String(row.color ?? ""),
          kilometraje: String(row.kilometraje ?? "0"),
          valorPactado: Number(row.precio ?? 0),
          valorConsig: Number(row.valor_consig ?? 0),
          disponibilidad: String(row.estado ?? "DISPONIBLE"),
          permisoCirulacion: Boolean(ex.permisoCirulacion ?? false),
          seguroObligatorio: Boolean(ex.seguroObligatorio ?? false),
          revisionTecnica: Boolean(ex.revisionTecnica ?? false),
          padron: Boolean(ex.padron ?? false),
          certMultas: Boolean(ex.certMultas ?? false),
          carroceria: String(ex.carroceria ?? ""),
          pintura: String(ex.pintura ?? ""),
          neumaticos: String(ex.neumaticos ?? ""),
          vidrios: String(ex.vidrios ?? ""),
          focos: String(ex.focos ?? ""),
          tapiz: String(ex.tapiz ?? ""),
          gata: Boolean(ex.gata ?? false),
          llaveRueda: Boolean(ex.llaveRueda ?? false),
          radio: Boolean(ex.radio ?? false),
          encendedor: Boolean(ex.encendedor ?? false),
          extintor: Boolean(ex.extintor ?? false),
          manibela: Boolean(ex.manibela ?? false),
          repuesto: Boolean(ex.repuesto ?? false),
          cenicero: Boolean(ex.cenicero ?? false),
          tresLuz: Boolean(ex.tresLuz ?? false),
          triangulos: Boolean(ex.triangulos ?? false),
          observaciones: String(row.descripcion ?? ""),
          automotrizRut: String(ex.automotrizRut ?? ""),
          automotrizNombre: String(ex.automotrizNombre ?? ""),
          lugar: String(ex.lugar ?? ""),
          fecha: String(ex.fecha ?? "") || String(row.fecha_ingreso ?? row.created_at ?? "").slice(0, 10),
        };
      });
      setConsignatarios(mapped);
    };
    loadFromDb();
  }, []);

  /** Mapea el form al row de la tabla consignatarios (campos extra → jsonb). */
  const consigToDb = (c: Partial<Consignatario>) => ({
    folio: c.folio ?? "",
    nombre: c.nombre ?? "",
    apellidos: c.apellidos ?? "",
    rut: c.rut ?? "",
    telefono: c.telefono ?? "",
    email: c.email ?? "",
    direccion: c.direccion ?? "",
    ciudad: c.ciudad ?? "",
    vehiculo: c.vehiculo ?? "",
    marca: c.marca ?? "",
    modelo: c.modelo ?? "",
    patente: c.patente ?? "",
    anio: c.anio ?? "",
    color: c.color ?? "",
    kilometraje: c.kilometraje ?? "0",
    precio: c.valorPactado ?? 0,
    valor_consig: c.valorConsig ?? 0,
    estado: c.disponibilidad ?? "DISPONIBLE",
    descripcion: c.observaciones ?? "",
    extra: {
      permisoCirulacion: c.permisoCirulacion ?? false,
      seguroObligatorio: c.seguroObligatorio ?? false,
      revisionTecnica: c.revisionTecnica ?? false,
      padron: c.padron ?? false,
      certMultas: c.certMultas ?? false,
      carroceria: c.carroceria ?? "",
      pintura: c.pintura ?? "",
      neumaticos: c.neumaticos ?? "",
      vidrios: c.vidrios ?? "",
      focos: c.focos ?? "",
      tapiz: c.tapiz ?? "",
      gata: c.gata ?? false,
      llaveRueda: c.llaveRueda ?? false,
      radio: c.radio ?? false,
      encendedor: c.encendedor ?? false,
      extintor: c.extintor ?? false,
      manibela: c.manibela ?? false,
      repuesto: c.repuesto ?? false,
      cenicero: c.cenicero ?? false,
      tresLuz: c.tresLuz ?? false,
      triangulos: c.triangulos ?? false,
      automotrizRut: c.automotrizRut ?? "",
      automotrizNombre: c.automotrizNombre ?? "",
      lugar: c.lugar ?? "",
      fecha: c.fecha ?? "",
    },
    updated_at: new Date().toISOString(),
  });

  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("Todos");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Consignatario>>(emptyForm());
  const [activeSection, setActiveSection] = useState<"datos" | "vehiculo" | "docs" | "estado" | "valores">("datos");
  const excelImportRef = useRef<HTMLInputElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const exportExcel = () => {
    const data = consignatarios.map(c => ({
      Folio: c.folio, Nombre: c.nombre, Apellidos: c.apellidos, RUT: c.rut,
      Telefono: c.telefono, Email: c.email, Direccion: c.direccion,
      Vehiculo: c.vehiculo, Marca: c.marca, Modelo: c.modelo, Patente: c.patente,
      Año: c.anio, "Valor Pactado": c.valorPactado, Estado: c.disponibilidad,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consignatarios");
    XLSX.writeFile(wb, "consignatarios.xlsx");
  };

  const importExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws);
      const nuevos: Consignatario[] = rows.map((r, i) => ({
        id: String(Date.now() + i),
        folio: String(r["Folio"] || ""),
        nombre: String(r["Nombre"] || ""),
        apellidos: String(r["Apellidos"] || ""),
        rut: String(r["RUT"] || ""),
        telefono: String(r["Telefono"] || ""),
        email: String(r["Email"] || ""),
        direccion: String(r["Direccion"] || ""),
        ciudad: "", vehiculo: String(r["Vehiculo"] || ""),
        marca: String(r["Marca"] || ""),
        modelo: String(r["Modelo"] || ""),
        patente: String(r["Patente"] || ""),
        anio: String(r["Año"] || r["Anio"] || ""),
        color: "", kilometraje: "",
        valorPactado: Number(r["Valor Pactado"] || 0),
        valorConsig: 0, disponibilidad: String(r["Estado"] || "DISPONIBLE"),
        permisoCirulacion: false, seguroObligatorio: false, revisionTecnica: false,
        padron: false, certMultas: false, carroceria: "", pintura: "", neumaticos: "",
        vidrios: "", focos: "", tapiz: "", gata: false, llaveRueda: false,
        radio: false, encendedor: false, extintor: false, manibela: false,
        repuesto: false, cenicero: false, tresLuz: false, triangulos: false,
        observaciones: "", automotrizRut: "", automotrizNombre: "",
        lugar: "", fecha: "", contrato: null, contratoName: null,
      } as Consignatario));
      // Persistir en DB cada fila importada (antes solo quedaban en memoria)
      let okCount = 0;
      const persistidos: Consignatario[] = [];
      for (const n of nuevos) {
        const { data, error } = await supabase.from("consignatarios").insert(consigToDb(n)).select().single();
        if (!error && data) { persistidos.push({ ...n, id: String(data.id) }); okCount++; }
      }
      setConsignatarios(prev => [...persistidos, ...prev]);
      alert(`Importados ${okCount} de ${nuevos.length} consignatarios.`);
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };


  const filtered = consignatarios.filter(c => {
    const matchFiltro = filtro === "Todos" || c.disponibilidad === filtro;
    const matchSearch = `${c.nombre} ${c.apellidos} ${c.rut} ${c.vehiculo}`.toLowerCase().includes(search.toLowerCase());
    return matchFiltro && matchSearch;
  });

  // Render por tramos: primeros 20 (mas recientes) + "Cargar mas".
  const PAGE = 15;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  useEffect(() => { setVisibleCount(PAGE); }, [filtro, search]);
  const visibles = filtered.slice(0, visibleCount);

  const openCreate = () => {
    const nextFolio = String(consignatarios.length + 1).padStart(5, "0");
    setForm({ ...emptyForm(), folio: nextFolio });
    setEditId(null); setActiveSection("datos"); setShowModal(true);
  };

  const openEdit = (c: Consignatario) => {
    setForm({ ...c });
    setEditId(c.id); setActiveSection("datos"); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre?.trim() || !form.apellidos?.trim()) return alert("Nombre y Apellidos son requeridos.");
    setSaving(true);
    // Persistir en DB (antes solo quedaba en memoria y se perdia al recargar)
    if (editId) {
      const { error } = await supabase.from("consignatarios").update(consigToDb(form)).eq("id", editId);
      setSaving(false);
      if (error) return alert(`No se pudo actualizar el consignatario: ${error.message}`);
      setConsignatarios(consignatarios.map(c => c.id === editId ? { ...c, ...form } as Consignatario : c));
    } else {
      const { data, error } = await supabase.from("consignatarios").insert(consigToDb(form)).select().single();
      setSaving(false);
      if (error || !data) return alert(`No se pudo guardar el consignatario: ${error?.message}`);
      setConsignatarios([{ ...(form as Consignatario), id: String(data.id) }, ...consignatarios]);
    }
    setShowModal(false);
  };

  const doDelete = async () => {
    if (deleteId) {
      const { error } = await supabase.from("consignatarios").delete().eq("id", deleteId);
      if (error) { alert(`No se pudo eliminar: ${error.message}`); setDeleteId(null); return; }
      setConsignatarios(consignatarios.filter(c => c.id !== deleteId));
    }
    setDeleteId(null);
    setShowModal(false);
  };

  const handleGenerarContrato = (c: Consignatario) => {
    generateContratoPDF(c);
  };

  const f = form as Consignatario;
  const setF = (partial: Partial<Consignatario>) => setForm(prev => ({ ...prev, ...partial }));

  const CheckField = ({ label, field }: { label: string; field: keyof Consignatario }) => (
    <label className="flex items-center gap-2 cursor-pointer text-sm">
      <input type="checkbox" className="w-4 h-4" checked={!!f[field]} onChange={e => setF({ [field]: e.target.checked } as any)} />
      {label}
    </label>
  );

  const SelectField = ({ label, field, options }: { label: string; field: keyof Consignatario; options: string[] }) => (
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
        value={String(f[field] || "")} onChange={e => setF({ [field]: e.target.value } as any)}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );

  const SECTIONS = [
    { key: "datos", label: "Datos Consignatario" },
    { key: "vehiculo", label: "Datos del Vehículo" },
    { key: "docs", label: "Documentación" },
    { key: "estado", label: "Estado del Vehículo" },
    { key: "valores", label: "Valores" },
  ] as const;

  return (
    <div>
      {deleteId && <DeleteConsigModal onConfirm={doDelete} onCancel={() => setDeleteId(null)} />}

      <div className="page-header">
        <div>
          <h1 className="page-title">Consignatarios</h1>
          <p className="page-subtitle">{consignatarios.length} consignatarios registrados</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => excelImportRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>
            <Upload size={15} /> Importar Excel
          </button>
          <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>
            <Download size={15} /> Exportar Excel
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white" style={{ background: "hsl(var(--primary))" }}>
            <Plus size={16} /> Crear Consignatario
          </button>
          <input ref={excelImportRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} />
        </div>
      </div>


      <div className="flex items-center gap-3 mb-4">
        <select className="border rounded px-3 py-2 text-sm bg-card" style={{ borderColor: "hsl(var(--border))" }}
          value={filtro} onChange={e => setFiltro(e.target.value)}>
          <option>Todos</option><option>DISPONIBLE</option><option>VENDIDO</option>
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
          <input className="pl-9 pr-3 py-2 border rounded text-sm bg-card" style={{ borderColor: "hsl(var(--border))" }}
            placeholder="Buscar por nombre, RUT, folio..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="ml-auto text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{filtered.length} / {consignatarios.length}</span>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto" style={{ borderColor: "hsl(var(--border))" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              <th className="px-4 py-3 text-left font-semibold">Folio</th>
              <th className="px-4 py-3 text-left font-semibold">Nombre</th>
              <th className="px-4 py-3 text-left font-semibold">Apellidos</th>
              <th className="px-4 py-3 text-left font-semibold">Vehículo</th>
              <th className="px-4 py-3 text-left font-semibold">Marca</th>
              <th className="px-4 py-3 text-left font-semibold">Modelo</th>
              <th className="px-4 py-3 text-left font-semibold">Patente</th>
              <th className="px-4 py-3 text-left font-semibold">Valor Pactado</th>
              <th className="px-4 py-3 text-left font-semibold">Valor Consig.</th>
              <th className="px-4 py-3 text-left font-semibold">Disponibilidad</th>
              <th className="px-4 py-3 text-left font-semibold">Contrato</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(c => (
              <tr key={c.id} className="table-row-hover border-b" style={{ borderColor: "hsl(var(--border))" }}>
                <td className="px-4 py-3 font-medium" style={{ color: "hsl(var(--primary))" }}>
                  <button onClick={() => openEdit(c)} className="hover:underline">{c.folio}</button>
                </td>
                <td className="px-4 py-3">{c.nombre}</td>
                <td className="px-4 py-3">{c.apellidos}</td>
                <td className="px-4 py-3">{c.vehiculo}</td>
                <td className="px-4 py-3">{c.marca}</td>
                <td className="px-4 py-3 font-medium" style={{ color: "hsl(var(--primary))" }}>{c.modelo}</td>
                <td className="px-4 py-3">{c.patente}</td>
                <td className="px-4 py-3">{fmt(c.valorPactado)}</td>
                <td className="px-4 py-3">{fmt(c.valorConsig)}</td>
                <td className="px-4 py-3"><span className="badge-success">{c.disponibilidad}</span></td>
                <td className="px-4 py-3">
                  <button onClick={() => handleGenerarContrato(c)}
                    className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium text-white"
                    style={{ background: "hsl(var(--primary))" }} title="Descargar contrato PDF">
                    <FileText size={13} /> PDF
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-8 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>No hay consignatarios</td></tr>
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-4 overflow-y-auto" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl mx-4 animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "hsl(var(--border))" }}>
              <h2 className="text-base font-bold" style={{ color: "hsl(var(--primary))" }}>
                {editId ? "Editar Consignatario" : "Nuevo Consignatario"}
              </h2>
              <div className="flex items-center gap-2">
                {editId && (
                  <button onClick={() => { setShowModal(false); setDeleteId(editId); }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium"
                    style={{ color: "hsl(var(--destructive))", border: "1px solid hsl(var(--destructive)/0.3)" }}>
                    🗑 Eliminar
                  </button>
                )}
                <button onClick={() => setShowModal(false)}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
              </div>
            </div>

            {/* Section nav */}
            <div className="flex border-b px-2 overflow-x-auto" style={{ borderColor: "hsl(var(--border))" }}>
              {SECTIONS.map(s => (
                <button key={s.key} onClick={() => setActiveSection(s.key)}
                  className={`px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${activeSection === s.key ? "border-primary" : "border-transparent"}`}
                  style={{ color: activeSection === s.key ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                  {s.label}
                </button>
              ))}
            </div>

            <div className="px-6 py-5 max-h-[60vh] overflow-y-auto space-y-4">
              {activeSection === "datos" && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium mb-1">Folio</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={f.folio || ""} onChange={e => setF({ folio: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium mb-1">RUT</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} placeholder="12.345.678-9" value={f.rut || ""} onChange={e => setF({ rut: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium mb-1">Nombre *</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={f.nombre || ""} onChange={e => setF({ nombre: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium mb-1">Apellidos *</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={f.apellidos || ""} onChange={e => setF({ apellidos: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium mb-1">Teléfono</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={f.telefono || ""} onChange={e => setF({ telefono: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium mb-1">Email</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={f.email || ""} onChange={e => setF({ email: e.target.value })} /></div>
                  <div className="col-span-2"><label className="block text-xs font-medium mb-1">Dirección</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={f.direccion || ""} onChange={e => setF({ direccion: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium mb-1">Ciudad</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={f.ciudad || ""} onChange={e => setF({ ciudad: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium mb-1">Lugar contrato</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={f.lugar || ""} onChange={e => setF({ lugar: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium mb-1">Fecha contrato</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }} value={f.fecha || ""} onChange={e => setF({ fecha: e.target.value })} /></div>
                </div>
              )}

              {activeSection === "vehiculo" && (
                <div className="space-y-3">
                  {/* Selector para enlazar con un vehiculo ya creado del inventario */}
                  <div
                    className="border rounded-lg p-3"
                    style={{
                      borderColor: "hsl(var(--primary)/0.3)",
                      background: "hsl(var(--primary)/0.04)",
                    }}
                  >
                    <label className="text-xs font-semibold flex items-center gap-1.5 mb-2" style={{ color: "hsl(var(--primary))" }}>
                      <Link2 size={13} /> Enlazar con vehículo existente del inventario
                    </label>
                    <SearchableSelect
                      value={""}
                      onChange={(vehId) => {
                        const v = vehiculos.find((x) => x.id === vehId);
                        if (!v) return;
                        // Auto-completar todos los campos del vehiculo en el consignatario
                        setF({
                          vehiculo: `${v.folio || ""} - ${v.patente || ""}`.trim().replace(/^-\s*/, ""),
                          marca: v.marca || "",
                          modelo: v.modelo || "",
                          patente: v.patente || "",
                          anio: v.anio || "",
                          color: v.color || "",
                          kilometraje: String(v.kilometraje ?? 0),
                        } as Partial<Consignatario>);
                      }}
                      placeholder="Escribe patente, marca o modelo para enlazar..."
                      emptyMessage="Sin vehículos en inventario que coincidan"
                      options={vehiculos.map((v) => ({
                        value: v.id,
                        label: `${v.patente || "?"} — ${v.marca} ${v.modelo}`,
                        hint: [
                          v.anio ? `Año ${v.anio}` : null,
                          v.color || null,
                          v.estado,
                        ].filter(Boolean).join(" · "),
                        search: `${v.patente} ${v.marca} ${v.modelo} ${v.anio} ${v.color ?? ""} ${v.folio ?? ""}`,
                      }))}
                    />
                    <p className="text-[10px] mt-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Selecciona el vehículo del inventario y los datos abajo se autocompletan.
                      También puedes editarlos manualmente.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ["Vehículo (Folio - Patente)", "vehiculo", "00002 - ABC123"],
                      ["Marca", "marca", "Toyota"], ["Modelo", "modelo", "Corolla"],
                      ["Patente", "patente", "ABC123"], ["Año", "anio", "2026"],
                      ["Color", "color", "Blanco"], ["Kilometraje", "kilometraje", "0"],
                    ].map(([label, field, placeholder]) => (
                      <div key={field}>
                        <label className="block text-xs font-medium mb-1">{label}</label>
                        <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                          placeholder={placeholder as string} value={String((f as any)[field as string] || "")} onChange={e => setF({ [field as string]: e.target.value } as any)} />
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs font-medium mb-1">Disponibilidad</label>
                      <select className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                        value={f.disponibilidad || "DISPONIBLE"} onChange={e => setF({ disponibilidad: e.target.value })}>
                        <option>DISPONIBLE</option><option>VENDIDO</option><option>RESERVADO</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "docs" && (
                <div className="space-y-3">
                  <div className="section-divider">Documentación Vehículo</div>
                  <div className="grid grid-cols-2 gap-3">
                    <CheckField label="Permiso Circulación" field="permisoCirulacion" />
                    <CheckField label="Seguro Obligatorio" field="seguroObligatorio" />
                    <CheckField label="Revisión Técnica" field="revisionTecnica" />
                    <CheckField label="Padrón" field="padron" />
                    <CheckField label="Cert. Registro de Multas" field="certMultas" />
                  </div>
                </div>
              )}

              {activeSection === "estado" && (
                <div className="space-y-4">
                  <div className="section-divider">Estado del Vehículo</div>
                  <div className="grid grid-cols-3 gap-3">
                    <SelectField label="Carrocería" field="carroceria" options={ESTADO_VEHICULO_OPTIONS} />
                    <SelectField label="Pintura" field="pintura" options={ESTADO_VEHICULO_OPTIONS} />
                    <SelectField label="Neumáticos" field="neumaticos" options={ESTADO_VEHICULO_OPTIONS} />
                    <SelectField label="Vidrios" field="vidrios" options={ESTADO_VEHICULO_OPTIONS} />
                    <SelectField label="Focos" field="focos" options={ESTADO_VEHICULO_OPTIONS} />
                    <SelectField label="Tapiz" field="tapiz" options={ESTADO_VEHICULO_OPTIONS} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <CheckField label="Gata" field="gata" />
                    <CheckField label="Llave rueda" field="llaveRueda" />
                    <CheckField label="Radio" field="radio" />
                    <CheckField label="Encendedor" field="encendedor" />
                    <CheckField label="Extintor" field="extintor" />
                    <CheckField label="Manibela" field="manibela" />
                    <CheckField label="Repuesto" field="repuesto" />
                    <CheckField label="Cenicero" field="cenicero" />
                    <CheckField label="3ª luz" field="tresLuz" />
                    <CheckField label="Triángulos" field="triangulos" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Otras observaciones al vehículo</label>
                    <textarea rows={3} className="w-full border rounded px-3 py-2 text-sm bg-background resize-none" style={{ borderColor: "hsl(var(--border))" }}
                      value={f.observaciones || ""} onChange={e => setF({ observaciones: e.target.value })} />
                  </div>
                </div>
              )}

              {activeSection === "valores" && (
                <div className="space-y-4">
                  <div className="section-divider">Valores Vehículo</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Valor Pactado (CLP)</label>
                      <NumberInput value={f.valorPactado ?? 0} onChange={(n) => setF({ valorPactado: n })} currency placeholder="Ej: 10.500.000" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Valor Consignación (CLP)</label>
                      <NumberInput value={f.valorConsig ?? 0} onChange={(n) => setF({ valorConsig: n })} currency placeholder="Ej: 10.500.000" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">RUT Automotriz</label>
                    <input className="w-full border rounded px-3 py-2 text-sm bg-background" style={{ borderColor: "hsl(var(--border))" }}
                      value={f.automotrizRut || ""} onChange={e => setF({ automotrizRut: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "hsl(var(--border))" }}>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded text-sm border bg-card hover:bg-muted" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-60" style={{ background: "hsl(var(--primary))" }}>{saving ? "Guardando..." : "Guardar Consignatario"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
