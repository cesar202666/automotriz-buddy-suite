import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Cliente {
  id: string;
  nombres: string;
  apellidos: string;
  direccion: string;
  telefono: string;
  email: string;
  rut: string | null;
  comentario: string | null;
  estadoCivil: string | null;
  ciudad: string | null;
  casaHabita: string | null;
  estudios: string | null;
  seguimiento: 1 | 2 | 3 | null;
  seguimientoComentario1: string | null;
  seguimientoComentario2: string | null;
  seguimientoComentario3: string | null;
  creadoPor: string | null;
}

export interface Vehiculo {
  id: string;
  folio: string;
  patente: string;
  tipo: string;
  marca: string;
  modelo: string;
  anio: string;
  estado: "DISPONIBLE" | "VENDIDO" | "RESERVADO" | "EN PROCESO" | "RETIRADO";
  precioVenta: number;
  precioPiso: number;
  precioCosto: number;
  sucursal: string;
  usuarioAsignado: string;
  combustible: string;
  nMotor: string;
  vin: string;
  color: string;
  kilometraje: number;
  ubicacion: string;
  comentarios: string;
  transmision: string;
  traccion: string;
  aireAcondicionado: boolean;
  equipamientoExtra: string[];
  fotos: string[];
  /** True si el usuario lo publico en Yapo (aparece en el feed XML). */
  publicadoYapo?: boolean;
  /** ISO timestamp de creacion (para badge "Nueva unidad" en lista). */
  createdAt?: string;
  /** ISO timestamp de ultima modificacion. */
  updatedAt?: string;
}

export interface Consignatario {
  id: string;
  nombre: string;
  rut: string;
  telefono: string;
  email: string;
  vehiculo: string;
  patente: string;
  precio: number;
  estado: string;
  contrato: string | null;
  contratoName: string | null;
  fechaIngreso: string;
}

export type VentaEstado = "BORRADOR" | "PENDIENTE_VALIDACION" | "VALIDADA" | "ANULADA";
export type TipoVenta = "CREDITO" | "CREDITO_PIE" | "CREDITO_APP" | "CREDITO_PIE_APP" | "APP_PIE" | "EFECTIVO" | "APP";

export interface Venta {
  id: string;
  ejecutiva: string;
  fechaVenta: string;
  sucursal: string;
  clienteId: string;
  clienteNombre: string;
  informeTecnico: string | null;
  informeTecnicoName: string | null;
  patente: string;
  marca: string;
  modelo: string;
  anioVehiculo: string;
  colorVehiculo: string;
  kilometrajeVehiculo: number;
  precioRetoma: number;
  precioPublicado: number;
  precioVenta: number;
  margenBruto: number;
  nCredito: string;
  comisionCredito: number;
  gastosAdmin: number;
  precioVtaFinal: number;
  creditoFirmado: string;
  creditoFirmadoDoc: string | null;
  creditoFirmadoDocName: string | null;
  montoPieCaja: number;
  prepago: string;
  prepagoDoc: string | null;
  prepagoDocName: string | null;
  documentacionVenta: string | null;
  documentacionVentaName: string | null;
  tipoVenta: TipoVenta;
  estado: VentaEstado;
  verificacion: boolean;
}

export interface CuentaPagar {
  id: string;
  concepto: string;
  vehiculo: string;
  clientePagar: string;
  duenio: string;
  sePagaA: string;
  cuentaCliente: string;
  montoTotal: number;
  pagadoFecha: number | string;
  fechaVencimiento: string;
  fechaUltimoPago: string;
}

export interface CuentaCobrar {
  id: string;
  idVenta: string;
  patente: string;
  fechaVenta: string;
  idComprador: string;
  nombreComprador: string;
  precioVenta: number;
  comisionCredito: number;
  tipoFinanciamiento: string;
}

export interface Adquisicion {
  id: string;
  empresa: string;
  tipoProcedencia: string;
  observaciones: string;
  patente: string;
  marca: string;
  modelo: string;
  anio: string;
  kilometraje: string;
  tipo: string;
  color: string;
  obsVehiculo: string;
  precioOriginal: number;
  fechaCompra: string;
  gastosExtra: { descripcion: string; monto: number }[];
  costoTotal: number;
  precioSugerido: number;
}

