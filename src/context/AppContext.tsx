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

const USUARIOS_INICIALES: Usuario[] = [
  { id: "1", nombre: "César", apellido: "", telefono: "", clave: "123cuatro", rol: "master", email: "cesar@egana.cl" },
  { id: "2", nombre: "Pamela", apellido: "V.", telefono: "", clave: "pamela123", rol: "administracion", email: "pamela@egana.cl" },
  { id: "3", nombre: "Nicol", apellido: "M.", telefono: "", clave: "nicol123", rol: "vendedor", email: "nicol@egana.cl" },
];

function loadUsuariosFromStorage(): Usuario[] {
  try {
    const saved = localStorage.getItem("ea_usuarios_sistema");
    if (saved) {
      const parsed = JSON.parse(saved) as Usuario[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return USUARIOS_INICIALES;
}

function saveUsuariosToStorage(usuarios: Usuario[]) {
  localStorage.setItem("ea_usuarios_sistema", JSON.stringify(usuarios));
}

type VendedorUsuarioRow = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  clave: string | null;
  activo: boolean | null;
  rol: string | null;
  created_at: string;
};

function normalizeUserValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizePhoneValue(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").trim();
}

function splitNombreCompleto(nombreCompleto: string) {
  const limpio = nombreCompleto.trim().replace(/\s+/g, " ");
  if (!limpio) return { nombre: "", apellido: "" };

  const [nombre, ...resto] = limpio.split(" ");
  return {
    nombre,
    apellido: resto.join(" "),
  };
}

function getUsuarioMergeKeys(usuario: Pick<Usuario, "nombre" | "apellido" | "email" | "telefono">) {
  const keys = new Set<string>();
  const email = normalizeUserValue(usuario.email);
  const nombreCompleto = normalizeUserValue(`${usuario.nombre} ${usuario.apellido}`);
  const telefono = normalizePhoneValue(usuario.telefono);

  if (email) keys.add(`email:${email}`);
  if (nombreCompleto) keys.add(`name:${nombreCompleto}`);
  if (nombreCompleto && telefono) keys.add(`name-phone:${nombreCompleto}:${telefono}`);

  return Array.from(keys);
}

function getVendedorMergeKeys(vendedor: Pick<VendedorUsuarioRow, "nombre" | "email" | "telefono">) {
  const keys = new Set<string>();
  const email = normalizeUserValue(vendedor.email);
  const nombre = normalizeUserValue(vendedor.nombre);
  const telefono = normalizePhoneValue(vendedor.telefono);

  if (email) keys.add(`email:${email}`);
  if (nombre) keys.add(`name:${nombre}`);
  if (nombre && telefono) keys.add(`name-phone:${nombre}:${telefono}`);

  return Array.from(keys);
}

function vendedorScore(vendedor: VendedorUsuarioRow) {
  return (normalizeUserValue(vendedor.email) ? 2 : 0) + (normalizePhoneValue(vendedor.telefono) ? 1 : 0);
}

function dedupeVendedores(vendedores: VendedorUsuarioRow[]) {
  const byKey = new Map<string, VendedorUsuarioRow>();

  vendedores
    .filter((vendedor) => vendedor.activo !== false)
    .forEach((vendedor) => {
      const key = normalizeUserValue(vendedor.email)
        ? `email:${normalizeUserValue(vendedor.email)}`
        : `name:${normalizeUserValue(vendedor.nombre)}`;

      const current = byKey.get(key);
      if (!current || vendedorScore(vendedor) > vendedorScore(current)) {
        byKey.set(key, vendedor);
      }
    });

  return Array.from(byKey.values());
}

function mergeUsuariosWithVendedores(baseUsuarios: Usuario[], vendedores: VendedorUsuarioRow[]) {
  const merged = [...baseUsuarios];
  const keyToIndex = new Map<string, number>();

  merged.forEach((usuario, index) => {
    getUsuarioMergeKeys(usuario).forEach((key) => keyToIndex.set(key, index));
  });

  dedupeVendedores(vendedores).forEach((vendedor) => {
    const matchedIndex = getVendedorMergeKeys(vendedor)
      .map((key) => keyToIndex.get(key))
      .find((index): index is number => typeof index === "number");

    const nombreSeparado = splitNombreCompleto(vendedor.nombre);
    const validRoles: Usuario["rol"][] = ["master", "administracion", "vendedor"];
    const vendedorRol = validRoles.includes(vendedor.rol as Usuario["rol"]) ? (vendedor.rol as Usuario["rol"]) : "vendedor";
    const restoredUser: Usuario = {
      id: vendedor.id,
      nombre: nombreSeparado.nombre,
      apellido: nombreSeparado.apellido,
      telefono: vendedor.telefono ?? "",
      clave: vendedor.clave ?? "",
      rol: vendedorRol,
      email: normalizeUserValue(vendedor.email),
    };

    if (typeof matchedIndex === "number") {
      const existing = merged[matchedIndex];
      const mergedUser: Usuario = {
        ...restoredUser,
        ...existing,
        id: restoredUser.id || existing.id,
        telefono: existing.telefono || restoredUser.telefono,
        email: existing.email || restoredUser.email,
        clave: existing.clave || restoredUser.clave,
      };

      merged[matchedIndex] = mergedUser;
      getUsuarioMergeKeys(mergedUser).forEach((key) => keyToIndex.set(key, matchedIndex));
      return;
    }

    merged.push(restoredUser);
    const newIndex = merged.length - 1;
    getUsuarioMergeKeys(restoredUser).forEach((key) => keyToIndex.set(key, newIndex));
  });

  return merged;
}

function findMatchingUsuario(usuario: Usuario | null, usuarios: Usuario[]) {
  if (!usuario) return null;

  const email = normalizeUserValue(usuario.email);
  const nombreCompleto = normalizeUserValue(`${usuario.nombre} ${usuario.apellido}`);

  return usuarios.find((item) =>
    item.id === usuario.id ||
    (email && normalizeUserValue(item.email) === email) ||
    normalizeUserValue(`${item.nombre} ${item.apellido}`) === nombreCompleto
  ) ?? null;
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
    updated_at: new Date().toISOString(),
  };
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
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppState {
  clientes: Cliente[];
  setClientes: (c: Cliente[]) => void;
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
  cuentasPagar: CuentaPagar[];
  setCuentasPagar: (c: CuentaPagar[]) => void;
  cuentasCobrar: CuentaCobrar[];
  setCuentasCobrar: (c: CuentaCobrar[]) => void;
  adquisiciones: Adquisicion[];
  setAdquisiciones: (a: Adquisicion[]) => void;
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
  const [usuarios, setUsuariosInternal] = useState<Usuario[]>(loadUsuariosFromStorage);
  const setUsuarios = (u: Usuario[]) => { setUsuariosInternal(u); saveUsuariosToStorage(u); };
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

  useEffect(() => {
    const restoreUsuariosFromBackend = async () => {
      const { data, error } = await supabase
        .from("vendedores")
        .select("id, nombre, email, telefono, clave, activo, rol, created_at")
        .eq("activo", true)
        .order("created_at", { ascending: true });

      if (error || !data) return;

      const restoredUsuarios = mergeUsuariosWithVendedores(
        loadUsuariosFromStorage(),
        data as VendedorUsuarioRow[]
      );

      setUsuariosInternal(restoredUsuarios);
      saveUsuariosToStorage(restoredUsuarios);

      const usuarioSincronizado = findMatchingUsuario(usuarioActual, restoredUsuarios);
      if (usuarioSincronizado) {
        setUsuarioActualInternal(usuarioSincronizado);
        localStorage.setItem("ea_usuario_actual", JSON.stringify(usuarioSincronizado));
      }
    };

    restoreUsuariosFromBackend();
  }, []);

  // ── Load vehicles from DB on mount ─────────────────────────────────────────
  useEffect(() => {
    const loadVehiculos = async () => {
      setVehiculosLoading(true);
      const { data, error } = await supabase
        .from("vehiculos")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        setVehiculos(data.map(row => fromDb(row as Record<string, unknown>)));
      }
      setVehiculosLoading(false);
    };
    loadVehiculos();
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
      setVehiculos(prev =>
        prev.map(x => x.id === v.id ? fromDb(data as Record<string, unknown>) : x)
      );
    }
  };

  const deleteVehiculo = async (id: string) => {
    const { error } = await supabase.from("vehiculos").delete().eq("id", id);
    if (!error) {
      setVehiculos(prev => prev.filter(x => x.id !== id));
    }
  };

  return (
    <AppContext.Provider value={{
      clientes, setClientes,
      vehiculos, setVehiculos,
      addVehiculo, updateVehiculo, deleteVehiculo,
      vehiculosLoading,
      consignatarios, setConsignatarios,
      ventas, setVentas,
      cuentasPagar, setCuentasPagar,
      cuentasCobrar, setCuentasCobrar,
      adquisiciones, setAdquisiciones,
      usuarios, setUsuarios,
      usuarioActual, setUsuarioActual,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