export interface Usuario {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string;
  clave: string;
  rol: "master" | "administracion" | "vendedor";
  email: string;
}

function splitNombreCompleto(nombreCompleto: string) {
  const limpio = nombreCompleto.trim().replace(/\s+/g, " ");
  if (!limpio) return { nombre: "", apellido: "" };
  const [nombre, ...resto] = limpio.split(" ");
  return { nombre, apellido: resto.join(" ") };
}

function vendedorToUsuario(row: { id: string; nombre: string; email: string | null; telefono: string | null; clave: string | null; rol: string | null }): Usuario {
  const validRoles: Usuario["rol"][] = ["master", "administracion", "vendedor"];
  const rol = validRoles.includes(row.rol as Usuario["rol"]) ? (row.rol as Usuario["rol"]) : "vendedor";
  const { nombre, apellido } = splitNombreCompleto(row.nombre);
  return {
    id: row.id,
    nombre,
    apellido,
    telefono: row.telefono ?? "",
    clave: row.clave ?? "",
    rol,
    email: (row.email ?? "").trim().toLowerCase(),
  };
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

function toDb(v: Vehiculo) {
  return {
    id: v.id,
    folio: v.folio,
    patente: v.patente,
    tipo: v.tipo,
    marca: v.marca,
    modelo: v.modelo,
    anio: v.anio,
    estado: v.estado,
    precio_venta: v.precioVenta,
    precio_piso: v.precioPiso,
    precio_costo: v.precioCosto,
    sucursal: v.sucursal,
    usuario_asignado: v.usuarioAsignado,
    combustible: v.combustible,
    n_motor: v.nMotor,
    vin: v.vin,
    color: v.color,
    kilometraje: v.kilometraje,
    ubicacion: v.ubicacion,
    comentarios: v.comentarios,
    transmision: v.transmision,
    traccion: v.traccion,
    aire_acondicionado: v.aireAcondicionado,
    equipamiento_extra: v.equipamientoExtra,
    fotos: v.fotos,
    publicado_yapo: v.publicadoYapo ?? false,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Supabase limita cada consulta a 1000 filas. Con 1237+ vehiculos y 4777
 * clientes, una sola consulta deja registros invisibles (ej: el buscador
 * de vehiculos en Ventas no encontraba los mas antiguos). Este helper
 * pagina de a 1000 hasta traer todo.
 */
async function fetchAllRows(
  query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<Record<string, unknown>[] | null> {
  const PAGE = 1000;
  const all: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) return all.length ? all : null;
    const rows = (data ?? []) as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

function fromDb(row: Record<string, unknown>): Vehiculo {
  return {
    id: String(row.id ?? ""),
    folio: String(row.folio ?? ""),
    patente: String(row.patente ?? ""),
    tipo: String(row.tipo ?? "AUTOMOVIL"),
    marca: String(row.marca ?? ""),
    modelo: String(row.modelo ?? ""),
    anio: String(row.anio ?? ""),
    estado: (row.estado ?? "DISPONIBLE") as Vehiculo["estado"],
    precioVenta: Number(row.precio_venta ?? 0),
    precioPiso: Number(row.precio_piso ?? 0),
    precioCosto: Number(row.precio_costo ?? 0),
    sucursal: String(row.sucursal ?? ""),
    usuarioAsignado: String(row.usuario_asignado ?? ""),
    combustible: String(row.combustible ?? "Bencina"),
    nMotor: String(row.n_motor ?? ""),
    vin: String(row.vin ?? ""),
    color: String(row.color ?? ""),
    kilometraje: Number(row.kilometraje ?? 0),
    ubicacion: String(row.ubicacion ?? ""),
    comentarios: String(row.comentarios ?? ""),
    transmision: String(row.transmision ?? ""),
    traccion: String(row.traccion ?? ""),
    aireAcondicionado: Boolean(row.aire_acondicionado ?? false),
    equipamientoExtra: (row.equipamiento_extra as string[]) ?? [],
    fotos: (row.fotos as string[]) ?? [],
    publicadoYapo: Boolean(row.publicado_yapo ?? false),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

// ─── Mapeos Cliente / Venta (camelCase ⇄ snake_case) ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clienteFromDb(row: any): Cliente {
  return {
    id: String(row.id ?? ""),
    nombres: String(row.nombres ?? ""),
    apellidos: String(row.apellidos ?? ""),
    direccion: String(row.direccion ?? ""),
    telefono: String(row.telefono ?? ""),
    email: String(row.email ?? ""),
    rut: row.rut ?? null,
    comentario: row.comentario ?? null,
    estadoCivil: row.estado_civil ?? null,
    ciudad: row.ciudad ?? null,
    casaHabita: row.casa_habita ?? null,
    estudios: row.estudios ?? null,
    seguimiento: row.seguimiento ?? null,
    seguimientoComentario1: row.seguimiento_comentario_1 ?? null,
    seguimientoComentario2: row.seguimiento_comentario_2 ?? null,
    seguimientoComentario3: row.seguimiento_comentario_3 ?? null,
    creadoPor: row.creado_por ?? null,
  };
}

/** Payload de insert/update (sin id: lo genera la DB con gen_random_uuid). */
function clienteToDb(c: Omit<Cliente, "id">) {
  return {
    nombres: c.nombres,
    apellidos: c.apellidos,
    direccion: c.direccion,
    telefono: c.telefono,
    email: c.email,
    rut: c.rut,
    comentario: c.comentario,
    estado_civil: c.estadoCivil,
    ciudad: c.ciudad,
    casa_habita: c.casaHabita,
    estudios: c.estudios,
    seguimiento: c.seguimiento,
    seguimiento_comentario_1: c.seguimientoComentario1,
    seguimiento_comentario_2: c.seguimientoComentario2,
    seguimiento_comentario_3: c.seguimientoComentario3,
    creado_por: c.creadoPor,
    updated_at: new Date().toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ventaFromDb(row: any): Venta {
  return {
    id: String(row.id ?? ""),
    ejecutiva: String(row.ejecutiva ?? ""),
    fechaVenta: String(row.fecha_venta ?? ""),
    sucursal: String(row.sucursal ?? ""),
    clienteId: String(row.cliente_id ?? ""),
    clienteNombre: String(row.cliente_nombre ?? ""),
    informeTecnico: row.informe_tecnico ?? null,
    informeTecnicoName: row.informe_tecnico_name ?? null,
    patente: String(row.patente ?? ""),
    marca: String(row.marca ?? ""),
    modelo: String(row.modelo ?? ""),
    anioVehiculo: String(row.anio_vehiculo ?? ""),
    colorVehiculo: String(row.color_vehiculo ?? ""),
    kilometrajeVehiculo: Number(row.kilometraje_vehiculo ?? 0),
    precioRetoma: Number(row.precio_retoma ?? 0),
    precioPublicado: Number(row.precio_publicado ?? 0),
    precioVenta: Number(row.precio_venta ?? 0),
    margenBruto: Number(row.margen_bruto ?? 0),
    nCredito: String(row.n_credito ?? ""),
    comisionCredito: Number(row.comision_credito ?? 0),
    gastosAdmin: Number(row.gastos_admin ?? 0),
    precioVtaFinal: Number(row.precio_vta_final ?? 0),
    creditoFirmado: String(row.credito_firmado ?? ""),
    creditoFirmadoDoc: row.credito_firmado_doc ?? null,
    creditoFirmadoDocName: row.credito_firmado_doc_name ?? null,
    montoPieCaja: Number(row.monto_pie_caja ?? 0),
    prepago: String(row.prepago ?? ""),
    prepagoDoc: row.prepago_doc ?? null,
    prepagoDocName: row.prepago_doc_name ?? null,
    documentacionVenta: row.documentacion_venta ?? null,
    documentacionVentaName: row.documentacion_venta_name ?? null,
    tipoVenta: (row.tipo_venta ?? "EFECTIVO") as Venta["tipoVenta"],
    estado: (row.estado ?? "BORRADOR") as Venta["estado"],
    verificacion: Boolean(row.verificacion ?? false),
  };
}

/** Payload de insert/update (sin id). fecha_venta vacia → null (columna timestamp). */
function ventaToDb(v: Omit<Venta, "id">) {
  return {
    ejecutiva: v.ejecutiva,
    fecha_venta: v.fechaVenta || null,
    sucursal: v.sucursal,
    cliente_id: v.clienteId,
    cliente_nombre: v.clienteNombre,
    informe_tecnico: v.informeTecnico,
    informe_tecnico_name: v.informeTecnicoName,
    patente: v.patente,
    marca: v.marca,
    modelo: v.modelo,
    anio_vehiculo: v.anioVehiculo,
    color_vehiculo: v.colorVehiculo,
    kilometraje_vehiculo: v.kilometrajeVehiculo,
    precio_retoma: v.precioRetoma,
    precio_publicado: v.precioPublicado,
    precio_venta: v.precioVenta,
    margen_bruto: v.margenBruto,
    n_credito: v.nCredito,
    comision_credito: v.comisionCredito,
    gastos_admin: v.gastosAdmin,
    precio_vta_final: v.precioVtaFinal,
    credito_firmado: v.creditoFirmado,
    credito_firmado_doc: v.creditoFirmadoDoc,
    credito_firmado_doc_name: v.creditoFirmadoDocName,
    monto_pie_caja: v.montoPieCaja,
    prepago: v.prepago,
    prepago_doc: v.prepagoDoc,
    prepago_doc_name: v.prepagoDocName,
    documentacion_venta: v.documentacionVenta,
    documentacion_venta_name: v.documentacionVentaName,
    tipo_venta: v.tipoVenta,
    estado: v.estado,
    verificacion: v.verificacion,
    updated_at: new Date().toISOString(),
  };
}

// ─── Mapeos CuentaPagar / CuentaCobrar / Adquisicion ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cuentaPagarFromDb(row: any): CuentaPagar {
  return {
    id: String(row.id ?? ""),
    concepto: String(row.concepto ?? ""),
    vehiculo: String(row.vehiculo ?? ""),
    clientePagar: String(row.cliente_pagar ?? ""),
    duenio: String(row.duenio ?? ""),
    sePagaA: String(row.se_paga_a ?? ""),
    cuentaCliente: String(row.cuenta_cliente ?? ""),
    montoTotal: Number(row.monto_total ?? 0),
    pagadoFecha: row.pagado_fecha ?? "",
    fechaVencimiento: String(row.fecha_vencimiento ?? ""),
    fechaUltimoPago: String(row.fecha_ultimo_pago ?? ""),
  };
}

function cuentaPagarToDb(c: Omit<CuentaPagar, "id">) {
  return {
    concepto: c.concepto,
    vehiculo: c.vehiculo,
    cliente_pagar: c.clientePagar,
    duenio: c.duenio,
    se_paga_a: c.sePagaA,
    cuenta_cliente: c.cuentaCliente,
    monto_total: c.montoTotal,
    pagado_fecha: String(c.pagadoFecha ?? ""),
    fecha_vencimiento: c.fechaVencimiento,
    fecha_ultimo_pago: c.fechaUltimoPago,
    updated_at: new Date().toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cuentaCobrarFromDb(row: any): CuentaCobrar {
  return {
    id: String(row.id ?? ""),
    idVenta: String(row.id_venta ?? ""),
    patente: String(row.patente ?? ""),
    fechaVenta: String(row.fecha_venta ?? ""),
    idComprador: String(row.id_comprador ?? ""),
    nombreComprador: String(row.nombre_comprador ?? ""),
    precioVenta: Number(row.precio_venta ?? 0),
    comisionCredito: Number(row.comision_credito ?? 0),
    tipoFinanciamiento: String(row.tipo_financiamiento ?? ""),
  };
}

function cuentaCobrarToDb(c: Omit<CuentaCobrar, "id">) {
  return {
    id_venta: c.idVenta,
    patente: c.patente,
    fecha_venta: c.fechaVenta,
    id_comprador: c.idComprador,
    nombre_comprador: c.nombreComprador,
    precio_venta: c.precioVenta,
    comision_credito: c.comisionCredito,
    tipo_financiamiento: c.tipoFinanciamiento,
    updated_at: new Date().toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adquisicionFromDb(row: any): Adquisicion {
  return {
    id: String(row.id ?? ""),
    empresa: String(row.empresa ?? ""),
    tipoProcedencia: String(row.tipo_procedencia ?? ""),
    observaciones: String(row.observaciones ?? ""),
    patente: String(row.patente ?? ""),
    marca: String(row.marca ?? ""),
    modelo: String(row.modelo ?? ""),
    anio: String(row.anio ?? ""),
    kilometraje: String(row.kilometraje ?? ""),
    tipo: String(row.tipo ?? ""),
    color: String(row.color ?? ""),
    obsVehiculo: String(row.obs_vehiculo ?? ""),
    precioOriginal: Number(row.precio_original ?? 0),
    fechaCompra: String(row.fecha_compra ?? ""),
    gastosExtra: (row.gastos_extra as Adquisicion["gastosExtra"]) ?? [],
    costoTotal: Number(row.costo_total ?? 0),
    precioSugerido: Number(row.precio_sugerido ?? 0),
  };
}

function adquisicionToDb(a: Omit<Adquisicion, "id">) {
  return {
    empresa: a.empresa,
    tipo_procedencia: a.tipoProcedencia,
    observaciones: a.observaciones,
    patente: a.patente,
    marca: a.marca,
    modelo: a.modelo,
    anio: a.anio,
    kilometraje: a.kilometraje,
    tipo: a.tipo,
    color: a.color,
    obs_vehiculo: a.obsVehiculo,
    precio_original: a.precioOriginal,
    fecha_compra: a.fechaCompra,
    gastos_extra: a.gastosExtra,
    costo_total: a.costoTotal,
    precio_sugerido: a.precioSugerido,
    updated_at: new Date().toISOString(),
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppState {
  clientes: Cliente[];
  setClientes: (c: Cliente[]) => void;
  /** Crea el cliente en la DB; devuelve el cliente con su id real o null si fallo. */
  addCliente: (c: Omit<Cliente, "id">) => Promise<Cliente | null>;
  updateCliente: (c: Cliente) => Promise<boolean>;
  deleteCliente: (id: string) => Promise<boolean>;
  vehiculos: Vehiculo[];
  setVehiculos: (v: Vehiculo[]) => void;
  addVehiculo: (v: Vehiculo) => Promise<void>;
  updateVehiculo: (v: Vehiculo) => Promise<void>;
  deleteVehiculo: (id: string) => Promise<void>;
  vehiculosLoading: boolean;
  consignatarios: Consignatario[];
  setConsignatarios: (c: Consignatario[]) => void;
  ventas: Venta[];
  setVentas: (v: Venta[]) => void;
  /** Crea la venta en la DB; devuelve la venta con su id real o null si fallo. */
  addVenta: (v: Omit<Venta, "id">) => Promise<Venta | null>;
  updateVenta: (v: Venta) => Promise<boolean>;
  deleteVenta: (id: string) => Promise<boolean>;
  cuentasPagar: CuentaPagar[];
  setCuentasPagar: (c: CuentaPagar[]) => void;
  addCuentaPagar: (c: Omit<CuentaPagar, "id">) => Promise<CuentaPagar | null>;
  updateCuentaPagar: (c: CuentaPagar) => Promise<boolean>;
  deleteCuentaPagar: (id: string) => Promise<boolean>;
  cuentasCobrar: CuentaCobrar[];
  setCuentasCobrar: (c: CuentaCobrar[]) => void;
  addCuentaCobrar: (c: Omit<CuentaCobrar, "id">) => Promise<CuentaCobrar | null>;
  updateCuentaCobrar: (c: CuentaCobrar) => Promise<boolean>;
  deleteCuentaCobrar: (id: string) => Promise<boolean>;
  adquisiciones: Adquisicion[];
  setAdquisiciones: (a: Adquisicion[]) => void;
  addAdquisicion: (a: Omit<Adquisicion, "id">) => Promise<Adquisicion | null>;
  deleteAdquisicion: (id: string) => Promise<boolean>;
  usuarios: Usuario[];
  setUsuarios: (u: Usuario[]) => void;
  usuarioActual: Usuario | null;
  setUsuarioActual: (u: Usuario | null) => void;
}

const AppContext = createContext<AppState>({} as AppState);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [vehiculosLoading, setVehiculosLoading] = useState(true);
  const [consignatarios, setConsignatarios] = useState<Consignatario[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cuentasPagar, setCuentasPagar] = useState<CuentaPagar[]>([]);
  const [cuentasCobrar, setCuentasCobrar] = useState<CuentaCobrar[]>([]);
  const [adquisiciones, setAdquisiciones] = useState<Adquisicion[]>([]);
  const [usuarios, setUsuariosInternal] = useState<Usuario[]>([]);
  const setUsuarios = (u: Usuario[]) => { setUsuariosInternal(u); };
  const [usuarioActual, setUsuarioActualInternal] = useState<Usuario | null>(() => {
    try {
      const saved = localStorage.getItem("ea_usuario_actual");
      if (saved) return JSON.parse(saved) as Usuario;
    } catch {}
    return null;
  });
  const setUsuarioActual = (u: Usuario | null) => {
    setUsuarioActualInternal(u);
    if (u) localStorage.setItem("ea_usuario_actual", JSON.stringify(u));
    else localStorage.removeItem("ea_usuario_actual");
  };

  // Load usuarios from DB (single source of truth)
  useEffect(() => {
    const loadUsuarios = async () => {
      const { data, error } = await supabase
        .from("vendedores")
        .select("id, nombre, email, telefono, clave, rol")
        .eq("activo", true)
        .order("created_at", { ascending: true });

      if (error || !data) return;

      const loaded = data.map(vendedorToUsuario);
      setUsuariosInternal(loaded);

      // Sync current user with fresh DB data
      const currentUser = (() => {
        try {
          const saved = localStorage.getItem("ea_usuario_actual");
          return saved ? JSON.parse(saved) as Usuario : null;
        } catch { return null; }
      })();

      if (currentUser) {
        const match = loaded.find(u =>
          u.id === currentUser.id ||
          (currentUser.email && u.email === currentUser.email.trim().toLowerCase()) ||
          `${u.nombre} ${u.apellido}`.trim().toLowerCase() === `${currentUser.nombre} ${currentUser.apellido}`.trim().toLowerCase()
        );
        if (match) {
          setUsuarioActualInternal(match);
          localStorage.setItem("ea_usuario_actual", JSON.stringify(match));
        }
      }
    };

    loadUsuarios();
  }, []);

  // ── Load vehicles from DB on mount ─────────────────────────────────────────
  useEffect(() => {
    const loadVehiculos = async () => {
      setVehiculosLoading(true);
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from("vehiculos")
          .select("*")
          // Orden: ultima vez modificado (o creado si nunca se actualizo) primero
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(from, to),
      );
      if (rows) setVehiculos(rows.map(row => fromDb(row)));
      setVehiculosLoading(false);
    };
    loadVehiculos();
  }, []);

  // ── Load clientes from DB on mount ─────────────────────────────────────────
  useEffect(() => {
    const loadClientes = async () => {
      const data = await fetchAllRows((from, to) =>
        supabase
          .from("clientes")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, to),
      );
      if (!data) return;
      setClientes(data.map(clienteFromDb));
    };
    loadClientes();
  }, []);

  // ── Load consignatarios from DB on mount ───────────────────────────────────
  useEffect(() => {
    const loadConsignatarios = async () => {
      const data = await fetchAllRows((from, to) =>
        supabase
          .from("consignatarios")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, to),
      );
      if (!data) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: Consignatario[] = data.map((row: any) => ({
        id: String(row.id ?? ""),
        nombre: String(row.nombre ?? "") + (row.apellidos ? ` ${row.apellidos}` : ""),
        rut: String(row.rut ?? ""),
        telefono: String(row.telefono ?? ""),
        email: String(row.email ?? ""),
        vehiculo: String(row.vehiculo ?? ""),
        patente: String(row.patente ?? ""),
        precio: Number(row.precio ?? 0),
        estado: String(row.estado ?? "ACTIVO"),
        contrato: row.contrato ?? null,
        contratoName: row.contrato_name ?? null,
        fechaIngreso: String(row.fecha_ingreso ?? row.created_at ?? ""),
      }));
      setConsignatarios(mapped);
    };
    loadConsignatarios();
  }, []);

  // ── Load ventas from DB on mount ───────────────────────────────────────────
  useEffect(() => {
    const loadVentas = async () => {
      const data = await fetchAllRows((from, to) =>
        supabase
          .from("ventas")
          .select("*")
          .order("fecha_venta", { ascending: false })
          .range(from, to),
      );
      if (!data) return;
      setVentas(data.map(ventaFromDb));
    };
    loadVentas();
  }, []);

  // ── Load cuentas y adquisiciones from DB on mount ──────────────────────────
  useEffect(() => {
    const load = async () => {
      const [pagar, cobrar, adq] = await Promise.all([
        fetchAllRows((from, to) => supabase.from("cuentas_pagar").select("*").order("created_at", { ascending: false }).range(from, to)),
        fetchAllRows((from, to) => supabase.from("cuentas_cobrar").select("*").order("created_at", { ascending: false }).range(from, to)),
        fetchAllRows((from, to) => supabase.from("adquisiciones").select("*").order("created_at", { ascending: false }).range(from, to)),
      ]);
      if (pagar) setCuentasPagar(pagar.map(cuentaPagarFromDb));
      if (cobrar) setCuentasCobrar(cobrar.map(cuentaCobrarFromDb));
      if (adq) setAdquisiciones(adq.map(adquisicionFromDb));
    };
    load();
  }, []);

  // ── CRUD ────────────────────────────────────────────────────────────────────
  const addVehiculo = async (v: Vehiculo) => {
    const { data, error } = await supabase
      .from("vehiculos")
      .insert(toDb(v))
      .select()
      .single();
    if (!error && data) {
      setVehiculos(prev => [fromDb(data as Record<string, unknown>), ...prev]);
    }
  };

  const updateVehiculo = async (v: Vehiculo) => {
    const { data, error } = await supabase
      .from("vehiculos")
      .update(toDb(v))
      .eq("id", v.id)
      .select()
      .single();
    if (!error && data) {
      const updated = fromDb(data as Record<string, unknown>);
      // Mover el vehiculo actualizado al inicio (ordenado por ultima modificacion)
      setVehiculos(prev => [updated, ...prev.filter(x => x.id !== v.id)]);
    }
  };

  const deleteVehiculo = async (id: string) => {
    const { error } = await supabase.from("vehiculos").delete().eq("id", id);
    if (!error) {
      setVehiculos(prev => prev.filter(x => x.id !== id));
    }
  };

  // Clientes: persistir en DB (antes solo se mutaba el estado local y los
  // clientes creados desaparecian al recargar la pagina).
  const addCliente = async (c: Omit<Cliente, "id">): Promise<Cliente | null> => {
    const { data, error } = await supabase
      .from("clientes")
      .insert(clienteToDb(c))
      .select()
      .single();
    if (error || !data) {
      alert(`No se pudo guardar el cliente: ${error?.message ?? "error desconocido"}`);
      return null;
    }
    const nuevo = clienteFromDb(data);
    setClientes(prev => [nuevo, ...prev]);
    return nuevo;
  };

  const updateCliente = async (c: Cliente): Promise<boolean> => {
    const { data, error } = await supabase
      .from("clientes")
      .update(clienteToDb(c))
      .eq("id", c.id)
      .select()
      .single();
    if (error || !data) {
      alert(`No se pudo actualizar el cliente: ${error?.message ?? "error desconocido"}`);
      return false;
    }
    const updated = clienteFromDb(data);
    setClientes(prev => prev.map(x => (x.id === c.id ? updated : x)));
    return true;
  };

  const deleteCliente = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) {
      alert(`No se pudo eliminar el cliente: ${error.message}`);
      return false;
    }
    setClientes(prev => prev.filter(x => x.id !== id));
    return true;
  };

  // Ventas: persistir en DB (mismo problema que clientes — crear, editar y
  // validar ventas solo vivia en memoria).
  const addVenta = async (v: Omit<Venta, "id">): Promise<Venta | null> => {
    const { data, error } = await supabase
      .from("ventas")
      .insert(ventaToDb(v))
      .select()
      .single();
    if (error || !data) {
      alert(`No se pudo guardar la venta: ${error?.message ?? "error desconocido"}`);
      return null;
    }
    const nueva = ventaFromDb(data);
    setVentas(prev => [nueva, ...prev]);
    return nueva;
  };

  const updateVenta = async (v: Venta): Promise<boolean> => {
    const { data, error } = await supabase
      .from("ventas")
      .update(ventaToDb(v))
      .eq("id", v.id)
      .select()
      .single();
    if (error || !data) {
      alert(`No se pudo actualizar la venta: ${error?.message ?? "error desconocido"}`);
      return false;
    }
    const updated = ventaFromDb(data);
    setVentas(prev => prev.map(x => (x.id === v.id ? updated : x)));
    return true;
  };

  const deleteVenta = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from("ventas").delete().eq("id", id);
    if (error) {
      alert(`No se pudo eliminar la venta: ${error.message}`);
      return false;
    }
    setVentas(prev => prev.filter(x => x.id !== id));
    return true;
  };

  // Cuentas por pagar / cobrar y adquisiciones: persistentes en DB
  const addCuentaPagar = async (c: Omit<CuentaPagar, "id">): Promise<CuentaPagar | null> => {
    const { data, error } = await supabase.from("cuentas_pagar").insert(cuentaPagarToDb(c)).select().single();
    if (error || !data) { alert(`No se pudo guardar la cuenta por pagar: ${error?.message}`); return null; }
    const nueva = cuentaPagarFromDb(data);
    setCuentasPagar(prev => [nueva, ...prev]);
    return nueva;
  };

  const updateCuentaPagar = async (c: CuentaPagar): Promise<boolean> => {
    const { data, error } = await supabase.from("cuentas_pagar").update(cuentaPagarToDb(c)).eq("id", c.id).select().single();
    if (error || !data) { alert(`No se pudo actualizar la cuenta por pagar: ${error?.message}`); return false; }
    setCuentasPagar(prev => prev.map(x => (x.id === c.id ? cuentaPagarFromDb(data) : x)));
    return true;
  };

  const deleteCuentaPagar = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from("cuentas_pagar").delete().eq("id", id);
    if (error) { alert(`No se pudo eliminar la cuenta por pagar: ${error.message}`); return false; }
    setCuentasPagar(prev => prev.filter(x => x.id !== id));
    return true;
  };

  const addCuentaCobrar = async (c: Omit<CuentaCobrar, "id">): Promise<CuentaCobrar | null> => {
    const { data, error } = await supabase.from("cuentas_cobrar").insert(cuentaCobrarToDb(c)).select().single();
    if (error || !data) { alert(`No se pudo guardar la cuenta por cobrar: ${error?.message}`); return null; }
    const nueva = cuentaCobrarFromDb(data);
    setCuentasCobrar(prev => [nueva, ...prev]);
    return nueva;
  };

  const updateCuentaCobrar = async (c: CuentaCobrar): Promise<boolean> => {
    const { data, error } = await supabase.from("cuentas_cobrar").update(cuentaCobrarToDb(c)).eq("id", c.id).select().single();
    if (error || !data) { alert(`No se pudo actualizar la cuenta por cobrar: ${error?.message}`); return false; }
    setCuentasCobrar(prev => prev.map(x => (x.id === c.id ? cuentaCobrarFromDb(data) : x)));
    return true;
  };

  const deleteCuentaCobrar = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from("cuentas_cobrar").delete().eq("id", id);
    if (error) { alert(`No se pudo eliminar la cuenta por cobrar: ${error.message}`); return false; }
    setCuentasCobrar(prev => prev.filter(x => x.id !== id));
    return true;
  };

  const addAdquisicion = async (a: Omit<Adquisicion, "id">): Promise<Adquisicion | null> => {
    const { data, error } = await supabase.from("adquisiciones").insert(adquisicionToDb(a)).select().single();
    if (error || !data) { alert(`No se pudo guardar la adquisicion: ${error?.message}`); return null; }
    const nueva = adquisicionFromDb(data);
    setAdquisiciones(prev => [nueva, ...prev]);
    return nueva;
  };

  const deleteAdquisicion = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from("adquisiciones").delete().eq("id", id);
    if (error) { alert(`No se pudo eliminar la adquisicion: ${error.message}`); return false; }
    setAdquisiciones(prev => prev.filter(x => x.id !== id));
    return true;
  };

  return (
    <AppContext.Provider value={{
      clientes, setClientes,
      addCliente, updateCliente, deleteCliente,
      vehiculos, setVehiculos,
      addVehiculo, updateVehiculo, deleteVehiculo,
      vehiculosLoading,
      consignatarios, setConsignatarios,
      ventas, setVentas,
      addVenta, updateVenta, deleteVenta,
      cuentasPagar, setCuentasPagar,
      addCuentaPagar, updateCuentaPagar, deleteCuentaPagar,
      cuentasCobrar, setCuentasCobrar,
      addCuentaCobrar, updateCuentaCobrar, deleteCuentaCobrar,
      adquisiciones, setAdquisiciones,
      addAdquisicion, deleteAdquisicion,
      usuarios, setUsuarios,
      usuarioActual, setUsuarioActual,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
